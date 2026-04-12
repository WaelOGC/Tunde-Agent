from __future__ import annotations

import json
import logging
import re
from typing import Any

logger = logging.getLogger(__name__)


def _strip_code_fences(raw: str) -> str:
    s = raw.strip()
    if s.startswith("```"):
        s = re.sub(r"^```(?:json)?\s*", "", s, flags=re.IGNORECASE)
        s = re.sub(r"\s*```\s*$", "", s)
    return s.strip()


def _extract_outer_json_object(s: str) -> str | None:
    """Slice the first JSON object from text using ``JSONDecoder.raw_decode``."""
    start = s.find("{")
    if start < 0:
        return None
    decoder = json.JSONDecoder()
    try:
        _obj, end = decoder.raw_decode(s[start:])
        return s[start : start + end]
    except json.JSONDecodeError:
        return None


def _fix_trailing_commas(blob: str) -> str:
    """Remove trailing commas before } or ] (common LLM mistake)."""
    return re.sub(r",(\s*[\]}])", r"\1", blob)


def parse_llm_json_object(raw: str) -> dict[str, Any]:
    """Strict parse; raises on failure."""
    s = _strip_code_fences(raw)
    candidates: list[str] = [s]
    ext = _extract_outer_json_object(s)
    if ext and ext not in candidates:
        candidates.append(ext)
    last_err: json.JSONDecodeError | None = None
    for c in candidates:
        for blob in (c, _fix_trailing_commas(c)):
            try:
                obj = json.loads(blob)
                if isinstance(obj, dict):
                    return obj
            except json.JSONDecodeError as e:
                last_err = e
                continue
    if last_err:
        raise last_err
    raise json.JSONDecodeError("No JSON object found", raw, 0)


def _bullets_from_text(text: str, *, max_items: int = 8) -> list[str]:
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    out: list[str] = []
    for ln in lines:
        t = re.sub(r"^[-*•\d.)]+\s*", "", ln).strip()
        if len(t) > 8:
            out.append(t[:800])
        if len(out) >= max_items:
            break
    if not out and text.strip():
        out = [text.strip()[:600]]
    return out


def fallback_dict_for_agent(raw: str, role: str) -> dict[str, Any]:
    """When the model returns non-JSON prose, return a shape each pipeline stage accepts."""
    snippet = _strip_code_fences(raw)[:4000]
    if role == "master_plan":
        return {
            "information_goals": [snippet[:500]] if snippet else [],
            "angles_to_cover": [],
            "quality_checks": ["Attribute claims to sources", "Note uncertainties"],
            "_parse_fallback": True,
        }
    if role == "analyst":
        return {
            "markdown_report": snippet[:1200] if snippet else "",
            "market_share_data": [],
            "comparison_tables": [],
            "key_insights": [],
            "sources_with_links": [],
            "chart_spec": {"intent": "other", "notes": "parse_fallback"},
            "executive_summary": snippet[:900] if snippet else "Synthesis unavailable (model returned non-JSON).",
            "insights": _bullets_from_text(snippet) or ["See summary above."],
            "open_questions": [],
            "source_usage_notes": [],
            "global_perspective": [],
            "chart_metrics": None,
            "feasibility_deep_dive": None,
            "_parse_fallback": True,
        }
    if role == "verifier":
        return {
            "contradictions": [],
            "unsupported_or_overstated": [],
            "multi_source_agreements": [],
            "confidence": "low",
            "chart_data_reliable": False,
            "suggested_actions": ["Verifier output was not valid JSON; treat synthesis with extra caution."],
            "_parse_fallback": True,
        }
    if role == "vision":
        return {"readings": [], "_parse_fallback": True, "_raw": snippet[:2500]}
    if role == "illustrator":
        return {"illustrations": [], "_parse_fallback": True, "_raw": snippet[:2500]}
    if role == "master_gate":
        return {
            "approve_for_delivery": True,
            "revision_focus": "",
            "tagline": None,
            "executive_summary": "",
            "insights": [],
            "sources": [],
            "technical_ids": ["Master gate returned non-JSON; delivering analyst draft."],
            "_parse_fallback": True,
        }
    if role == "extractor":
        return {
            "extractions": [],
            "charts_detected": [],
            "low_confidence_flags": ["non_json_output"],
            "notes": [snippet[:400]] if snippet else [],
            "_parse_fallback": True,
        }
    if role == "designer":
        return {
            "charts": [],
            "notes": ["Designer returned non-JSON; charts skipped."],
            "_parse_fallback": True,
        }
    return {"_parse_fallback": True, "_raw": snippet}


def parse_llm_json_for_agent(raw: str, role: str) -> dict[str, Any]:
    """
    Parse model output; on failure log and return a role-specific fallback dict (never raises).
    """
    try:
        return parse_llm_json_object(raw)
    except (json.JSONDecodeError, TypeError, ValueError) as exc:
        logger.warning("LLM JSON parse failed role=%s err=%s", role, exc)
        try:
            s = _strip_code_fences(raw)
            inner = _extract_outer_json_object(s)
            if inner:
                inner2 = _fix_trailing_commas(inner)
                obj = json.loads(inner2)
                if isinstance(obj, dict):
                    return obj
        except (json.JSONDecodeError, TypeError, ValueError):
            pass
        return fallback_dict_for_agent(raw, role)
