"""
Code Assistant — LLM-backed structured coding help (JSON contract).

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

CODE_ASSISTANT_SYSTEM_PROMPT = """You are an expert programming assistant. When given a code question:
1. Detect the programming language
2. Identify the task: write, explain, debug, review, convert, or test
3. Write clean, well-commented code
4. Explain each important part clearly
5. State the time/space complexity if relevant
6. List best practices applied
7. Flag any warnings or security concerns
8. NEVER write malicious code, exploits, malware, or privacy-harming code
9. Always respond in JSON format:
{"language": "python", "task_type": "write", "code": "# code here", "explanation": "...", "complexity": "O(n)", "best_practices": ["..."], "warnings": [], "confidence": "high"}
"""

_ALLOWED_TASK_TYPES = frozenset({"write", "explain", "debug", "review", "convert", "test"})

_LANG_ALIASES = {
    "js": "javascript",
    "ts": "typescript",
    "py": "python",
    "rb": "ruby",
    "cs": "csharp",
    "cpp": "cpp",
    "c++": "cpp",
    "sh": "bash",
    "shell": "bash",
    "zsh": "bash",
}


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


def _normalize_task_type(raw: Any) -> str:
    if not isinstance(raw, str):
        raw = str(raw or "")
    t = raw.strip().lower().replace(" ", "_").replace("-", "_")
    if t in _ALLOWED_TASK_TYPES:
        return t
    if "writ" in t or "generat" in t:
        return "write"
    if "explain" in t:
        return "explain"
    if "debug" in t or "fix" in t:
        return "debug"
    if "review" in t:
        return "review"
    if "convert" in t or "translat" in t:
        return "convert"
    if "test" in t:
        return "test"
    return "write"


def _normalize_language(raw: Any) -> str:
    if not isinstance(raw, str):
        raw = str(raw or "")
    t = raw.strip().lower()
    if not t:
        return "plaintext"
    t = _LANG_ALIASES.get(t, t)
    t = t.replace(" ", "_")
    return t


def _string_list(raw: Any, *, max_items: int = 48) -> list[str]:
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

    code = data.get("code")
    code_s = code.strip() if isinstance(code, str) else (str(code) if code is not None else "")

    explanation = data.get("explanation")
    expl = explanation.strip() if isinstance(explanation, str) else (str(explanation).strip() if explanation else "")

    comp = data.get("complexity")
    complexity = comp.strip() if isinstance(comp, str) else (str(comp).strip() if comp else "—")

    conf_raw = data.get("confidence")
    confidence = _normalize_confidence(conf_raw if isinstance(conf_raw, str) else str(conf_raw or ""))

    return {
        "language": _normalize_language(data.get("language")),
        "task_type": _normalize_task_type(data.get("task_type")),
        "code": code_s,
        "explanation": expl,
        "complexity": complexity if complexity else "—",
        "best_practices": _string_list(data.get("best_practices")),
        "warnings": _string_list(data.get("warnings")),
        "confidence": confidence,
    }


def _fallback_from_raw(raw: str) -> dict[str, Any]:
    text = (raw or "").strip()
    return {
        "language": "plaintext",
        "task_type": "explain",
        "code": "",
        "explanation": text if text else "(No structured code assistant response returned.)",
        "complexity": "—",
        "best_practices": [],
        "warnings": ["Model output was not valid JSON; showing raw text in explanation."],
        "confidence": "low",
    }


async def assist_code_question(question: str) -> dict[str, Any]:
    """
    Produce structured code assistance via the configured LLM.

    Returns:
        dict matching CodeAnswerResponse fields.
    """
    cleaned = (question or "").strip()
    if not cleaned:
        raise ValueError("question must be non-empty")

    settings = get_settings()
    client = resolve_llm_client(settings, TaskKind.STRUCTURED_JSON)

    try:
        raw = await asyncio.to_thread(client.complete, CODE_ASSISTANT_SYSTEM_PROMPT, cleaned)
    except LLMError:
        raise
    except Exception as exc:
        logger.exception("Code assistant LLM call failed")
        raise LLMError(str(exc)) from exc

    try:
        return _parse_response_json(raw)
    except (json.JSONDecodeError, ValueError, TypeError) as exc:
        logger.warning("Code assistant JSON parse failed, using fallback: %s", str(exc)[:160])
        return _fallback_from_raw(raw)
