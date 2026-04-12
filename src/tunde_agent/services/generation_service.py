"""
Generation service: LLM-built artifacts (custom landing pages today; PDF/Word/HTML design hooks later).

Custom landing flow overwrites ``data/reports/{report_id}.html`` after Telegram collects a design brief.
"""

from __future__ import annotations

import html
import logging
import re

from tunde_agent.config.settings import Settings
from tunde_agent.multi_agent.model_router import TaskKind, resolve_llm_client
from tunde_agent.services.llm_service import LLMError
from tunde_agent.services.report_html import reports_dir
from tunde_agent.services.reporter import load_report_for_export, load_report_meta

logger = logging.getLogger(__name__)

_LANDING_SYSTEM = """You are a senior front-end designer and engineer. You output ONE complete HTML5
document per request: embedded <style> in <head>, optional short <script> at end of <body> only if
needed for trivial UI (theme toggle, smooth scroll). No React/Vue build steps.

Hard rules:
- Use only the factual report content provided in the user message; do not invent sources or numbers.
- Escape all dynamic text as HTML entities where you inline report strings (no raw HTML injection from data).
- Responsive layout (mobile-first), readable typography, accessible landmarks (main, nav, header).
- Prefer system fonts or one Google Fonts link (https://fonts.googleapis.com) if you need display type.
- Do not use external script CDNs except Chart.js on cdn.jsdelivr.net if the user explicitly asks for charts.
- Return raw HTML only: no markdown code fences, no preamble or explanation outside the document.
- Start with <!DOCTYPE html> and a single <html lang="..."> root.
- Honour multi-section / multi-page feel via nav, anchors, or clear sectioning — unique layout per brief."""

_STRIP_FENCE = re.compile(r"^\s*```(?:html)?\s*", re.I)
_STRIP_FENCE_END = re.compile(r"\s*```\s*$", re.I)


def _strip_model_fences(raw: str) -> str:
    s = (raw or "").strip()
    s = _STRIP_FENCE.sub("", s, count=1)
    s = _STRIP_FENCE_END.sub("", s).strip()
    return s


def generate_custom_landing_html(settings: Settings, report_id: str, design_brief: str) -> str:
    """
    Ask the UI task model (see ``TaskKind.CREATIVE_UI`` — typically Gemini) for a full replacement
    landing page: multi-section structure from the operator brief, not a fixed template.

    Raises ``LLMError`` on provider failure.
    """
    rid = report_id.strip()
    loaded = load_report_for_export(rid)
    if not loaded:
        raise LLMError("Report not found for landing generation.")
    title, plain = loaded
    meta = load_report_meta(rid)
    topic = str(meta.get("topic") or title)[:800]

    client = resolve_llm_client(settings, TaskKind.CREATIVE_UI)
    user = (
        f"Design brief from the operator (follow closely, including mood, layout, sections, dark/light):\n"
        f"{design_brief.strip()[:8000]}\n\n"
        f"Report title: {title[:500]}\n"
        f"Topic context: {topic}\n\n"
        "Report body (plain text, may be truncated):\n"
        f"{plain.strip()[:24_000]}\n"
    )
    raw = client.complete(_LANDING_SYSTEM, user)
    html_out = _strip_model_fences(raw)
    if not html_out.lower().startswith("<!doctype") and "<html" not in html_out.lower()[:800]:
        logger.warning("Landing LLM output missing doctype/html; wrapping minimal shell")
        safe_title = title.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")[:200]
        html_out = (
            '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/>'
            '<meta name="viewport" content="width=device-width, initial-scale=1"/>'
            f"<title>{safe_title}</title></head><body><pre style=\"white-space:pre-wrap;font-family:system-ui\">"
            f"{html.escape(plain[:12000])}</pre></body></html>"
        )
    return html_out


def write_landing_html_file(report_id: str, html_document: str) -> None:
    path = reports_dir() / f"{report_id.strip()}.html"
    path.write_text(html_document, encoding="utf-8")


# --- Future: design-brief hooks for other exports (PDF, DOCX, static HTML) ---
# Implement the same pending-state pattern as ``telegram_pending_landing_design`` and call into
# this module with format-specific prompts.
