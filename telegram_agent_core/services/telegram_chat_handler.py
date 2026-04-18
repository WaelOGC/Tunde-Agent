"""
Telegram private-chat conversational layer for Tunde (small talk, research trigger, image gen).

Runs synchronously from the polling thread; long work uses background threads.
"""

from __future__ import annotations

import html
import json
import logging
import re
import threading

from tunde_agent.config.settings import Settings, get_settings
from tunde_agent.constants import SMOKE_TEST_USER_ID
from tunde_agent.services.gemini_image_generation import (
    generate_image_bytes,
    generate_image_from_reference_bytes,
)
from tunde_agent.services.gemini_veo_video import generate_video_mp4_for_preset
from tunde_agent.services.generation_service import (
    generate_custom_landing_html,
    write_landing_html_file,
)
from tunde_agent.services.llm_service import LLMError, LLMService
from tunde_agent.services.prompt_manager import PromptManager
from telegram_agent_core.services.telegram_operator_chat import save_operator_chat_id
from tunde_agent.services.mission_service import _build_report_page_url
from tunde_agent.services.report_email import ReportEmailError, send_report_to_recipients, smtp_configured
from tunde_agent.services.reporter import build_professional_pdf_from_report, load_report_for_export
from telegram_agent_core.services.telegram_markdown_v2 import telegram_inline_keyboard_url_allowed
from telegram_agent_core.services.telegram_pending_email import (
    clear_pending_report_email,
    get_pending_report_email,
    parse_email_addresses,
)
from telegram_agent_core.services.telegram_pending_landing_design import (
    clear_pending_landing_design,
    get_pending_landing_design,
)
from telegram_agent_core.services.telegram_pending_photo_edit import (
    clear_pending_photo_edit,
    get_pending_photo_edit_file_id,
    set_pending_photo_edit_file_id,
)
from telegram_agent_core.services.telegram_pending_video_generation import (
    clear_pending_video_preset,
    get_pending_video_preset,
)
from telegram_agent_core.services.telegram_ux_menus import (
    consume_pending_ux_text_message,
    main_menu_reply_markup_json,
    welcome_message_html,
)
from telegram_agent_core.services.telegram_ux_pending import (
    clear_pending_ux_flow,
    get_pending_ux_flow,
)
from telegram_agent_core.services.telegram_report_context import (
    clear_report_chat_context,
    get_report_chat_context,
)
from telegram_agent_core.services.telegram_service import TelegramService
from telegram_agent_core.services.telegram_session import append_turn, history_block_for_prompt

logger = logging.getLogger(__name__)

_CMD_RE = re.compile(
    r"^/(research|analyze|mission)(?:@[\w_]+)?\s*(.*)$",
    re.IGNORECASE | re.DOTALL,
)


def _telegram_command_stem(text: str) -> str | None:
    """First whitespace-separated token, lowercased, with optional @botname stripped."""
    stripped = (text or "").strip()
    if not stripped:
        return None
    first = stripped.split()[0]
    return first.split("@", 1)[0].lower()
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


def _friendly_llm_error() -> str:
    return "I couldn’t complete that just then — please try again in a moment."


def _help_message_html() -> str:
    return (
        "<b>Tunde</b> — button-first menus plus free-form chat.\n\n"
        "Tap <b>Start</b> (or open the menu) to choose a pillar, then I’ll ask for your topic or brief.\n"
        "After a report arrives, use the action buttons on that report for exports and follow-ups."
        "\n\n<i>Built for Visionaries by Wael Safan &amp; NewFinity</i>"
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
        reply = _friendly_llm_error() + " I’m right here. 🌸"
    append_turn(chat_id, "assistant", reply)
    tg.send_message_to_chat(chat_id, reply[:4096])


def _handle_image(chat_id: int, prompt: str, settings: Settings) -> None:
    clear_pending_photo_edit(chat_id)
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
            _friendly_llm_error() + " Want to try a simpler prompt? 💛",
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


_MAX_TELEGRAM_IMAGE_BYTES = 18 * 1024 * 1024


def _largest_photo_file_id(photos: list) -> str | None:
    best: str | None = None
    best_area = 0
    for p in photos:
        if not isinstance(p, dict):
            continue
        fid = p.get("file_id")
        if not isinstance(fid, str) or not fid.strip():
            continue
        w = int(p.get("width") or 0)
        h = int(p.get("height") or 0)
        area = w * h
        if area >= best_area:
            best_area = area
            best = fid.strip()
    return best


def _image_document_file_id_and_size(msg: dict) -> tuple[str | None, int | None]:
    doc = msg.get("document")
    if not isinstance(doc, dict):
        return None, None
    mt = (doc.get("mime_type") or "").lower()
    if not mt.startswith("image/"):
        return None, None
    fid = doc.get("file_id")
    if not isinstance(fid, str) or not fid.strip():
        return None, None
    raw_sz = doc.get("file_size")
    try:
        fsz = int(raw_sz) if raw_sz is not None else None
    except (TypeError, ValueError):
        fsz = None
    return fid.strip(), fsz


def _run_reference_image_edit_thread(chat_id: int, file_id: str, instruction: str, settings: Settings) -> None:
    def run() -> None:
        tg = TelegramService(settings)
        tg.send_message_to_chat(chat_id, "Got it — applying your edits… 🎨")
        dl = tg.fetch_telegram_file_bytes(file_id)
        if not dl:
            tg.send_message_to_chat(
                chat_id,
                "I couldn’t download that file from Telegram — try again or use a smaller image. 💛",
            )
            return
        raw, _mime = dl
        try:
            out, _out_mime = generate_image_from_reference_bytes(
                api_key=settings.gemini_api_key,
                model=settings.gemini_image_model,
                instruction=instruction,
                reference_image_bytes=raw,
            )
        except LLMError as exc:
            logger.warning("Telegram reference image edit failed: %s", exc)
            tg.send_message_to_chat(
                chat_id,
                _friendly_llm_error() + " Try a shorter or simpler edit request? 💛",
            )
            return
        try:
            tg.send_photo_to_chat(
                chat_id,
                out,
                caption="Here’s the edited version. 🌸",
                filename="tunde_edited.png",
            )
        except Exception:
            logger.exception("Telegram send_photo_to_chat (edit) failed")
            tg.send_message_to_chat(chat_id, "I made the image but Telegram refused the upload — try again? 💛")

    threading.Thread(target=run, daemon=True, name=f"tunde-photo-edit-{chat_id}").start()


def _handle_incoming_photo_or_image_document(
    cid_int: int,
    msg: dict,
    settings: Settings,
    tg: TelegramService,
    pend_ux,
) -> bool:
    """
    Photo or image document: caption + image in one step, or photo then text (pending file id).

    Returns True if this update was fully handled.
    """
    photos = msg.get("photo")
    file_id: str | None = None
    file_size: int | None = None

    if isinstance(photos, list) and photos:
        file_id = _largest_photo_file_id(photos)
        last = photos[-1] if isinstance(photos[-1], dict) else {}
        try:
            file_size = int(last["file_size"]) if last.get("file_size") is not None else None
        except (TypeError, ValueError, KeyError):
            file_size = None
    else:
        file_id, file_size = _image_document_file_id_and_size(msg)

    if not file_id:
        return False

    if not (settings.gemini_api_key or "").strip():
        tg.send_message_to_chat(
            cid_int,
            "Image editing needs the image service key configured for this deployment. 💛",
        )
        return True

    if file_size is not None and file_size > _MAX_TELEGRAM_IMAGE_BYTES:
        tg.send_message_to_chat(
            cid_int,
            "That file is a bit large — try an image under about 18 MB. 💛",
        )
        return True

    caption = (msg.get("caption") or "").strip()
    if pend_ux and getattr(pend_ux, "kind", None) == "expect_photo_for_edit":
        clear_pending_ux_flow(cid_int)
        clear_pending_video_preset(cid_int)

    if caption:
        clear_pending_photo_edit(cid_int)
        _run_reference_image_edit_thread(cid_int, file_id, caption, settings)
        return True

    clear_pending_photo_edit(cid_int)
    set_pending_photo_edit_file_id(cid_int, file_id)
    tg.send_message_to_chat(
        cid_int,
        "Photo received — now send a <b>short text message</b> describing what to change "
        "(for example: “replace the background with a soft gray studio backdrop, keep the person”).\n\n"
        "Say <code>/cancel_photo_edit</code> to cancel.",
        parse_mode="HTML",
    )
    return True


def _consume_pending_photo_edit_instruction(cid_int: int, text: str, settings: Settings) -> bool:
    fid = get_pending_photo_edit_file_id(cid_int)
    if not fid:
        return False
    low = text.strip().lower()
    if low == "/cancel_photo_edit" or low.startswith("/cancel_photo_edit@"):
        clear_pending_photo_edit(cid_int)
        TelegramService(settings).send_message_to_chat(cid_int, "Cancelled — no photo edit running. 💛")
        return True
    if text.strip().startswith("/"):
        TelegramService(settings).send_message_to_chat(
            cid_int,
            "Send your edit instructions as plain text, or say <code>/cancel_photo_edit</code>. 💛",
            parse_mode="HTML",
        )
        return True
    instr = text.strip()
    if len(instr) < 4:
        TelegramService(settings).send_message_to_chat(
            cid_int,
            "Could you add a bit more detail about what to change? 🌸",
        )
        return True
    clear_pending_photo_edit(cid_int)
    _run_reference_image_edit_thread(cid_int, fid, instr, settings)
    return True


def _run_veo_video_generation_thread(chat_id: int, preset: str, prompt: str, settings: Settings) -> None:
    def run() -> None:
        tg = TelegramService(settings)
        tg.send_message_to_chat(
            chat_id,
            f"Rendering your <b>{preset}s</b> tier video — this can take several minutes. I’ll send the MP4 here when it’s ready.",
            parse_mode="HTML",
        )
        try:
            raw = generate_video_mp4_for_preset(
                api_key=settings.gemini_api_key,
                model=settings.gemini_video_model,
                user_prompt=prompt,
                preset=preset,
                aspect_ratio=settings.veo_aspect_ratio,
                resolution=settings.veo_first_clip_resolution,
                person_generation=settings.veo_person_generation,
            )
        except LLMError as exc:
            logger.warning("Veo video generation failed: %s", exc)
            detail = str(exc).strip()
            if len(detail) > 300:
                detail = detail[:297] + "…"
            tg.send_message_to_chat(
                chat_id,
                _friendly_llm_error()
                + f" ({detail}) "
                + "Please try again in a moment — your scene text was fine; this was a pipeline or service issue. 💛",
            )
            return
        except Exception:
            logger.exception("Veo video generation unexpected error")
            tg.send_message_to_chat(chat_id, "Something went wrong while building the video — try again later. 💛")
            return
        max_tg = 48 * 1024 * 1024
        if len(raw) > max_tg:
            tg.send_message_to_chat(
                chat_id,
                "The video file is too large for Telegram from here — try the 10s tier or a shorter prompt. 💛",
            )
            return
        try:
            tg.send_video_to_chat(
                chat_id,
                raw,
                caption="Here’s your generated video. 🎬",
                filename=f"tunde-{preset}s.mp4",
            )
        except Exception:
            logger.exception("send_video_to_chat failed")
            tg.send_message_to_chat(chat_id, "Video is ready but sending through Telegram failed — try again? 💛")

    threading.Thread(target=run, daemon=True, name=f"tunde-veo-{chat_id}").start()


def _consume_pending_video_scene_description(cid_int: int, text: str, settings: Settings) -> bool:
    preset = get_pending_video_preset(cid_int)
    if not preset:
        return False
    if _telegram_command_stem(text) == "/cancel_video":
        clear_pending_video_preset(cid_int)
        TelegramService(settings).send_message_to_chat(cid_int, "Cancelled — video preset cleared. 💛")
        return True
    if text.strip().startswith("/"):
        TelegramService(settings).send_message_to_chat(
            cid_int,
            "Send your scene as plain text, or say <code>/cancel_video</code>. 💛",
            parse_mode="HTML",
        )
        return True
    scene = text.strip()
    if len(scene) < 8:
        TelegramService(settings).send_message_to_chat(
            cid_int,
            "Could you add a bit more detail for the scene (subjects, action, setting, mood)? 🌸",
        )
        return True
    clear_pending_video_preset(cid_int)
    _run_veo_video_generation_thread(cid_int, preset, scene, settings)
    return True


def _consume_pending_landing_design(cid_int: int, text: str, settings: Settings) -> bool:
    """
    If this chat is waiting for a landing-page design brief after 🎨 Landing page, handle the reply.

    Returns True when the message was consumed (including “still waiting” nudges).
    """
    rid = get_pending_landing_design(cid_int)
    if not rid:
        return False

    tg = TelegramService(settings)
    if text.strip().startswith("/"):
        tg.send_message_to_chat(
            cid_int,
            "I’m still waiting for your layout and style description. Send it as your next plain-text "
            "message, or tap <b>❌ Cancel custom page</b> on the landing instructions above. 💛",
            parse_mode="HTML",
        )
        return True

    brief = text.strip()
    if len(brief) < 10:
        tg.send_message_to_chat(
            cid_int,
            "Could you add a bit more detail (layout, colors, sections, tone)? At least one full sentence. 🌸",
        )
        return True

    clear_pending_landing_design(cid_int)
    tg.send_message_to_chat(
        cid_int,
        "Understood — I’m generating your custom landing page from that brief. I’ll send the link and "
        "full source here in a moment. ✨",
    )

    def _run_landing_job() -> None:
        tg2 = TelegramService(settings)
        try:
            html_doc = generate_custom_landing_html(settings, rid, brief)
            write_landing_html_file(rid, html_doc)
            url = _build_report_page_url(settings, rid).strip()
            esc = html.escape(url, quote=True)
            msg = (
                "<b>Your landing page is ready.</b>\n\n"
                f'<a href="{esc}">Open in browser</a>\n\n'
                "<i>Same URL as before — the live page is updated. Full source is attached.</i>"
            )
            markup_json: str | None = None
            if telegram_inline_keyboard_url_allowed(url):
                markup_json = json.dumps(
                    {"inline_keyboard": [[{"text": "🔗 Open in browser", "url": url[:2048]}]]},
                    separators=(",", ":"),
                )
            tg2.send_message_to_chat(
                cid_int,
                msg,
                parse_mode="HTML",
                reply_markup_json=markup_json,
            )
            tg2.send_document_to_chat(
                cid_int,
                html_doc.encode("utf-8"),
                "Full HTML/CSS/JS source for this session.",
                filename=f"tunde-landing-{rid[:8]}.html",
                mime="text/html",
            )
        except LLMError as exc:
            logger.warning("Custom landing LLM failed: %s", exc)
            tg2.send_message_to_chat(
                cid_int,
                _friendly_llm_error() + " Tap 🎨 Landing page on the report to try again. 💛",
            )
        except Exception:
            logger.exception("Custom landing generation failed rid=%s", rid[:16])
            tg2.send_message_to_chat(
                cid_int,
                "Something went wrong while building the page — please try 🎨 Landing page again. 💛",
            )

    threading.Thread(target=_run_landing_job, daemon=True, name=f"tunde-landing-{rid[:8]}").start()
    return True


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
            "(comma-separated), or tap <b>Cancel email</b> on the instructions above. 💛",
            parse_mode="HTML",
        )
        return True

    emails = parse_email_addresses(text)
    tg = TelegramService(settings)
    if not emails:
        hint = (
            "I didn’t find a valid email address. Try: you@company.com or "
            "you@company.com, teammate@company.com — or tap Cancel email on the prompt above."
        )
        if "@" in text:
            hint = (
                "That doesn’t look like a valid email format. Check for typos, or send comma-separated "
                "addresses. You can also tap Cancel email on the prompt above."
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
    clear_pending_ux_flow(chat_id)
    clear_pending_photo_edit(chat_id)
    clear_pending_video_preset(chat_id)
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

    pend_ux = get_pending_ux_flow(cid_int)
    has_visual = bool(msg.get("photo")) or (
        isinstance(msg.get("document"), dict)
        and str((msg.get("document") or {}).get("mime_type") or "").lower().startswith("image/")
    )

    if pend_ux and pend_ux.kind in ("mission_topic", "image_style") and has_visual:
        tg.send_message_to_chat(
            cid_int,
            "I’m waiting for a <b>text</b> reply for that step — send plain text, or tap ⬅️ Back on the menu. 💛",
            parse_mode="HTML",
        )
        return

    if get_pending_landing_design(cid_int) and has_visual:
        tg.send_message_to_chat(
            cid_int,
            "Please send your landing brief as a <b>text</b> message. 💛",
            parse_mode="HTML",
        )
        return

    if get_pending_report_email(cid_int) and has_visual:
        tg.send_message_to_chat(
            cid_int,
            "Please send email addresses as <b>text</b> (comma-separated). 💛",
            parse_mode="HTML",
        )
        return

    if get_pending_video_preset(cid_int) and has_visual:
        tg.send_message_to_chat(
            cid_int,
            "I’m waiting for your <b>video scene description</b> as text — or tap ⬅️ Back in the menu. 💛",
            parse_mode="HTML",
        )
        return

    if has_visual and _handle_incoming_photo_or_image_document(cid_int, msg, settings, tg, pend_ux):
        return

    text = (msg.get("text") or "").strip()
    if not text:
        tg.send_message_to_chat(
            cid_int,
            "Send <b>text</b>, a <b>photo</b> (with or without a caption describing edits), "
            "or open the menu with <b>/start</b>.",
            parse_mode="HTML",
        )
        return

    low = text.lower()
    if low.startswith("/start"):
        clear_pending_ux_flow(cid_int)
        clear_pending_photo_edit(cid_int)
        clear_pending_video_preset(cid_int)
        tg.send_message_to_chat(
            cid_int,
            welcome_message_html(),
            parse_mode="HTML",
            reply_markup_json=main_menu_reply_markup_json(),
        )
        return

    if low.startswith("/help") or low.startswith("/help@"):
        # No-command UX: /help shows the same menu-first guidance as /start.
        tg.send_message_to_chat(
            cid_int,
            welcome_message_html(),
            parse_mode="HTML",
            reply_markup_json=main_menu_reply_markup_json(),
        )
        return

    # No-command UX: do not expose legacy slash commands. Keep /start as the main entry.
    if low.startswith("/") and not low.startswith("/start"):
        tg.send_message_to_chat(
            cid_int,
            "Use the buttons to navigate — I’ll guide you step by step from the menu. 💛",
        )
        tg.send_message_to_chat(
            cid_int,
            welcome_message_html(),
            parse_mode="HTML",
            reply_markup_json=main_menu_reply_markup_json(),
        )
        return

    if _consume_pending_photo_edit_instruction(cid_int, text, settings):
        return

    if _consume_pending_video_scene_description(cid_int, text, settings):
        return

    if _consume_pending_landing_design(cid_int, text, settings):
        return

    if _consume_pending_report_email(cid_int, text, settings):
        return

    if consume_pending_ux_text_message(cid_int, text, settings):
        return

    # Legacy command triggers (e.g. /research) are intentionally not supported in the “no-command” UX.

    rm = _RESEARCH_PHRASE.match(text)
    if rm and rm.group(1).strip():
        clear_pending_ux_flow(cid_int)
        clear_pending_photo_edit(cid_int)
        clear_pending_video_preset(cid_int)
        _spawn_mission(cid_int, rm.group(1).strip(), settings)
        return

    am = _ANALYSIS_PHRASE.match(text)
    if am and am.group(1).strip():
        clear_pending_ux_flow(cid_int)
        clear_pending_photo_edit(cid_int)
        clear_pending_video_preset(cid_int)
        _spawn_mission(cid_int, am.group(1).strip(), settings)
        return

    if len(text) >= 15 and _COMPLEX_MISSION_TRIGGERS.search(text):
        clear_pending_ux_flow(cid_int)
        clear_pending_photo_edit(cid_int)
        clear_pending_video_preset(cid_int)
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
            clear_pending_ux_flow(cid_int)
            clear_pending_photo_edit(cid_int)
            clear_pending_video_preset(cid_int)
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
            reply = _friendly_llm_error() + " Try again? 🌸"
        append_turn(cid_int, "assistant", reply)
        tg.send_message_to_chat(cid_int, reply[:4096])
        return

    _reply_chat(cid_int, text, settings)
