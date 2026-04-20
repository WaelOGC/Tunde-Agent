"""
Document Writer — LLM-backed professional documents (JSON contract).

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

DOCUMENT_SYSTEM_PROMPT = """You are an expert professional document writer. When given a document request:

1. Identify the document type
2. Write a complete, professional document
3. Use appropriate tone and structure for the document type
4. Include all necessary sections
5. Make it ready to use with minimal editing
6. Never create fraudulent, fake identity, or illegal documents
7. When presenting structured data (financial projections, comparisons, timelines, pricing tiers, feature matrices, or any comparative/tabular information), always use GitHub-flavored Markdown pipe tables with | column | headers | and a separator row such as |---|---|. Never use bullet lists alone for tabular data—use a table instead.
8. Always respond in JSON format:
{"document_type": "...", "title": "...", "content": "...", "word_count": 0, "tone": "formal", "language": "English", "sections": ["..."], "confidence": "high"}

document_type must be one of: report, proposal, email, letter, cv, contract, meeting_notes, essay, other.
tone must be one of: formal, semi-formal, informal.
confidence must be one of: high, medium, low.
sections must list the main section headings you used in the document (short labels).
content must be the full document body in Markdown: use # / ## headings where helpful, and pipe tables (with header + |---| separator rows) for structured comparisons and numbers.
word_count must be a reasonable integer count of words in content (you may estimate; it will be validated server-side).
"""


def _strip_json_fence(text: str) -> str:
    s = (text or "").strip()
    m = re.match(r"^```(?:json)?\s*([\s\S]*?)\s*```$", s, re.IGNORECASE)
    if m:
        return m.group(1).strip()
    return s


_ALLOWED_TYPES = frozenset(
    {
        "report",
        "proposal",
        "email",
        "letter",
        "cv",
        "contract",
        "meeting_notes",
        "essay",
        "other",
    }
)
_ALLOWED_TONE = frozenset({"formal", "semi-formal", "informal"})
_ALLOWED_CONF = frozenset({"high", "medium", "low"})


def _normalize_doc_type(raw: Any) -> str:
    t = (raw if isinstance(raw, str) else str(raw or "")).strip().lower().replace(" ", "_").replace("-", "_")
    if t in _ALLOWED_TYPES:
        return t
    if "meeting" in t and "note" in t:
        return "meeting_notes"
    if "memo" in t:
        return "report"
    return "other"


def _normalize_tone(raw: Any) -> str:
    t = (raw if isinstance(raw, str) else str(raw or "")).strip().lower()
    if t in _ALLOWED_TONE:
        return t
    if "semi" in t:
        return "semi-formal"
    if "informal" in t or "casual" in t:
        return "informal"
    return "formal"


def _normalize_confidence(raw: Any) -> str:
    t = (raw if isinstance(raw, str) else str(raw or "")).strip().lower()
    if t in _ALLOWED_CONF:
        return t
    if "high" in t:
        return "high"
    if "low" in t:
        return "low"
    return "medium"


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


def _word_count_text(text: str) -> int:
    s = (text or "").strip()
    if not s:
        return 0
    return len(re.findall(r"\S+", s))


def _parse_response_json(raw: str) -> dict[str, Any]:
    cleaned = _strip_json_fence(raw)
    data = json.loads(cleaned)
    if not isinstance(data, dict):
        raise ValueError("response is not a JSON object")

    title_raw = data.get("title")
    title = title_raw.strip() if isinstance(title_raw, str) else str(title_raw or "").strip()

    content_raw = data.get("content")
    content = content_raw.strip() if isinstance(content_raw, str) else str(content_raw or "").strip()

    lang_raw = data.get("language")
    language = lang_raw.strip() if isinstance(lang_raw, str) else str(lang_raw or "English").strip() or "English"

    sections = _string_list(data.get("sections"))[:32]
    wc_raw = data.get("word_count")
    try:
        word_count = int(wc_raw) if wc_raw is not None else 0
    except (TypeError, ValueError):
        word_count = 0
    computed = _word_count_text(content)
    if word_count <= 0 or abs(word_count - computed) > max(50, computed // 4):
        word_count = computed

    return {
        "document_type": _normalize_doc_type(data.get("document_type")),
        "title": title or "Untitled document",
        "content": content,
        "word_count": word_count,
        "tone": _normalize_tone(data.get("tone")),
        "language": language,
        "sections": sections,
        "confidence": _normalize_confidence(data.get("confidence")),
    }


def _fallback_from_raw(raw: str, *, request: str) -> dict[str, Any]:
    text = (raw or "").strip()
    q = (request or "").strip()
    body = text if text else "(No structured document returned.)"
    wc = _word_count_text(body)
    return {
        "document_type": "other",
        "title": (q[:120] + ("…" if len(q) > 120 else "")) if q else "Document",
        "content": body,
        "word_count": wc,
        "tone": "formal",
        "language": "English",
        "sections": [],
        "confidence": "low",
    }


async def write_document(request: str) -> dict[str, Any]:
    """
    Produce a structured document artifact via the configured LLM.
    """
    cleaned = (request or "").strip()
    if not cleaned:
        raise ValueError("request must be non-empty")

    settings = get_settings()
    client = resolve_llm_client(settings, TaskKind.STRUCTURED_JSON)

    try:
        raw = await asyncio.to_thread(client.complete, DOCUMENT_SYSTEM_PROMPT, cleaned)
    except LLMError:
        raise
    except Exception as exc:
        logger.exception("Document writer LLM call failed")
        raise LLMError(str(exc)) from exc

    try:
        return _parse_response_json(raw)
    except (json.JSONDecodeError, ValueError, TypeError) as exc:
        logger.warning("Document writer JSON parse failed, using fallback: %s", str(exc)[:160])
        return _fallback_from_raw(raw, request=cleaned)
