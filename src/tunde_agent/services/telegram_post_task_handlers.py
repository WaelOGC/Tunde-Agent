"""Telegram inline callbacks after a report: exports, email, Q&A mode, compare, summarize."""

from __future__ import annotations

import logging
import re
import uuid

from tunde_agent.config.settings import Settings
from tunde_agent.services.llm_service import LLMError, LLMService
from tunde_agent.services.mission_service import _build_report_page_url
from tunde_agent.services.prompt_manager import PromptManager
from tunde_agent.services.report_email import (
    ReportEmailError,
    send_report_to_recipients,
    smtp_configured,
)
from tunde_agent.services.report_html import reports_dir
from tunde_agent.services.reporter import (
    build_docx_bytes,
    build_professional_pdf_from_report,
    build_sheet_csv_bytes,
    build_tailwind_landing_html,
    load_report_for_export,
    read_report_html,
)
from tunde_agent.services.telegram_pending_email import set_pending_report_email
from tunde_agent.services.telegram_report_context import set_report_chat_context
from tunde_agent.services.telegram_report_history import get_report_pair_for_compare
from tunde_agent.services.telegram_service import TelegramService

logger = logging.getLogger(__name__)


def _html_to_plain(html: str, *, max_chars: int = 14_000) -> str:
    t = re.sub(r"(?is)<script.*?>.*?</script>", " ", html)
    t = re.sub(r"(?is)<style.*?>.*?</style>", " ", t)
    t = re.sub(r"(?is)<[^>]+>", " ", t)
    t = re.sub(r"\s+", " ", t).strip()
    return t[:max_chars]


def process_post_task_callback(
    *,
    prefix: str,
    report_id: str,
    chat_id: int,
    callback_query_id: str,
    settings: Settings,
) -> None:
    """Dispatch ``f|w|g|b|m|q|v|s`` + ``uuid`` post-report actions."""
    tg = TelegramService(settings)
    try:
        uuid.UUID(report_id.strip())
    except ValueError:
        tg.answer_callback_query(callback_query_id, text="Invalid report id.")
        return

    rid = report_id.strip()
    p = prefix.strip().lower()

    if p == "f":
        _answer_and_generate_pdf(tg, callback_query_id, chat_id, rid, settings)
        return
    if p == "w":
        _answer_and_generate_docx(tg, callback_query_id, chat_id, rid, settings)
        return
    if p == "g":
        _answer_and_generate_csv(tg, callback_query_id, chat_id, rid, settings)
        return
    if p == "b":
        _answer_and_tailwind_html(tg, callback_query_id, chat_id, rid, settings)
        return
    if p == "m":
        _answer_and_email(tg, callback_query_id, chat_id, rid, settings)
        return
    if p == "q":
        _answer_and_chat_mode(tg, callback_query_id, chat_id, rid, settings)
        return
    if p == "v":
        _answer_and_compare(tg, callback_query_id, chat_id, rid, settings)
        return
    if p == "s":
        _answer_and_summarize(tg, callback_query_id, chat_id, rid, settings)
        return

    tg.answer_callback_query(callback_query_id, text="Unknown action.")


def _answer_and_generate_pdf(
    tg: TelegramService,
    cqid: str,
    chat_id: int,
    rid: str,
    settings: Settings,
) -> None:
    tg.answer_callback_query(cqid, text="Building PDF…")
    try:
        pdf_b = build_professional_pdf_from_report(rid)
    except Exception as exc:
        logger.exception("PDF build failed")
        tg.send_message_to_chat(chat_id, f"PDF build failed ({exc!s}). Try Word or CSV? 🌸")
        return
    if not pdf_b or len(pdf_b) < 100:
        tg.send_message_to_chat(chat_id, "PDF came out empty — try regenerating the mission? 💛")
        return
    tg.send_document_to_chat(
        chat_id,
        pdf_b,
        "Here’s your PDF — professional layout from the same report text. 📄",
        filename=f"tunde-report-{rid[:8]}.pdf",
        mime="application/pdf",
    )


def _answer_and_generate_docx(
    tg: TelegramService,
    cqid: str,
    chat_id: int,
    rid: str,
    settings: Settings,
) -> None:
    tg.answer_callback_query(cqid, text="Building Word file…")
    loaded = load_report_for_export(rid)
    if not loaded:
        tg.send_message_to_chat(chat_id, "I couldn’t load that report file anymore 💛")
        return
    title, plain = loaded
    try:
        doc_b = build_docx_bytes(title, plain)
    except Exception as exc:
        logger.exception("DOCX build failed")
        tg.send_message_to_chat(chat_id, f"Word export failed ({exc!s}). 🌸")
        return
    tg.send_document_to_chat(
        chat_id,
        doc_b,
        "Your .docx is attached — open in Word or Google Docs. 📝",
        filename=f"tunde-report-{rid[:8]}.docx",
        mime="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )


def _answer_and_generate_csv(
    tg: TelegramService,
    cqid: str,
    chat_id: int,
    rid: str,
    settings: Settings,
) -> None:
    tg.answer_callback_query(cqid, text="Preparing CSV…")
    loaded = load_report_for_export(rid)
    if not loaded:
        tg.send_message_to_chat(chat_id, "I couldn’t load that report file anymore 💛")
        return
    title, plain = loaded
    try:
        csv_b = build_sheet_csv_bytes(title, plain)
    except Exception as exc:
        logger.exception("CSV build failed")
        tg.send_message_to_chat(chat_id, f"CSV export failed ({exc!s}). 🌸")
        return
    tg.send_document_to_chat(
        chat_id,
        csv_b,
        "Import this CSV into Google Sheets: File → Import → Upload. 📊",
        filename=f"tunde-report-{rid[:8]}.csv",
        mime="text/csv",
    )


def _answer_and_tailwind_html(
    tg: TelegramService,
    cqid: str,
    chat_id: int,
    rid: str,
    settings: Settings,
) -> None:
    tg.answer_callback_query(cqid, text="Building Tailwind page…")
    loaded = load_report_for_export(rid)
    if not loaded:
        tg.send_message_to_chat(chat_id, "I couldn’t load that report file anymore 💛")
        return
    title, plain = loaded
    url = _build_report_page_url(settings, rid)
    try:
        html_doc = build_tailwind_landing_html(title, plain, report_url=url)
    except Exception as exc:
        logger.exception("Tailwind HTML failed")
        tg.send_message_to_chat(chat_id, f"HTML export failed ({exc!s}). 🌸")
        return
    tg.send_document_to_chat(
        chat_id,
        html_doc.encode("utf-8"),
        "Clean Tailwind + CDN single-file page (open in any browser). 🏢",
        filename=f"tunde-tailwind-{rid[:8]}.html",
        mime="text/html",
    )


def _answer_and_email(
    tg: TelegramService,
    cqid: str,
    chat_id: int,
    rid: str,
    settings: Settings,
) -> None:
    tg.answer_callback_query(cqid, text="Reply with email(s)")
    if not smtp_configured(settings):
        tg.send_message_to_chat(
            chat_id,
            "Email isn’t wired yet — add SMTP_HOST, SMTP_USER, and SMTP_PASSWORD to .env. 💛",
        )
        return
    set_pending_report_email(chat_id, rid)
    tg.send_message_to_chat(
        chat_id,
        "Please provide the email address (or multiple addresses separated by commas) "
        "where you’d like to receive the report. I’ll send the PDF and a link. 📧\n"
        "Say /cancel_email to abort.",
    )


def _answer_and_chat_mode(
    tg: TelegramService,
    cqid: str,
    chat_id: int,
    rid: str,
    settings: Settings,
) -> None:
    tg.answer_callback_query(cqid, text="Chat mode on!")
    loaded = load_report_for_export(rid)
    if not loaded:
        tg.send_message_to_chat(chat_id, "I couldn’t load that report for Q&A 💛")
        return
    _title, plain = loaded
    set_report_chat_context(chat_id, rid, plain)
    tg.send_message_to_chat(
        chat_id,
        "I’m focused on this report now — ask me anything about it. Say /done when you want to go back to normal chat. 🧐",
    )


def _answer_and_compare(
    tg: TelegramService,
    cqid: str,
    chat_id: int,
    rid: str,
    settings: Settings,
) -> None:
    tg.answer_callback_query(cqid, text="Comparing…")
    pair = get_report_pair_for_compare(str(chat_id))
    if not pair:
        tg.send_message_to_chat(
            chat_id,
            "There isn’t a previous report in this chat yet — finish one more mission and try again. 🔄",
        )
        return
    older_id, newer_id = pair
    # Prefer comparing the clicked report as “current” with the other file in history
    a_id, b_id = older_id, newer_id
    raw_a = read_report_html(a_id)
    raw_b = read_report_html(b_id)
    if not raw_a or not raw_b:
        tg.send_message_to_chat(chat_id, "One of the reports is missing on disk — run fresh missions? 💛")
        return
    p1 = _html_to_plain(raw_a, max_chars=10_000)
    p2 = _html_to_plain(raw_b, max_chars=10_000)
    bundle = (
        "Compare these two research reports concisely for Telegram (warm tone, 3–5 short paragraphs). "
        "Highlight what changed, agreements, and tensions. Do not use markdown headings.\n\n"
        f"--- Report A ({a_id[:8]}) ---\n{p1}\n\n--- Report B ({b_id[:8]}) ---\n{p2}"
    )
    try:
        service = LLMService(settings, PromptManager())
        reply = service.chat(bundle)
    except LLMError as exc:
        tg.send_message_to_chat(chat_id, f"Compare failed ({exc!s}). Try again soon? 🌸")
        return
    tg.send_message_to_chat(chat_id, reply.strip()[:4096])


def _answer_and_summarize(
    tg: TelegramService,
    cqid: str,
    chat_id: int,
    rid: str,
    settings: Settings,
) -> None:
    tg.answer_callback_query(cqid, text="Summarizing…")
    path = reports_dir() / f"{rid}.html"
    if not path.is_file():
        tg.send_message_to_chat(
            chat_id,
            "I couldn’t find that report file on the server anymore — run a fresh mission? 💛",
        )
        return
    try:
        raw_html = path.read_text(encoding="utf-8")
    except Exception:
        logger.exception("post-task: read report html failed id=%s", rid)
        tg.send_message_to_chat(chat_id, "I couldn’t read that report — try again? 🌸")
        return
    plain = _html_to_plain(raw_html, max_chars=20_000)
    if len(plain) < 80:
        tg.send_message_to_chat(
            chat_id,
            "That report looks empty from here — want me to run another pass? 💛",
        )
        return
    bundle = (
        "Summarize the following report for Telegram in 2–4 short, friendly paragraphs. "
        "Stay warm and clear; no markdown headings; keep total under 3500 characters.\n\n"
        + plain
    )
    try:
        service = LLMService(settings, PromptManager())
        reply = service.chat(bundle)
    except LLMError as exc:
        logger.warning("post-task summarize LLM error: %s", exc)
        tg.send_message_to_chat(
            chat_id,
            f"I couldn’t compress that report just now ({exc!s}). Try again soon? 🌸",
        )
        return
    tg.send_message_to_chat(chat_id, reply.strip()[:4096])
