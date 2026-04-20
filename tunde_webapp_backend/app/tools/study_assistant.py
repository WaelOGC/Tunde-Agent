"""
Study Assistant — LLM-backed structured study plans (JSON contract).

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

STUDY_SYSTEM_PROMPT = """You are an expert educational coach and study assistant. When given a study topic:

1. Identify the topic and assess difficulty level
2. Write a clear, engaging summary
3. List the 5 most important key concepts
4. Create a practical step-by-step study plan
5. Provide memory tips and mnemonics to help retention
6. Generate 3 practice questions to test understanding
7. Estimate realistic study time
8. Include practice_hints: exactly 3 short hints (one per practice question) that guide thinking without giving away the full answer
9. Never encourage academic dishonesty (no completing graded exams or assignments for the student). Focus on learning, understanding, and honest self-assessment.
10. Where appropriate, name types of sources learners should consult (course texts, official docs, reputable primers)—never invent specific URLs, DOIs, or bibliographic metadata.

Always respond in JSON ONLY with this shape (no markdown fences outside the JSON):
{"topic": "...", "summary": "...", "key_concepts": ["..."], "study_plan": ["step 1...", "step 2..."], "memory_tips": ["..."], "practice_questions": ["Q1...", "Q2...", "Q3..."], "practice_hints": ["hint1", "hint2", "hint3"], "difficulty_level": "beginner/intermediate/advanced", "estimated_time": "...", "confidence": "high/medium/low"}
"""


def _strip_json_fence(text: str) -> str:
    s = (text or "").strip()
    m = re.match(r"^```(?:json)?\s*([\s\S]*?)\s*```$", s, re.IGNORECASE)
    if m:
        return m.group(1).strip()
    return s


_ALLOWED_DIFF = frozenset({"beginner", "intermediate", "advanced"})
_ALLOWED_CONF = frozenset({"high", "medium", "low"})


def _normalize_difficulty(raw: Any) -> str:
    t = (raw if isinstance(raw, str) else str(raw or "")).strip().lower()
    if t in _ALLOWED_DIFF:
        return t
    if "begin" in t or "intro" in t or "basic" in t:
        return "beginner"
    if "adv" in t or "expert" in t:
        return "advanced"
    return "intermediate"


def _normalize_confidence(raw: Any) -> str:
    t = (raw if isinstance(raw, str) else str(raw or "")).strip().lower()
    if t in _ALLOWED_CONF:
        return t
    if "high" in t:
        return "high"
    if "low" in t or "unsure" in t:
        return "low"
    return "medium"


def _string_list(raw: Any, *, max_items: int = 64) -> list[str]:
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

    topic_raw = data.get("topic")
    topic = topic_raw.strip() if isinstance(topic_raw, str) else str(topic_raw or "").strip()

    summ = data.get("summary")
    summary = summ.strip() if isinstance(summ, str) else str(summ or "").strip()

    key_concepts = _string_list(data.get("key_concepts"), max_items=8)[:5]
    study_plan = _string_list(data.get("study_plan"), max_items=32)
    memory_tips = _string_list(data.get("memory_tips"), max_items=24)
    practice_questions = _string_list(data.get("practice_questions"), max_items=8)[:3]
    practice_hints = _string_list(data.get("practice_hints"), max_items=8)[:3]

    while len(practice_hints) < len(practice_questions):
        practice_hints.append("Recall the main definitions from the summary and relate them to one example.")

    et_raw = data.get("estimated_time")
    estimated_time = et_raw.strip() if isinstance(et_raw, str) else str(et_raw or "").strip()
    if not estimated_time:
        estimated_time = "1–2 hours"

    return {
        "topic": topic or "Study topic",
        "summary": summary,
        "key_concepts": key_concepts,
        "study_plan": study_plan,
        "memory_tips": memory_tips,
        "practice_questions": practice_questions,
        "practice_hints": practice_hints[: len(practice_questions)] if practice_questions else [],
        "difficulty_level": _normalize_difficulty(data.get("difficulty_level")),
        "estimated_time": estimated_time,
        "confidence": _normalize_confidence(data.get("confidence")),
    }


def _fallback_from_raw(raw: str, *, question: str) -> dict[str, Any]:
    text = (raw or "").strip()
    q = (question or "").strip()
    return {
        "topic": q[:200] if q else "Study topic",
        "summary": text if text else "(No structured study response returned.)",
        "key_concepts": [],
        "study_plan": [],
        "memory_tips": [],
        "practice_questions": [],
        "practice_hints": [],
        "difficulty_level": "intermediate",
        "estimated_time": "—",
        "confidence": "low",
    }


async def study_topic(question: str) -> dict[str, Any]:
    """
    Produce structured study output via the configured LLM.
    """
    cleaned = (question or "").strip()
    if not cleaned:
        raise ValueError("question must be non-empty")

    settings = get_settings()
    client = resolve_llm_client(settings, TaskKind.STRUCTURED_JSON)

    try:
        raw = await asyncio.to_thread(client.complete, STUDY_SYSTEM_PROMPT, cleaned)
    except LLMError:
        raise
    except Exception as exc:
        logger.exception("Study assistant LLM call failed")
        raise LLMError(str(exc)) from exc

    try:
        return _parse_response_json(raw)
    except (json.JSONDecodeError, ValueError, TypeError) as exc:
        logger.warning("Study assistant JSON parse failed, using fallback: %s", str(exc)[:160])
        return _fallback_from_raw(raw, question=cleaned)
