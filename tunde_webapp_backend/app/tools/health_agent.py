"""
Health Agent — LLM-backed structured health education (JSON contract).

Educational only — never diagnosis or prescriptions. Uses ``model_router`` with
``TaskKind.STRUCTURED_JSON``.
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

HEALTH_AGENT_DISCLAIMER = (
    "This is educational information only. Always consult a qualified healthcare professional."
)

HEALTH_AGENT_SYSTEM_PROMPT = """You are a careful and responsible health education assistant. When given a health question:
1. Identify the category: anatomy, disease, nutrition, mental_health, first_aid, medication, or general
2. Give a clear educational explanation — never diagnose
3. List 3-5 key health facts
4. Specify when the user should see a doctor
5. Flag TRUE for emergency_warning if symptoms suggest: chest pain, difficulty breathing, stroke signs, severe bleeding, or any life-threatening condition
6. Always cite reliable sources (WHO, NHS, Mayo Clinic, WebMD)
7. NEVER recommend specific medications or dosages
8. NEVER provide a diagnosis
9. Always respond in JSON format:
{"category": "...", "explanation": "...", "key_facts": ["..."], "when_to_see_doctor": "...", "emergency_warning": false, "sources": ["..."], "confidence": "high/medium/low", "disclaimer": "This is educational information only. Always consult a qualified healthcare professional."}
"""

_ALLOWED_CATEGORIES = frozenset(
    {"anatomy", "disease", "nutrition", "mental_health", "first_aid", "medication", "general"}
)


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


def _normalize_category(raw: Any) -> str:
    if not isinstance(raw, str):
        raw = str(raw or "")
    t = raw.strip().lower().replace(" ", "_").replace("-", "_")
    if t in _ALLOWED_CATEGORIES:
        return t
    if "mental" in t or "psych" in t:
        return "mental_health"
    if "first" in t and "aid" in t:
        return "first_aid"
    if "anatom" in t or "organ" in t:
        return "anatomy"
    if "nutri" in t or "diet" in t:
        return "nutrition"
    if "drug" in t or "medication" in t or "medicine" in t:
        return "medication"
    if "disease" in t or "condition" in t or "illness" in t:
        return "disease"
    return "general"


def _string_list(raw: Any, *, max_items: int = 16) -> list[str]:
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

    wsd = data.get("when_to_see_doctor")
    when_doc = wsd.strip() if isinstance(wsd, str) else (str(wsd).strip() if wsd else "")

    conf_raw = data.get("confidence")
    confidence = _normalize_confidence(conf_raw if isinstance(conf_raw, str) else str(conf_raw or ""))

    return {
        "category": _normalize_category(data.get("category")),
        "explanation": expl,
        "key_facts": _string_list(data.get("key_facts")),
        "when_to_see_doctor": when_doc,
        "emergency_warning": _parse_bool(data.get("emergency_warning")),
        "sources": _string_list(data.get("sources")),
        "confidence": confidence,
        "disclaimer": HEALTH_AGENT_DISCLAIMER,
    }


def _fallback_from_raw(raw: str) -> dict[str, Any]:
    text = (raw or "").strip()
    return {
        "category": "general",
        "explanation": text if text else "(No structured health response returned.)",
        "key_facts": [],
        "when_to_see_doctor": "If you have new, worsening, or concerning symptoms, contact a qualified healthcare professional.",
        "emergency_warning": False,
        "sources": ["https://www.who.int/", "https://www.nhs.uk/", "https://www.mayoclinic.org/"],
        "confidence": "low",
        "disclaimer": HEALTH_AGENT_DISCLAIMER,
    }


async def explain_health_question(question: str) -> dict[str, Any]:
    """
    Produce a structured health education response via the configured LLM.

    Returns:
        dict matching HealthAnswerResponse fields.
    """
    cleaned = (question or "").strip()
    if not cleaned:
        raise ValueError("question must be non-empty")

    settings = get_settings()
    client = resolve_llm_client(settings, TaskKind.STRUCTURED_JSON)

    try:
        raw = await asyncio.to_thread(client.complete, HEALTH_AGENT_SYSTEM_PROMPT, cleaned)
    except LLMError:
        raise
    except Exception as exc:
        logger.exception("Health agent LLM call failed")
        raise LLMError(str(exc)) from exc

    try:
        return _parse_response_json(raw)
    except (json.JSONDecodeError, ValueError, TypeError) as exc:
        logger.warning("Health agent JSON parse failed, using fallback: %s", str(exc)[:160])
        return _fallback_from_raw(raw)
