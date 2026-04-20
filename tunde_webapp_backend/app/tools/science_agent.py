"""
Science Agent — LLM-backed structured science explanations (JSON contract).

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

SCIENCE_AGENT_SYSTEM_PROMPT = """You are a precise and engaging science educator. When given a science question:
1. Identify the domain: physics, biology, earth_science, or general
2. Give a clear structured explanation
3. List the key concepts involved
4. Provide one real-world example
5. Suggest 2-3 further reading topics
6. Flag if the topic is scientifically debated
7. Never fabricate facts — if unsure, say so
8. Always respond in JSON format:
{"domain": "...", "explanation": "...", "key_concepts": ["..."], "real_world_example": "...", "further_reading": ["..."], "confidence": "high/medium/low", "is_debated": false}
"""

_ALLOWED_DOMAINS = frozenset({"physics", "biology", "earth_science", "general"})


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


def _parse_bool(val: Any) -> bool:
    if isinstance(val, bool):
        return val
    if isinstance(val, str):
        return val.strip().lower() in ("true", "1", "yes", "y")
    if isinstance(val, (int, float)):
        return bool(val)
    return False


def _normalize_domain(raw: Any) -> str:
    if not isinstance(raw, str):
        raw = str(raw or "")
    t = raw.strip().lower().replace(" ", "_").replace("-", "_")
    if t in _ALLOWED_DOMAINS:
        return t
    if "earth" in t or t in ("geology", "climate", "meteorology", "weather"):
        return "earth_science"
    if "phys" in t:
        return "physics"
    if "bio" in t or "life_science" in t:
        return "biology"
    if "chem" in t:
        return "general"
    return "general"


def _string_list(raw: Any, *, max_items: int = 32) -> list[str]:
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


def _parse_response_json(raw: str) -> dict[str, Any]:
    cleaned = _strip_json_fence(raw)
    data = json.loads(cleaned)
    if not isinstance(data, dict):
        raise ValueError("response is not a JSON object")

    explanation = data.get("explanation")
    expl = explanation.strip() if isinstance(explanation, str) else (str(explanation).strip() if explanation else "")

    rw = data.get("real_world_example")
    example = rw.strip() if isinstance(rw, str) else (str(rw).strip() if rw else "")

    conf_raw = data.get("confidence")
    confidence = _normalize_confidence(conf_raw if isinstance(conf_raw, str) else str(conf_raw or ""))

    return {
        "domain": _normalize_domain(data.get("domain")),
        "explanation": expl,
        "key_concepts": _string_list(data.get("key_concepts")),
        "real_world_example": example,
        "further_reading": _string_list(data.get("further_reading"), max_items=16),
        "confidence": confidence,
        "is_debated": _parse_bool(data.get("is_debated")),
    }


def _fallback_from_raw(raw: str) -> dict[str, Any]:
    text = (raw or "").strip()
    return {
        "domain": "general",
        "explanation": text if text else "(No structured explanation returned.)",
        "key_concepts": [],
        "real_world_example": "",
        "further_reading": [],
        "confidence": "low",
        "is_debated": False,
    }


async def explain_science_question(question: str) -> dict[str, Any]:
    """
    Produce a structured science explanation via the configured LLM.

    Returns:
        dict matching ScienceAnswerResponse fields.
    """
    cleaned = (question or "").strip()
    if not cleaned:
        raise ValueError("question must be non-empty")

    settings = get_settings()
    client = resolve_llm_client(settings, TaskKind.STRUCTURED_JSON)

    try:
        raw = await asyncio.to_thread(client.complete, SCIENCE_AGENT_SYSTEM_PROMPT, cleaned)
    except LLMError:
        raise
    except Exception as exc:
        logger.exception("Science agent LLM call failed")
        raise LLMError(str(exc)) from exc

    try:
        return _parse_response_json(raw)
    except (json.JSONDecodeError, ValueError, TypeError) as exc:
        logger.warning("Science agent JSON parse failed, using fallback: %s", str(exc)[:160])
        return _fallback_from_raw(raw)
