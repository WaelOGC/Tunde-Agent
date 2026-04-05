"""
LLM abstraction: Google Gemini (official REST, via httpx) and DeepSeek (OpenAI-compatible REST).

No OpenAI SDK or endpoints.
"""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod
import httpx

from tunde_agent.config.settings import Settings
from tunde_agent.services.prompt_manager import PromptManager

logger = logging.getLogger(__name__)


class LLMError(Exception):
    """Provider or configuration failure."""


class BaseLLM(ABC):
    """Minimal contract for chat completion."""

    @abstractmethod
    def complete(self, system_prompt: str, user_message: str) -> str:
        """Return assistant text for a single user turn."""


class GeminiClient(BaseLLM):
    """Gemini via ``generativelanguage.googleapis.com`` REST (no deprecated ``google-generativeai`` SDK)."""

    _URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

    def __init__(self, api_key: str, model: str = "gemini-2.5-flash") -> None:
        if not api_key or not api_key.strip():
            raise LLMError("GEMINI_API_KEY is not set.")
        self._api_key = api_key.strip()
        m = (model or "").strip()
        if m.startswith("models/"):
            m = m[len("models/") :]
        self._model_name = m

    def complete(self, system_prompt: str, user_message: str) -> str:
        url = self._URL.format(model=self._model_name)
        payload = {
            "systemInstruction": {"parts": [{"text": system_prompt}]},
            "contents": [
                {
                    "role": "user",
                    "parts": [{"text": user_message}],
                }
            ],
        }
        try:
            with httpx.Client(timeout=120.0) as client:
                r = client.post(
                    url,
                    params={"key": self._api_key},
                    json=payload,
                )
                r.raise_for_status()
                data = r.json()
        except httpx.HTTPStatusError as e:
            detail = ""
            if e.response is not None:
                try:
                    detail = e.response.json().get("error", {}).get("message", e.response.text)
                except Exception:
                    detail = e.response.text[:500]
            logger.warning("Gemini HTTP %s: %s", e.response.status_code if e.response else "?", detail)
            raise LLMError(f"Gemini API error: {detail or e!s}") from e
        except httpx.RequestError as e:
            raise LLMError(f"Gemini request failed: {e!s}") from e

        text = _extract_gemini_text(data)
        if not text:
            raise LLMError("Gemini returned no text (safety filter or empty completion).")
        return text


def _extract_gemini_text(data: dict) -> str:
    parts: list[str] = []
    for c in data.get("candidates") or []:
        content = c.get("content") or {}
        for p in content.get("parts") or []:
            t = p.get("text")
            if t:
                parts.append(t)
    return "".join(parts).strip()


class DeepSeekClient(BaseLLM):
    """DeepSeek via OpenAI-compatible ``/v1/chat/completions`` (no OpenAI SDK)."""

    def __init__(
        self,
        api_key: str,
        model: str = "deepseek-chat",
        base_url: str = "https://api.deepseek.com",
    ) -> None:
        if not api_key or not api_key.strip():
            raise LLMError("DEEPSEEK_API_KEY is not set.")
        self._api_key = api_key.strip()
        self._model = model
        self._base_url = base_url.rstrip("/")

    def complete(self, system_prompt: str, user_message: str) -> str:
        payload = {
            "model": self._model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
            ],
        }
        try:
            with httpx.Client(timeout=120.0) as client:
                r = client.post(
                    f"{self._base_url}/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {self._api_key}",
                        "Content-Type": "application/json",
                    },
                    json=payload,
                )
                r.raise_for_status()
                data = r.json()
        except httpx.HTTPStatusError as e:
            body = e.response.text[:500] if e.response is not None else ""
            logger.warning("DeepSeek HTTP error: %s %s", e.response.status_code if e.response else "?", body)
            raise LLMError(f"DeepSeek API error: {e.response.status_code if e.response else 'unknown'}") from e
        except httpx.RequestError as e:
            raise LLMError(f"DeepSeek request failed: {e!s}") from e

        try:
            return (data["choices"][0]["message"]["content"] or "").strip()
        except (KeyError, IndexError, TypeError) as e:
            raise LLMError("Unexpected DeepSeek response shape.") from e


class LLMService:
    """Facade: persona system prompt + provider client."""

    def __init__(self, settings: Settings, prompt_manager: PromptManager) -> None:
        self._settings = settings
        self._prompts = prompt_manager
        self._client: BaseLLM = self._build_client()

    def _build_client(self) -> BaseLLM:
        provider = (self._settings.default_llm_provider or "gemini").strip().lower()
        if provider == "gemini":
            return GeminiClient(
                self._settings.gemini_api_key,
                model=self._settings.gemini_model,
            )
        if provider == "deepseek":
            return DeepSeekClient(
                self._settings.deepseek_api_key,
                model=self._settings.deepseek_model,
                base_url=self._settings.deepseek_base_url,
            )
        raise LLMError(f"Unsupported DEFAULT_LLM_PROVIDER: {provider!r}. Use 'gemini' or 'deepseek'.")

    def chat(self, user_message: str) -> str:
        system = self._prompts.system_prompt()
        return self._client.complete(system, user_message.strip())

    @property
    def provider_label(self) -> str:
        return (self._settings.default_llm_provider or "gemini").strip().lower()
