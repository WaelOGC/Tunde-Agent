"""
Route LLM tasks to **Gemini** or **DeepSeek** by task shape (not a single global default).

Policy (override by extending ``TaskKind`` and ``resolve_llm_client`` when adding providers):

- **Vision / multimodal** → Gemini only (DeepSeek client has no vision here).
- **Structured JSON** (extractor, verifier, chart designer JSON) → DeepSeek when configured (strong
  instruction-following for JSON); else Gemini.
- **Orchestration JSON** (master plan / gate) → DeepSeek when configured; else Gemini.
- **Research synthesis & creative UI** (analyst prose, custom landing HTML) → Gemini when configured;
  else DeepSeek.

Adding a provider: implement ``BaseLLM`` in ``llm_service.py``, extend ``resolve_llm_client``, and keep
call sites on ``TaskKind`` — core orchestration stays unchanged.
"""

from __future__ import annotations

from enum import StrEnum

from tunde_agent.config.settings import Settings
from tunde_agent.services.llm_service import BaseLLM, LLMError, build_llm_client


class TaskKind(StrEnum):
    """Semantic task classes for provider selection."""

    RESEARCH_SYNTHESIS = "research_synthesis"
    STRUCTURED_JSON = "structured_json"
    ORCHESTRATION_JSON = "orchestration_json"
    CREATIVE_UI = "creative_ui"
    VISION = "vision"


def resolve_llm_client(settings: Settings, kind: TaskKind | str) -> BaseLLM:
    """
    Return a ``BaseLLM`` for ``kind``.

    Falls back across providers when the preferred key is missing so missions still run in dev.
    """
    k = TaskKind(kind) if isinstance(kind, str) else kind
    has_gemini = bool((settings.gemini_api_key or "").strip())
    has_deepseek = bool((settings.deepseek_api_key or "").strip())

    if k == TaskKind.VISION:
        if not has_gemini:
            raise LLMError("Gemini is required for vision tasks; set GEMINI_API_KEY.")
        return build_llm_client(settings, "gemini")

    if k in (TaskKind.STRUCTURED_JSON, TaskKind.ORCHESTRATION_JSON):
        if has_deepseek:
            return build_llm_client(settings, "deepseek")
        if has_gemini:
            return build_llm_client(settings, "gemini")
        raise LLMError("No LLM API key configured (need DEEPSEEK_API_KEY or GEMINI_API_KEY).")

    if k in (TaskKind.RESEARCH_SYNTHESIS, TaskKind.CREATIVE_UI):
        if has_gemini:
            return build_llm_client(settings, "gemini")
        if has_deepseek:
            return build_llm_client(settings, "deepseek")
        raise LLMError("No LLM API key configured (need GEMINI_API_KEY or DEEPSEEK_API_KEY).")

    raise LLMError(f"Unknown TaskKind: {k!r}")


def task_kind_for_research_role(role: str) -> TaskKind:
    """Map orchestration ``role`` strings (see ``sub_agents.llm_json``) to ``TaskKind``."""
    r = (role or "").strip().lower()
    if r in ("extractor", "verifier", "designer_llm"):
        return TaskKind.STRUCTURED_JSON
    if r in ("master_plan", "master_gate"):
        return TaskKind.ORCHESTRATION_JSON
    if r in ("vision",):
        return TaskKind.VISION
    if r in ("analyst",):
        return TaskKind.RESEARCH_SYNTHESIS
    return TaskKind.RESEARCH_SYNTHESIS
