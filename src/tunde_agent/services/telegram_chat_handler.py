"""
Telegram private-chat conversational layer for Tunde (small talk, research trigger, image gen).

Runs synchronously from the polling thread; long work uses background threads.
"""

from __future__ import annotations

import logging
import re
import threading

from tunde_agent.config.settings import Settings, get_settings
from tunde_agent.constants import SMOKE_TEST_USER_ID
from tunde_agent.services.gemini_image_generation import generate_image_bytes
from tunde_agent.services.llm_service import LLMError, LLMService
from tunde_agent.services.prompt_manager import PromptManager
from tunde_agent.services.telegram_operator_chat import save_operator_chat_id
from tunde_agent.services.mission_service import _build_report_page_url
from tunde_agent.services.report_email import ReportEmailError, send_report_to_recipients, smtp_configured
from tunde_agent.services.reporter import build_professional_pdf_from_report, load_report_for_export
from tunde_agent.services.telegram_pending_email import (
    clear_pending_report_email,
    get_pending_report_email,
    parse_email_addresses,
)
from tunde_agent.services.telegram_report_context import (
    clear_report_chat_context,
    get_report_chat_context,
)
from tunde_agent.services.telegram_service import TelegramService
from tunde_agent.services.telegram_session import append_turn, history_block_for_prompt

logger = logging.getLogger(__name__)

_CMD_RE = re.compile(
    r"^/(research|analyze|mission)(?:@[\w_]+)?\s*(.*)$",
    re.IGNORECASE | re.DOTALL,
)
_IMG_RES = [
    re.compile(r"(?is)^\s*(?:please\s+)?(?:generate|create)\s+an?\s+image\s+of\s+(.+)$"),
    re.compile(r"(?is)^\s*(?:please\s+)?(?:generate|create)\s+an?\s+image\s*[:\-]\s*(.+)$"),
    re.compile(r"(?is)^\s*(?:please\s+)?draw\s+(.+)$"),
]
_RESEARCH_PHRASE = re.compile(
    r"(?is)^\s*(?:do\s+)?(?:some\s+)?research\s+(?:on|about)\s+(.+)$",
)
_ANALYSIS_PHRASE = re.compile(
    r"(?is)^\s*(?:run\s+)?(?:an?\s+)?analysis\s+(?:of|on)\s+(.+)$",
)
# Full mission pipeline (sources + report + post-task export buttons).
_COMPLEX_MISSION_TRIGGERS = re.compile(
    r"(?is)\b("
    r"feasibility\s+study|feasibility\s+analysis|market\s+analysis|market\s+study|market\s+sizing|"
    r"industry\s+analysis|competitive\s+analysis|competitor\s+analysis|investment\s+memo|due\s+diligence|"
    r"business\s+case\s+for|swot\s+analysis"
    r")\b",
)


def _welcome_text() -> str:
    return (
        "Hey — I’m Tunde AI Agent 💛 I’ve linked this chat so I can send you research updates, "
        "screenshots, approvals, and sparkly results right here.\n\n"
        "Quick commands:\n"
        "• /research <topic> — full research mission\n"
        "• /analyze <topic> — same pipeline\n"
        "• Say “draw …” or “generate an image of …” — I’ll paint it for you\n"
        "• /help — reminders\n"
        "• /done — exit “chat with report” mode\n"
        "• /cancel_email — abort “send report to email” if waiting for your address\n"
        "• Say market analysis / feasibility study (15+ chars) → full mission + export buttons\n\n"
        "Or just talk to me — I’m yours. Warmly built by Wael Safan & NewFinity ✨"
    )


def _help_text() -> str:
    return (
        "Tunde AI Agent — I’m here to chat, research the web for you, and sketch images.\n\n"
        "/research <topic> — browse, approve sources, deliver a visual report\n"
        "/analyze <topic> — same as research\n"
        "Natural: “research on …”, “analysis of …”, or phrases like market analysis / feasibility study start a full mission.\n"
        "Images: “draw a cozy café at sunset” or “generate an image of …”\n\n"
        "Developer: Wael Safan · NewFinity 💛"
    )


def _reply_chat(chat_id: int, user_text: str, settings: Settings) -> None:
    hist = history_block_for_prompt(chat_id)
    bundle = f"{hist}Current user message:\n{user_text}"
    append_turn(chat_id, "user", user_text)
    tg = TelegramService(settings)
    try:
        service = LLMService(settings, PromptManager())
        reply = service.chat(bundle)
    except LLMError as exc:
        logger.warning("Telegram chat LLM error: %s", exc)
        reply = (
            "Oh no — I couldn’t reach my thinking cap just then. "
            f"({exc!s}) Try again in a moment? I’m right here. 🌸"
        )
    append_turn(chat_id, "assistant", reply)
    tg.send_message_to_chat(chat_id, reply[:4096])


def _handle_image(chat_id: int, prompt: str, settings: Settings) -> None:
    tg = TelegramService(settings)
    tg.send_message_to_chat(chat_id, "On it — sketching that for you now… 🎨✨")
    try:
        raw, _mime = generate_image_bytes(
            api_key=settings.gemini_api_key,
            model=settings.gemini_image_model,
            prompt=prompt,
        )
    except LLMError as exc:
        logger.warning("Telegram image gen failed: %s", exc)
        tg.send_message_to_chat(
            chat_id,
            f"I couldn’t finish that picture ({exc!s}). Want to try a simpler prompt? 💛",
        )
        return
    try:
        tg.send_photo_to_chat(
            chat_id,
            raw,
            caption="Here you go — hope it makes you smile! 🌸",
            filename="tunde_generated.png",
        )
    except Exception:
        logger.exception("Telegram send_photo_to_chat failed")
        tg.send_message_to_chat(chat_id, "I made the image but Telegram refused the upload — try again? 💛")


def _consume_pending_report_email(cid_int: int, text: str, settings: Settings) -> bool:
    """
    If this chat is waiting for recipient address(es) after “Send to Email”, handle the reply.

    Returns True if the message was handled (including “need valid addresses” prompts).
    """
    rid = get_pending_report_email(cid_int)
    if not rid:
        return False

    if text.strip().startswith("/"):
        tg = TelegramService(settings)
        tg.send_message_to_chat(
            cid_int,
            "I’m still waiting for the email address(es) for that report. Send them on this line "
            "(comma-separated), or say /cancel_email. 💛",
        )
        return True

    emails = parse_email_addresses(text)
    tg = TelegramService(settings)
    if not emails:
        hint = (
            "I didn’t find a valid email address. Try: you@company.com or "
            "you@company.com, teammate@company.com\n"
            "Or say /cancel_email to abort."
        )
        if "@" in text:
            hint = (
                "That doesn’t look like a valid email format. Check for typos, or send comma-separated "
                "addresses.\n/cancel_email to abort."
            )
        tg.send_message_to_chat(cid_int, hint)
        return True

    if not smtp_configured(settings):
        clear_pending_report_email(cid_int)
        tg.send_message_to_chat(cid_int, "SMTP isn’t configured — I can’t send mail. 💛")
        return True

    loaded = load_report_for_export(rid)
    if not loaded:
        clear_pending_report_email(cid_int)
        tg.send_message_to_chat(cid_int, "That report file isn’t available anymore — run a new mission. 💛")
        return True

    title, plain = loaded
    url = _build_report_page_url(settings, rid)
    summary = plain[:4000] + ("…" if len(plain) > 4000 else "")
    subj = f"Tunde report: {title[:80]}"

    try:
        pdf_b = build_professional_pdf_from_report(rid)
    except Exception:
        logger.exception("PDF build for email failed rid=%s", rid[:16])
        pdf_b = b""

    attach = pdf_b if len(pdf_b) > 50 else None
    try:
        send_report_to_recipients(
            settings,
            to_emails=emails,
            subject=subj,
            summary_plain=summary,
            report_url=url,
            pdf_bytes=attach,
        )
    except ReportEmailError as exc:
        tg.send_message_to_chat(cid_int, f"Email didn’t go through ({exc!s}). Check SMTP and addresses. 📧")
        return True

    clear_pending_report_email(cid_int)
    from_addr = (settings.report_from_email or "reports@tundeai.com").strip()
    tg.send_message_to_chat(
        cid_int,
        f"Sent to {', '.join(emails)} from {from_addr} (PDF attached when available). ✨",
    )
    return True


def _spawn_mission(chat_id: int, topic: str, settings: Settings) -> None:
    clear_report_chat_context(chat_id)

    def run() -> None:
        from tunde_agent.services.mission_service import execute_research_mission

        try:
            execute_research_mission(
                SMOKE_TEST_USER_ID,
                topic,
                None,
                telegram_progress_chat_id=str(chat_id),
            )
        except Exception:
            logger.exception("Telegram-triggered mission failed topic=%r", topic[:120])

    threading.Thread(target=run, daemon=True, name=f"tunde-mission-{chat_id}").start()


def process_incoming_message(msg: dict, settings: Settings | None = None) -> None:
    """Handle one private ``message`` dict from Bot API (text, voice placeholder, commands)."""
    settings = settings or get_settings()
    chat = msg.get("chat") if isinstance(msg.get("chat"), dict) else {}
    cid = chat.get("id")
    ctype = chat.get("type")
    if cid is None or ctype != "private":
        return

    cid_int = int(cid)
    save_operator_chat_id(cid_int)
    tg = TelegramService(settings)

    if msg.get("voice") or msg.get("video_note"):
        tg.send_message_to_chat(
            cid_int,
            "I can’t process voice or video notes yet — send me text and I’m all ears! 🌸",
        )
        return

    text = (msg.get("text") or "").strip()
    if not text:
        tg.send_message_to_chat(
            cid_int,
            "I didn’t catch any text — try typing your message? 💛",
        )
        return

    low = text.lower()
    if low.startswith("/start"):
        tg.send_message_to_chat(cid_int, _welcome_text())
        return

    if low.startswith("/help") or low.startswith("/help@"):
        tg.send_message_to_chat(cid_int, _help_text())
        return

    if low == "/cancel_email" or low.startswith("/cancel_email@"):
        if get_pending_report_email(cid_int):
            clear_pending_report_email(cid_int)
            tg.send_message_to_chat(cid_int, "Cancelled — I won’t send that report by email. 💛")
        else:
            tg.send_message_to_chat(cid_int, "No email delivery was waiting on an address. 💛")
        return

    if low in ("/done", "/exitreport", "/reportdone"):
        clear_pending_report_email(cid_int)
        clear_report_chat_context(cid_int)
        tg.send_message_to_chat(cid_int, "Back to normal chat — what’s on your mind? 💛")
        return

    if _consume_pending_report_email(cid_int, text, settings):
        return

    m_cmd = _CMD_RE.match(text)
    if m_cmd:
        topic = (m_cmd.group(2) or "").strip()
        if not topic:
            tg.send_message_to_chat(
                cid_int,
                "Tell me what to research — e.g. `/research Gold prices today` 🌸",
            )
            return
        _spawn_mission(cid_int, topic, settings)
        return

    rm = _RESEARCH_PHRASE.match(text)
    if rm and rm.group(1).strip():
        _spawn_mission(cid_int, rm.group(1).strip(), settings)
        return

    am = _ANALYSIS_PHRASE.match(text)
    if am and am.group(1).strip():
        _spawn_mission(cid_int, am.group(1).strip(), settings)
        return

    if len(text) >= 15 and _COMPLEX_MISSION_TRIGGERS.search(text):
        tg.send_message_to_chat(
            cid_int,
            "Launching a full research mission for this — I’ll pull live sources, build your report, "
            "and you’ll get PDF / Word / CSV and the rest when it lands. ⚡",
        )
        _spawn_mission(cid_int, text.strip(), settings)
        return

    for rx in _IMG_RES:
        im = rx.match(text)
        if im:
            prompt = (im.group(1) or "").strip()
            if prompt:
                _handle_image(cid_int, prompt, settings)
                return

    ctx = get_report_chat_context(cid_int)
    if ctx:
        excerpt = ctx.get("excerpt") or ""
        rid = ctx.get("report_id") or ""
        hist = history_block_for_prompt(cid_int)
        bundle = (
            f"{hist}You are answering questions about the user's saved Tunde report "
            f"(report id prefix {rid[:8]}…). Ground answers in the excerpt when relevant; "
            "if something is not in the excerpt, say so honestly.\n\n"
            f"--- Report excerpt ---\n{excerpt}\n--- End excerpt ---\n\n"
            "Give concrete, execution-oriented answers; use figures or labeled estimates when helpful.\n\n"
            f"User message:\n{text}"
        )
        append_turn(cid_int, "user", text)
        try:
            service = LLMService(settings, PromptManager())
            reply = service.chat(bundle)
        except LLMError as exc:
            logger.warning("Telegram report-context LLM error: %s", exc)
            reply = f"I hit a snag ({exc!s}) — try again? 🌸"
        append_turn(cid_int, "assistant", reply)
        tg.send_message_to_chat(cid_int, reply[:4096])
        return

    _reply_chat(cid_int, text, settings)
