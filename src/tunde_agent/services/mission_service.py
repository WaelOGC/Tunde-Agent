"""
Research mission: URL discovery → Telegram approval → multi-agent orchestration → Telegram report.

Post-approval pipeline: parallel extraction, Master plan, Analyst, Verifier, Master quality gate (revision loop).

Telegram chat: ``MY_TELEGRAM_CHAT_ID`` (see ``TelegramService.chat_id``). DB ``user_id`` is RLS only.
"""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import uuid
from urllib.parse import urlparse

from tunde_agent.config.settings import get_settings
from tunde_agent.db.principal import ensure_principal_user
from tunde_agent.db.session import db_session
from tunde_agent.domain.approval_gate import request_human_approval
from tunde_agent.models.audit_log import AuditLog
from tunde_agent.multi_agent.agents.uiux_agent import UIUXAgent
from tunde_agent.services.llm_service import LLMError
from telegram_agent_core.services.telegram_markdown_v2 import (
    format_approval_photo_caption,
    telegram_inline_keyboard_url_allowed,
    tunde_sign_off_html,
)
from telegram_agent_core.services.telegram_post_task_markup import post_task_reply_markup_json
from telegram_agent_core.services.telegram_report_history import record_report_delivered
from telegram_agent_core.services.telegram_service import TelegramService
from tunde_agent.tools.browser.exceptions import CaptchaHandoffRequired
from tunde_agent.tools.browser.research_tool import research_browse

logger = logging.getLogger(__name__)


def _resolve_report_public_base(settings: object) -> str:
    """
    Origin for ``/reports/view/{id}`` (scheme + host[:port], no trailing slash, no path).

    Uses ``TUNDE_PUBLIC_BASE_URL`` or ``REPORT_PUBLIC_BASE_URL`` when set. Values without a scheme get
    ``https://`` prepended.
    Empty / invalid values fall back to ``http://localhost:8000`` (set a public HTTPS origin in
    production so Telegram clients can open the report from mobile).
    """
    raw = (getattr(settings, "public_base_url", None) or "").strip()
    if not raw:
        return "http://localhost:8000"
    if "://" not in raw:
        raw = "https://" + raw.lstrip("/")
    parsed = urlparse(raw)
    if parsed.scheme not in ("http", "https"):
        return "http://localhost:8000"
    host = (parsed.netloc or "").strip()
    if not host:
        return "http://localhost:8000"
    origin = f"{parsed.scheme}://{host}".rstrip("/")
    return origin or "http://localhost:8000"


def _build_report_page_url(settings: object, report_uuid: str) -> str:
    """Absolute report URL; ``report_uuid`` must be a valid id for ``GET /reports/view/{id}``."""
    base = _resolve_report_public_base(settings).rstrip("/")
    rid = str(report_uuid).strip().strip("/")
    return f"{base}/reports/view/{rid}"


# Operator-facing copy (Telegram).
MISSION_RESEARCH_ARRIVAL_CAPTION = (
    "Master, I've opened the first source and captured what I see. "
    "If you approve, I'll visit the other selected pages and send one combined report."
)

MISSION_DENIAL_ACK = (
    "Understood! I will discard this summary. Let me know if you need anything else! ✨"
)

MISSION_SERP_BLOCKED = (
    "⚠️ Search temporarily blocked: Google (or the search page) returned no usable links "
    "(often consent/CAPTCHA/rate limits in automated browsing).\n\n"
    "Please wait a few minutes and try again, or re-run the mission with an explicit `url` "
    "in the request body so I can open that page directly without SERP discovery."
)

MISSION_SERP_BLOCKED_AR = (
    "⚠️ تعذر البحث مؤقتًا: لم تُرجع صفحة البحث روابطًا صالحة "
    "(غالبًا بسبب موافقة ملفات تعريف الارتباط/التحقق أو حد المعدل).\n\n"
    "جرّب بعد بضع دقائق، أو أعد المهمة مع حقل `url` مباشر في الطلب."
)

MISSION_SEARCH_CAPTCHA_BLOCKED = (
    "Search blocked by Captcha, please try again in a few minutes."
)

MISSION_SEARCH_CAPTCHA_BLOCKED_AR = (
    "⚠️ البحث متوقف بسبب التحقق (Captcha). يرجى المحاولة مرة أخرى بعد بضع دقائق."
)


def _mission_audit(user_id: uuid.UUID, stage: str, **details: object) -> None:
    payload = {"stage": stage, **{k: v for k, v in details.items() if v is not None}}
    with db_session(user_id) as session:
        session.add(
            AuditLog(
                user_id=user_id,
                action_type="mission_research",
                details=json.dumps(payload, default=str, separators=(",", ":")),
            )
        )


def execute_research_mission(
    user_id: uuid.UUID,
    topic: str,
    url: str | None = None,
    *,
    headless: bool = True,
    approval_timeout_s: float = 600.0,
    output_language: str | None = None,
    telegram_progress_chat_id: str | None = None,
) -> dict:
    """
    Discover URLs → first page screenshot + approval → orchestrated multi-agent report → Telegram.

    When ``telegram_progress_chat_id`` is set (e.g. mission started from Telegram), a short
    “working on it” message is sent to that chat at the start.

    Returns a dict with ``outcome`` in ``approved`` | ``denied`` | ``timeout`` | ``error``.
    """
    settings = get_settings()
    topic_clean = topic.strip()
    if not topic_clean:
        raise ValueError("topic must be non-empty")

    ensure_principal_user(user_id)
    priority = (url or "").strip() or None
    _mission_audit(
        user_id,
        "start",
        topic=topic_clean[:500],
        url=(priority[:2048] if priority else None),
        multi_source=True,
        orchestration="master_worker_v2_visual",
        output_language=(output_language[:12] if output_language else None),
    )
    logger.info(
        "Mission start user_id=%s topic=%r priority_url=%s",
        user_id,
        topic_clean[:80],
        (priority[:120] if priority else None),
    )

    prog_chat = (telegram_progress_chat_id or "").strip()
    if prog_chat:
        try:
            TelegramService(settings).send_message_to_chat(
                prog_chat,
                "Working on it for you, Wael! Give me a moment to gather the best data... 🌸",
            )
        except Exception:
            logger.exception("Mission: progress Telegram message failed")

    from tunde_agent.services.research_orchestration.search_agent import discover_source_urls

    try:
        source_urls, multilingual_sources, search_block_hint = discover_source_urls(
            user_id,
            topic_clean,
            priority,
            headless=headless,
            settings=settings,
            output_language_override=output_language,
        )
    except Exception as exc:
        _mission_audit(user_id, "browsing", phase="url_resolution_failed", error=str(exc)[:500])
        raise

    _mission_audit(
        user_id,
        "browsing",
        phase="sources_resolved",
        count=len(source_urls),
        urls=[u[:500] for u in source_urls],
    )

    if not source_urls:
        _mission_audit(
            user_id,
            "finished",
            outcome="serp_blocked",
            topic=topic_clean[:500],
            delivered_summary=False,
            summary_generated=False,
            serp_empty=True,
            search_block_hint=search_block_hint,
        )
        try:
            tg0 = TelegramService(settings)
            if tg0.chat_id:
                lang = (output_language or settings.research_output_language or "en").strip().lower()
                if search_block_hint == "captcha_block":
                    msg = (
                        MISSION_SEARCH_CAPTCHA_BLOCKED_AR
                        if lang.startswith("ar")
                        else MISSION_SEARCH_CAPTCHA_BLOCKED
                    )
                else:
                    msg = MISSION_SERP_BLOCKED_AR if lang.startswith("ar") else MISSION_SERP_BLOCKED
                tg0.send_text(msg)
        except Exception:
            logger.exception("Mission: failed to send SERP-blocked notice to Telegram")
        logger.warning(
            "Mission aborted: no source URLs (SERP empty, no priority url) user_id=%s topic=%r",
            user_id,
            topic_clean[:80],
        )
        return {
            "ok": True,
            "outcome": "serp_blocked",
            "final_url": None,
            "title": None,
            "summary_generated": False,
            "summary_delivered": False,
            "sources_planned": 0,
        }

    first_requested = source_urls[0]
    try:
        browse_first = research_browse(
            first_requested,
            user_id,
            headless=headless,
            screenshot_full_page=True,
            include_screenshot_bytes=True,
        )
    except CaptchaHandoffRequired as exc:
        _mission_audit(
            user_id,
            "browsing",
            captcha_handoff=True,
            url=getattr(exc, "url", first_requested)[:2048],
            captcha_kind=getattr(exc, "kind", None),
        )
        raise

    png = browse_first.get("screenshot_png")
    if not isinstance(png, (bytes, bytearray)) or len(png) == 0:
        raise RuntimeError("research_browse did not return screenshot_png bytes")

    final_url_first = browse_first["url"]
    title_first = browse_first.get("title") or ""
    page_meta = {
        "final_url_first": final_url_first[:2048],
        "title_first": title_first[:500],
        "planned_sources": len(source_urls),
        "source_urls": [u[:500] for u in source_urls],
    }
    _mission_audit(user_id, "browsing", **page_meta)

    tg = TelegramService(settings)
    if not tg.chat_id:
        logger.warning(
            "MY_TELEGRAM_CHAT_ID is empty; mission Telegram steps will be skipped where configured."
        )

    approval_payload = {
        "topic": topic_clean[:500],
        "priority_url": (priority[:2048] if priority else None),
        "final_url": final_url_first[:2048],
        "title": title_first[:500],
        "source_urls": [u[:2048] for u in source_urls],
        "source_count": len(source_urls),
    }
    _mission_audit(user_id, "awaiting_approval", topic=topic_clean[:500], final_url=final_url_first[:2048])

    approval_caption_md = format_approval_photo_caption(
        topic_clean,
        final_url_first,
        MISSION_RESEARCH_ARRIVAL_CAPTION,
    )
    approved, approval_reason = request_human_approval(
        user_id,
        "research_analyze_and_deliver",
        approval_payload,
        message=approval_caption_md,
        timeout_s=approval_timeout_s,
        photo_png=bytes(png),
        photo_filename="research.png",
        photo_caption_parse_mode="MarkdownV2",
    )

    if not approved:
        outcome = approval_reason if approval_reason in ("denied", "timeout", "error") else "denied"
        if approval_reason == "denied":
            try:
                tg.send_text(MISSION_DENIAL_ACK)
            except Exception:
                logger.exception("Mission: failed to send denial acknowledgement to Telegram")
        _mission_audit(
            user_id,
            "finished",
            outcome=outcome,
            topic=topic_clean[:500],
            delivered_summary=False,
            summary_generated=False,
        )
        logger.info(
            "Mission finished without delivery user_id=%s topic=%r reason=%s",
            user_id,
            topic_clean[:80],
            outcome,
        )
        return {
            "ok": True,
            "outcome": outcome,
            "final_url": final_url_first,
            "title": title_first,
            "summary_generated": False,
            "summary_delivered": False,
            "sources_planned": len(source_urls),
        }

    from tunde_agent.services.research_orchestration.orchestrator import run_post_approval_pipeline

    try:
        delivery = asyncio.run(
            run_post_approval_pipeline(
                user_id,
                topic_clean,
                source_urls,
                browse_first,
                settings,
                headless=headless,
                output_language=output_language,
                multilingual_sources=multilingual_sources,
            )
        )
    except LLMError:
        _mission_audit(
            user_id,
            "analysis",
            subphase="failed",
            topic=topic_clean[:500],
            **{k: v for k, v in page_meta.items() if k != "source_urls"},
        )
        raise

    tagline = delivery.get("tagline")
    if tagline is not None:
        tagline = str(tagline).strip() or None
    exec_sum = str(delivery.get("executive_summary") or "").strip()
    insights_list = delivery.get("insights") or []
    if not isinstance(insights_list, list):
        insights_list = []
    insights_list = [str(x).strip() for x in insights_list if x and str(x).strip()]
    sources_list = delivery.get("sources") or []
    if not isinstance(sources_list, list):
        sources_list = []
    sources_tuples: list[tuple[str, str]] = []
    for item in sources_list:
        if isinstance(item, tuple) and len(item) == 2:
            sources_tuples.append((str(item[0]), str(item[1])))
        elif isinstance(item, list) and len(item) == 2:
            sources_tuples.append((str(item[0]), str(item[1])))
    tech_ids = delivery.get("technical_ids")
    if isinstance(tech_ids, list):
        tech_ids = [str(x).strip() for x in tech_ids if x and str(x).strip()]
    else:
        tech_ids = []

    primary_media = str(delivery.get("primary_media") or final_url_first)

    effective_lang = (output_language or settings.research_output_language or "en").strip().lower()
    charts_raw = delivery.get("telegram_charts") or []

    illustrations: list[dict] = []
    try:
        from tunde_agent.services.illustrator_agent import run_illustrator

        illustrations = run_illustrator(settings, topic_clean, delivery, max_rendered=1)
    except Exception:
        logger.exception("Mission: illustrator failed; landing page will omit AI images")

    cm0 = delivery.get("analyst_chart_metrics")
    cm_dict: dict = cm0 if isinstance(cm0, dict) else {}

    report_id: str | None = None
    report_page_url: str | None = None
    rd = str(uuid.uuid4())
    try:
        from tunde_agent.services.report_html import build_landing_page_html, reports_dir
        chart_embeds: list[dict[str, str]] = []
        for item in charts_raw:
            if not isinstance(item, (tuple, list)) or len(item) < 1:
                continue
            raw_png = item[0]
            if not isinstance(raw_png, (bytes, bytearray)):
                continue
            chart_embeds.append(
                {
                    "b64": base64.standard_b64encode(bytes(raw_png)).decode("ascii"),
                    "caption": str(item[1]) if len(item) > 1 else "",
                    "kind": str(cm_dict.get("chart_kind") or "chart"),
                    "intel": str(cm_dict.get("intelligence_caption") or ""),
                }
            )
        report_page_url = _build_report_page_url(settings, rd)
        if _resolve_report_public_base(settings) == "http://localhost:8000":
            logger.warning(
                "TUNDE_PUBLIC_BASE_URL is unset; report links use http://localhost:8000. "
                "Telegram on another device cannot open them — set TUNDE_PUBLIC_BASE_URL to your public HTTPS origin."
            )
        html_doc = build_landing_page_html(
            topic_clean,
            delivery,
            illustrations=illustrations,
            chart_embeds=chart_embeds,
            rtl=effective_lang.startswith("ar"),
            public_page_url=report_page_url,
        )
        out_path = reports_dir() / f"{rd}.html"
        out_path.write_text(html_doc, encoding="utf-8")
        meta_chart_b64: str | None = None
        if charts_raw:
            rp0 = charts_raw[0][0]
            if isinstance(rp0, (bytes, bytearray)):
                meta_chart_b64 = base64.standard_b64encode(bytes(rp0)).decode("ascii")
        meta_payload = {
            "report_id": rd,
            "report_url": report_page_url,
            "analyst_chart_metrics": cm_dict,
            "chart_png_b64": meta_chart_b64,
            "sources": [
                {"title": str(t)[:220], "url": str(u)[:2048]} for t, u in sources_tuples[:24]
            ],
            "topic": topic_clean[:500],
        }
        try:
            (reports_dir() / f"{rd}.meta.json").write_text(
                json.dumps(meta_payload, ensure_ascii=False),
                encoding="utf-8",
            )
        except Exception:
            logger.exception("Mission: failed to write report meta JSON")

        report_id = rd
        logger.info("Mission landing-page report written path=%s url=%s", out_path, report_page_url)
        raw_pub = (getattr(settings, "public_base_url", None) or "").strip()
        if raw_pub and "localhost" not in report_page_url.lower() and "127.0.0.1" not in report_page_url:
            logger.info("Mission report_page_url uses configured public origin (non-loopback).")
    except Exception:
        logger.exception("Mission: landing-page HTML write failed")
        report_id = None
        report_page_url = None

    if not (report_page_url or "").strip():
        logger.error("MISSION_ERROR: report_page_url is empty!")

    teaser_body = UIUXAgent.format_mission_teaser_html(
        topic_clean,
        tagline=tagline,
        executive_summary=exec_sum or "No executive summary returned.",
        insights=insights_list,
        report_url=report_page_url,
        chart_metrics=cm_dict or None,
    )
    delivery_html = (
        "<b>✨ Tunde · Visual briefing</b>\n\n"
        f"{teaser_body}{tunde_sign_off_html()}"
    )

    _mission_audit(
        user_id,
        "analysis",
        subphase="complete",
        topic=topic_clean[:500],
        summary_chars=len(delivery_html),
        sources_fetched=len(source_urls),
        **{k: v for k, v in page_meta.items() if k != "source_urls"},
    )

    reply_markup_json: str | None = None
    ru_out = (report_page_url or "").strip()
    if ru_out and telegram_inline_keyboard_url_allowed(ru_out):
        reply_markup_json = json.dumps(
            {"inline_keyboard": [[{"text": "🔗 Full Visual Analytics", "url": ru_out[:2048]}]]},
            separators=(",", ":"),
        )
    elif ru_out:
        logger.info(
            "Skipping Telegram inline URL button (localhost/non-public URL); CTA remains as <a href> in HTML body."
        )

    try:
        tg.send_html(delivery_html, reply_markup_json=reply_markup_json)
    except Exception:
        logger.exception("Mission: failed to send summary to Telegram")
        _mission_audit(
            user_id,
            "finished",
            outcome="approved",
            topic=topic_clean[:500],
            delivered_summary=False,
            summary_generated=True,
            telegram_error=True,
        )
        raise

    charts_sent = 0
    topic_hint = topic_clean[:70] + ("…" if len(topic_clean) > 70 else "")
    for i, item in enumerate(charts_raw):
        if not isinstance(item, (tuple, list)) or len(item) < 2:
            continue
        png_b, cap = item[0], item[1]
        if not isinstance(png_b, (bytes, bytearray)):
            continue
        suffix = (
            " — ملخص بياني احترافي من أهم الأرقام في التقرير."
            if effective_lang.startswith("ar")
            else " — Professional summary chart from key figures in this report."
        )
        full_cap = (f"{cap} · {topic_hint}{suffix}")[:1024]
        try:
            tg.send_photo(bytes(png_b), full_cap, filename=f"research_chart_{i + 1}.png")
            charts_sent += 1
        except Exception:
            logger.exception("Mission: failed to send chart %s to Telegram", i)

    if report_id:
        try:
            record_report_delivered(str(tg.chat_id), report_id)
        except Exception:
            logger.exception("Mission: report history record failed")
        try:
            markup_whats_next = post_task_reply_markup_json(report_id, report_page_url)
            if markup_whats_next and tg.chat_id:
                tg.send_text(
                    "What would you like to do next? ✨",
                    reply_markup=markup_whats_next,
                )
        except Exception:
            logger.exception("Mission: post-task inline keyboard failed")

    _mission_audit(
        user_id,
        "finished",
        outcome="approved",
        topic=topic_clean[:500],
        delivered_summary=True,
        summary_generated=True,
        sources_used=len(source_urls),
        visual_asset_urls=len(delivery.get("visual_data_urls") or []),
        generated_charts=len(delivery.get("generated_chart_paths") or []),
        charts_sent_telegram=charts_sent,
        multilingual_source_rows=len(delivery.get("multilingual_sources") or []),
        image_analysis_summary_chars=len(delivery.get("image_analysis_summary") or ""),
        generated_visual_url=(delivery.get("generated_visual_url") or "")[:300] or None,
        report_id=report_id,
        report_page_url=(report_page_url or "")[:500] or None,
    )
    logger.info(
        "Mission complete user_id=%s topic=%r sources_planned=%s",
        user_id,
        topic_clean[:80],
        len(source_urls),
    )

    return {
        "ok": True,
        "outcome": "approved",
        "final_url": primary_media,
        "title": title_first,
        "summary_generated": True,
        "summary_delivered": True,
        "sources_used": len(source_urls),
        "report_id": report_id,
        "report_page_url": report_page_url,
    }
