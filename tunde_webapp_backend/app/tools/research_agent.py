"""
Research Agent — LLM-backed structured research synthesis (JSON contract).

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

DEFAULT_DISCLAIMER = "Research is based on AI knowledge. Always verify with primary sources."

RESEARCH_SYSTEM_PROMPT = """You are an expert research assistant producing publication-quality drafts. When given a research topic:

CONTENT RULES FOR THE "summary" FIELD (single string, Markdown allowed):
- Start with ONE executive-summary paragraph (5–8 sentences) that states scope, stakes, and bottom-line conclusions.
- Then add MULTIPLE sections using ## headings, for example: ## Background and context, ## Evidence and analysis, ## Debates and limitations, ## Implications — each with substantive prose.
- The ENTIRE summary MUST be at least 500 words unless the topic is impossibly narrow; aim for depth, nuance, and clear transitions between sections.
- Use plain language where possible; define jargon briefly when needed.

KEY FINDINGS:
- Provide AT LEAST 7 distinct key_findings items (numbered logic in prose form — each item one clear bullet-worthy statement).

SOURCES AND CITATIONS:
- sources: representative titles/types only — describe real categories (e.g. "Peer-reviewed meta-analyses (domain)") without inventing DOIs, URLs, authors, or journal volume numbers.
- citations: formatted strings in a consistent academic-style line format (Author-Date or organization style) ONLY for concepts you can honestly attribute; otherwise describe the evidence class generically — NEVER fabricate metadata.

GENERAL:
- conflicting_views: opposing schools or critiques when relevant.
- NEVER fabricate citations, URLs, publisher names for non-existent works, or fake studies.
- Flag uncertainty and conflicting evidence in prose and via confidence.

Always respond in JSON ONLY with this shape (no markdown fences outside the JSON):
{"topic": "...", "summary": "...", "key_findings": ["..."], "sources": [{"title": "...", "type": "academic", "credibility": "high"}], "citations": ["..."], "conflicting_views": ["..."], "confidence": "high", "disclaimer": "Research is based on AI knowledge. Always verify with primary sources."}
"""

_ALLOWED_TYPES = frozenset({"academic", "news", "official", "web"})
_ALLOWED_CRED = frozenset({"high", "medium", "low"})


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
    if "low" in t or "unsure" in t:
        return "low"
    return "medium"


def _normalize_source_type(raw: Any) -> str:
    if not isinstance(raw, str):
        raw = str(raw or "")
    t = raw.strip().lower()
    if t in _ALLOWED_TYPES:
        return t
    if "journal" in t or "paper" in t or "peer" in t:
        return "academic"
    if "gov" in t or "official" in t or "agency" in t:
        return "official"
    if "news" in t or "press" in t:
        return "news"
    return "web"


def _normalize_credibility(raw: Any) -> str:
    if not isinstance(raw, str):
        raw = str(raw or "")
    t = raw.strip().lower()
    if t in _ALLOWED_CRED:
        return t
    if "high" in t or "strong" in t:
        return "high"
    if "low" in t or "weak" in t:
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


def _parse_sources(raw: Any) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    if not isinstance(raw, list):
        return out
    for item in raw[:48]:
        if not isinstance(item, dict):
            continue
        title_raw = item.get("title")
        title = title_raw.strip() if isinstance(title_raw, str) else str(title_raw or "").strip()
        if not title:
            continue
        out.append(
            {
                "title": title,
                "type": _normalize_source_type(item.get("type")),
                "credibility": _normalize_credibility(item.get("credibility")),
            }
        )
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

    findings = _string_list(data.get("key_findings"), max_items=48)
    sources = _parse_sources(data.get("sources"))
    citations = _string_list(data.get("citations"), max_items=96)
    conflicts = _string_list(data.get("conflicting_views"), max_items=32)

    disc_raw = data.get("disclaimer")
    disclaimer = (
        disc_raw.strip()
        if isinstance(disc_raw, str) and disc_raw.strip()
        else DEFAULT_DISCLAIMER
    )

    conf_raw = data.get("confidence")
    confidence = _normalize_confidence(conf_raw if isinstance(conf_raw, str) else str(conf_raw or ""))

    if not topic:
        topic = "Research topic"

    return {
        "topic": topic,
        "summary": summary,
        "key_findings": findings,
        "sources": sources,
        "citations": citations,
        "conflicting_views": conflicts,
        "confidence": confidence,
        "disclaimer": disclaimer,
    }


def _fallback_from_raw(raw: str, *, question: str) -> dict[str, Any]:
    text = (raw or "").strip()
    q = (question or "").strip()
    return {
        "topic": q[:200] if q else "Research topic",
        "summary": text if text else "(No structured research response returned.)",
        "key_findings": [],
        "sources": [],
        "citations": [],
        "conflicting_views": [],
        "confidence": "low",
        "disclaimer": DEFAULT_DISCLAIMER,
    }


async def research_question(question: str) -> dict[str, Any]:
    """
    Produce structured research output via the configured LLM.

    Returns:
        dict matching ResearchAnswerResponse (sources as list of dicts for Pydantic).
    """
    cleaned = (question or "").strip()
    if not cleaned:
        raise ValueError("question must be non-empty")

    settings = get_settings()
    client = resolve_llm_client(settings, TaskKind.STRUCTURED_JSON)

    try:
        raw = await asyncio.to_thread(client.complete, RESEARCH_SYSTEM_PROMPT, cleaned)
    except LLMError:
        raise
    except Exception as exc:
        logger.exception("Research agent LLM call failed")
        raise LLMError(str(exc)) from exc

    try:
        return _parse_response_json(raw)
    except (json.JSONDecodeError, ValueError, TypeError) as exc:
        logger.warning("Research agent JSON parse failed, using fallback: %s", str(exc)[:160])
        return _fallback_from_raw(raw, question=cleaned)
