"""
Translation Agent — LLM-backed structured translation (JSON contract).

Uses ``model_router.resolve_llm_client`` with ``TaskKind.STRUCTURED_JSON``.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Any

from tunde_agent.config.settings import get_settings
from tunde_agent.multi_agent.model_router import TaskKind, resolve_llm_client
from tunde_agent.services.llm_service import LLMError

logger = logging.getLogger(__name__)

TRANSLATION_SYSTEM_PROMPT = """You are an expert translator fluent in 50+ languages. When given text to translate:
1. Detect the source language automatically
2. Translate accurately preserving meaning and tone
3. Provide transliteration if target language uses different script
4. Suggest 2-3 alternative translations when relevant
5. Never translate harmful, violent, or illegal content
6. Always respond in JSON format:
{"source_language": "English", "target_language": "Arabic", "original_text": "...", "translated_text": "...", "transliteration": "...", "tone": "neutral", "confidence": "high", "alternative_translations": ["...", "..."]}
"""


def _strip_json_fence(text: str) -> str:
    s = (text or "").strip()
    m = re.match(r"^```(?:json)?\s*([\s\S]*?)\s*```$", s, re.IGNORECASE)
    if m:
        return m.group(1).strip()
    return s


def _normalize_confidence(raw: str) -> str:
    t = (raw or "").strip().lower()
    if t in ("high", "medium", "low"):
        return t
    if "high" in t:
        return "high"
    if "low" in t or "unsure" in t or "uncertain" in t:
        return "low"
    return "medium"


def _normalize_tone(raw: str) -> str:
    t = (raw or "").strip().lower()
    if t in ("formal", "informal", "neutral"):
        return t
    if "formal" in t:
        return "formal"
    if "informal" in t or "casual" in t:
        return "informal"
    return "neutral"


def _string_list_alternatives(raw: Any, *, max_items: int = 3) -> list[str]:
    out: list[str] = []
    if not isinstance(raw, list):
        return out
    for x in raw[:max_items]:
        if isinstance(x, str) and x.strip():
            out.append(x.strip())
        elif x is not None:
            s = str(x).strip()
            if s:
                out.append(s)
    return out


def _user_payload_message(text: str, target_language: str) -> str:
    t = (text or "").strip()
    tl = (target_language or "").strip()
    if tl:
        return f"Target language: {tl}\n\nText to translate:\n{t}"
    return t


def _parse_response_json(raw: str, *, original_input: str) -> dict[str, Any]:
    cleaned = _strip_json_fence(raw)
    data = json.loads(cleaned)
    if not isinstance(data, dict):
        raise ValueError("response is not a JSON object")

    orig = data.get("original_text")
    original_text = (
        orig.strip()
        if isinstance(orig, str)
        else (original_input.strip() if original_input else str(orig or "").strip())
    )
    if not original_text:
        original_text = original_input.strip()

    src = data.get("source_language")
    source_language = src.strip() if isinstance(src, str) else str(src or "").strip() or "unknown"

    tgt = data.get("target_language")
    target_language = tgt.strip() if isinstance(tgt, str) else str(tgt or "").strip() or "unspecified"

    trans = data.get("translated_text")
    translated_text = trans.strip() if isinstance(trans, str) else str(trans or "").strip()

    lit = data.get("transliteration")
    transliteration = lit.strip() if isinstance(lit, str) else (str(lit).strip() if lit else "")

    conf_raw = data.get("confidence")
    confidence = _normalize_confidence(conf_raw if isinstance(conf_raw, str) else str(conf_raw or ""))

    tone_raw = data.get("tone")
    tone = _normalize_tone(tone_raw if isinstance(tone_raw, str) else str(tone_raw or ""))

    alts = _string_list_alternatives(data.get("alternative_translations"), max_items=3)

    return {
        "source_language": source_language,
        "target_language": target_language,
        "original_text": original_text,
        "translated_text": translated_text,
        "transliteration": transliteration,
        "tone": tone,
        "confidence": confidence,
        "alternative_translations": alts,
    }


def _fallback_from_raw(raw: str, *, original_input: str) -> dict[str, Any]:
    text = (raw or "").strip()
    o = (original_input or "").strip()
    return {
        "source_language": "unknown",
        "target_language": "unspecified",
        "original_text": o,
        "translated_text": text if text else "(No structured translation returned.)",
        "transliteration": "",
        "tone": "neutral",
        "confidence": "low",
        "alternative_translations": [],
    }


async def translate_text(text: str, target_language: str = "") -> dict[str, Any]:
    """
    Produce structured translation via the configured LLM.

    Returns:
        dict matching TranslationAnswerResponse fields.
    """
    cleaned = (text or "").strip()
    if not cleaned:
        raise ValueError("text must be non-empty")

    user_msg = _user_payload_message(cleaned, target_language)

    settings = get_settings()
    client = resolve_llm_client(settings, TaskKind.STRUCTURED_JSON)

    try:
        raw = await asyncio.to_thread(client.complete, TRANSLATION_SYSTEM_PROMPT, user_msg)
    except LLMError:
        raise
    except Exception as exc:
        logger.exception("Translation agent LLM call failed")
        raise LLMError(str(exc)) from exc

    try:
        return _parse_response_json(raw, original_input=cleaned)
    except (json.JSONDecodeError, ValueError, TypeError) as exc:
        logger.warning("Translation agent JSON parse failed, using fallback: %s", str(exc)[:160])
        return _fallback_from_raw(raw, original_input=cleaned)
