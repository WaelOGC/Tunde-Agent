"""
Math Solver — LLM-backed step-by-step solutions (JSON contract).

Uses ``model_router.resolve_llm_client`` with ``TaskKind.STRUCTURED_JSON`` so the
same DeepSeek/Gemini policy as other structured outputs applies.
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

MATH_AGENT_SYSTEM_PROMPT = """You are a precise mathematics assistant. When given a math problem:
1. Identify the topic (algebra, calculus, geometry, etc.)
2. Show every step clearly and numbered
3. Give the final answer clearly labeled
4. If unsure, say so — never fabricate formulas
5. Always respond in JSON format:
{"steps": ["step1", "step2"], "answer": "...", "topic": "...", "confidence": "high/medium/low"}
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


def _parse_solution_json(raw: str) -> dict[str, Any]:
    cleaned = _strip_json_fence(raw)
    data = json.loads(cleaned)
    if not isinstance(data, dict):
        raise ValueError("response is not a JSON object")

    steps_raw = data.get("steps")
    steps: list[str] = []
    if isinstance(steps_raw, list):
        for s in steps_raw:
            if isinstance(s, str) and s.strip():
                steps.append(s.strip())
            elif s is not None:
                steps.append(str(s).strip())

    ans = data.get("answer")
    answer = ans.strip() if isinstance(ans, str) else (str(ans).strip() if ans is not None else "")

    top = data.get("topic")
    topic = top.strip() if isinstance(top, str) else "general"

    conf_raw = data.get("confidence")
    confidence = _normalize_confidence(conf_raw if isinstance(conf_raw, str) else str(conf_raw or ""))

    return {
        "steps": steps,
        "answer": answer,
        "topic": topic or "general",
        "confidence": confidence,
    }


def _fallback_from_raw(raw: str) -> dict[str, Any]:
    """When the model returns non-JSON prose, surface it safely."""
    text = (raw or "").strip()
    return {
        "steps": [text] if text else ["(No structured steps returned.)"],
        "answer": "",
        "topic": "unknown",
        "confidence": "low",
    }


async def solve_math_problem(problem: str) -> dict[str, Any]:
    """
    Solve a math problem via the configured LLM.

    Returns:
        dict with keys: steps (list[str]), answer (str), topic (str), confidence (str).
    """
    cleaned = (problem or "").strip()
    if not cleaned:
        raise ValueError("problem must be non-empty")

    settings = get_settings()
    client = resolve_llm_client(settings, TaskKind.STRUCTURED_JSON)

    try:
        raw = await asyncio.to_thread(client.complete, MATH_AGENT_SYSTEM_PROMPT, cleaned)
    except LLMError:
        raise
    except Exception as exc:
        logger.exception("Math solver LLM call failed")
        raise LLMError(str(exc)) from exc

    try:
        return _parse_solution_json(raw)
    except (json.JSONDecodeError, ValueError, TypeError) as exc:
        logger.warning("Math solver JSON parse failed, using fallback: %s", str(exc)[:160])
        return _fallback_from_raw(raw)
