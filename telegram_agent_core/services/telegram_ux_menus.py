"""
Nested inline Telegram menus (button-first UX).

Callback data uses prefix ``u:`` (see ``telegram_poller._process_callback_query``). All user-facing
copy avoids naming third-party model providers.
"""

from __future__ import annotations

import json
import logging
import threading
import uuid
from typing import Any

from tunde_agent.config.settings import Settings
from tunde_agent.constants import SMOKE_TEST_USER_ID
from tunde_agent.services.gemini_image_generation import generate_image_bytes
from tunde_agent.services.llm_service import LLMError
from tunde_agent.services.mission_service import execute_research_mission
from telegram_agent_core.services.telegram_pending_email import clear_pending_report_email
from telegram_agent_core.services.telegram_pending_landing_design import clear_pending_landing_design
from telegram_agent_core.services.telegram_pending_photo_edit import clear_pending_photo_edit
from telegram_agent_core.services.telegram_pending_video_generation import (
    clear_pending_video_preset,
    set_pending_video_preset,
)
from telegram_agent_core.services.telegram_report_context import clear_report_chat_context
from telegram_agent_core.services.telegram_service import TelegramService
from telegram_agent_core.services.telegram_ux_pending import (
    PendingUxFlow,
    clear_pending_ux_flow,
    get_pending_ux_flow,
    set_pending_ux_flow,
)

logger = logging.getLogger(__name__)

BRANDING_FOOTER_HTML = "\n\n<i>Built for Visionaries by Wael Safan &amp; NewFinity</i>"


def _clear_ux_menu_navigation_state(chat_id: int) -> None:
    """Drop menu + two-step photo-edit / video waits when the operator moves to another screen."""
    clear_pending_ux_flow(chat_id)
    clear_pending_photo_edit(chat_id)
    clear_pending_video_preset(chat_id)

# --- Callback payloads (must stay ≤ 64 bytes; ``u:cl:{uuid}`` is longest) ---


def _cb(data: str) -> dict[str, str]:
    return {"text": data, "callback_data": data}


def main_menu_reply_markup_json() -> str:
    rows = [
        [_cb("u:p1")],
        [_cb("u:p2")],
        [_cb("u:p3")],
        [_cb("u:p4")],
        [_cb("u:p5")],
        [_cb("u:abt")],
    ]
    return _keyboard_json(rows, button_text_overrides={
        "u:p1": "🏢 Business & Market Intelligence",
        "u:p2": "🔬 Engineering & Technical Design",
        "u:p3": "🎨 Creative Media Studio",
        "u:p4": "🎬 Pro Video Generation",
        "u:p5": "🌐 Web & Landing Solutions",
        "u:abt": "ℹ️ About",
    })


def _keyboard_json(
    rows: list[list[dict[str, str]]],
    *,
    button_text_overrides: dict[str, str] | None = None,
) -> str:
    ov = button_text_overrides or {}
    out: list[list[dict[str, str]]] = []
    for row in rows:
        new_row: list[dict[str, str]] = []
        for btn in row:
            raw = btn["callback_data"]
            text = ov.get(raw, btn.get("text", raw))
            new_row.append({"text": text, "callback_data": raw})
        out.append(new_row)
    raw = json.dumps({"inline_keyboard": out}, separators=(",", ":"))
    data = json.loads(raw)
    for row in data["inline_keyboard"]:
        for btn in row:
            cb = btn.get("callback_data") or ""
            if len(cb.encode("utf-8")) > 64:
                raise ValueError(f"callback_data too long: {cb!r}")
    return raw


def _back_main_row() -> list[dict[str, str]]:
    return [{"text": "⬅️ Back to Main Menu", "callback_data": "u:main"}]


def pillar_business_markup_json() -> str:
    rows = [
        [_cb("u:t:bma"), _cb("u:t:bci")],
        [_cb("u:t:bfc"), _cb("u:t:bst")],
        _back_main_row(),
    ]
    return _keyboard_json(rows, button_text_overrides={
        "u:t:bma": "📈 Market analysis",
        "u:t:bci": "🏢 Competitive intelligence",
        "u:t:bfc": "📋 Feasibility & business case",
        "u:t:bst": "🔎 SWOT / strategic scan",
    })


def pillar_engineering_markup_json() -> str:
    rows = [
        [_cb("u:t:etd")],
        [_cb("u:t:eas")],
        [_cb("u:t:eir")],
        _back_main_row(),
    ]
    return _keyboard_json(rows, button_text_overrides={
        "u:t:etd": "⚙️ Technical deep-dive",
        "u:t:eas": "🏗️ Architecture & systems",
        "u:t:eir": "💻 Implementation review",
    })


def pillar_creative_markup_json() -> str:
    rows = [
        [_cb("u:t:cph"), _cb("u:t:cdr")],
        [_cb("u:t:cui"), _cb("u:t:cav")],
        [_cb("u:t:phe")],
        _back_main_row(),
    ]
    return _keyboard_json(rows, button_text_overrides={
        "u:t:cph": "🖼️ Photorealistic",
        "u:t:cdr": "🖌️ Digital art",
        "u:t:cui": "📐 UI/UX concept",
        "u:t:cav": "🏢 Architectural viz",
        "u:t:phe": "📷 Edit my photo",
    })


def pillar_video_markup_json() -> str:
    rows = [
        [_cb("u:v:10"), _cb("u:v:20")],
        [_cb("u:v:30"), _cb("u:v:ani")],
        _back_main_row(),
    ]
    return _keyboard_json(rows, button_text_overrides={
        "u:v:10": "⏱️ 10 seconds",
        "u:v:20": "⏱️ 20 seconds",
        "u:v:30": "⏱️ 30 seconds",
        "u:v:ani": "🔄 Animate image",
    })


def pillar_web_markup_json() -> str:
    rows = [
        [_cb("u:t:wrp")],
        [_cb("u:il")],
        _back_main_row(),
    ]
    return _keyboard_json(rows, button_text_overrides={
        "u:t:wrp": "🔬 Deep research report",
        "u:il": "📄 Custom landing page (after report)",
    })


def welcome_message_html() -> str:
    return (
        "<b>Welcome to Tunde</b> — your research and creative studio.\n\n"
        "Use the pillars below to open guided flows. You can still type anytime for a normal "
        "conversation."
        + BRANDING_FOOTER_HTML
    )


def about_message_html() -> str:
    return (
        "<b>About Tunde</b>\n\n"
        "Tunde runs deep web research with human approval on sources, structured reports, and "
        "exports after delivery. Creative tools cover imagery, <b>photo edits</b>, and "
        "<b>pro video</b> presets (10 / 20 / 30 tiers under Pro Video). Image-to-motion “Animate image” "
        "remains on the roadmap.\n\n"
        "Tip: after a report arrives, use the action row on that message for PDF, landing page, "
        "and more."
        + BRANDING_FOOTER_HTML
    )


_TOPIC_LABELS: dict[str, tuple[str, str]] = {
    # code -> (return_menu p1..p5, short label)
    "bma": ("p1", "Market analysis"),
    "bci": ("p1", "Competitive intelligence"),
    "bfc": ("p1", "Feasibility & business case"),
    "bst": ("p1", "SWOT / strategic scan"),
    "etd": ("p2", "Technical deep-dive"),
    "eas": ("p2", "Architecture & systems"),
    "eir": ("p2", "Implementation review"),
    "cph": ("p3", "Photorealistic image"),
    "cdr": ("p3", "Digital art image"),
    "cui": ("p3", "UI/UX concept"),
    "cav": ("p3", "Architectural visualization"),
    "phe": ("p3", "Photo edit"),
    "wrp": ("p5", "Deep research report"),
}

_IMAGE_STYLE_PREFIX: dict[str, str] = {
    "cph": "Photorealistic, highly detailed, realistic lighting and materials.",
    "cdr": "Digital illustration, expressive brushwork, gallery-quality color.",
    "cui": "UI/UX product concept, clean layout, modern design system.",
    "cav": "Architectural visualization, accurate scale, materials, and environment.",
}

_MISSION_CODES = frozenset({"bma", "bci", "bfc", "bst", "etd", "eas", "eir", "wrp"})
_IMAGE_CODES = frozenset({"cph", "cdr", "cui", "cav"})
_PHOTO_EDIT_MENU_CODES = frozenset({"phe"})


def _topic_prompt_markup_json(return_menu: str) -> str:
    rid = return_menu.strip().lower()
    if rid not in {"p1", "p2", "p3", "p4", "p5"}:
        rid = "p1"
    back = f"u:bk:{rid}"
    rows = [[{"text": "⬅️ Back", "callback_data": back}]]
    return json.dumps({"inline_keyboard": rows}, separators=(",", ":"))


def _topic_prompt_html(label: str) -> str:
    return (
        f"You chose <b>{label}</b>.\n\n"
        "Send your <b>specific topic or brief</b> as your next message (plain text). "
        "I’ll run with it from there."
        + BRANDING_FOOTER_HTML
    )


def _photo_edit_menu_prompt_html() -> str:
    return (
        "<b>Photo edit</b>\n\n"
        "Send a <b>photo</b> as your next message. You can add a <b>caption</b> describing the change "
        "(for example: “replace background with soft studio gray, keep the subject”).\n\n"
        "Alternatively: send the <b>photo first</b> without a caption, then send your instructions as "
        "the following text message."
        + BRANDING_FOOTER_HTML
    )


def _pillar_markup(rest: str) -> str | None:
    if rest == "p1":
        return pillar_business_markup_json()
    if rest == "p2":
        return pillar_engineering_markup_json()
    if rest == "p3":
        return pillar_creative_markup_json()
    if rest == "p4":
        return pillar_video_markup_json()
    if rest == "p5":
        return pillar_web_markup_json()
    return None


def _pillar_title_html(rest: str) -> str | None:
    titles = {
        "p1": "<b>Business & Market Intelligence</b>\nChoose a track:",
        "p2": "<b>Engineering & Technical Design</b>\nChoose a track:",
        "p3": "<b>Creative Media Studio</b>\nChoose a style:",
        "p4": "<b>Pro Video Generation</b>\nChoose a duration tier, then describe your scene:",
        "p5": "<b>Web & Landing Solutions</b>\nChoose an option:",
    }
    body = titles.get(rest)
    if not body:
        return None
    return body + BRANDING_FOOTER_HTML


def _video_scene_prompt_html(preset: str) -> str:
    tiers = {
        "10": (
            "<b>~10s tier</b> — one Veo clip (up to <b>8 seconds</b> of video per Google’s API). "
            "Describe your scene, characters, camera, and optional dialogue or sound in your <b>next message</b>."
        ),
        "20": (
            "<b>~20s tier</b> — base clip plus extensions (about <b>22 seconds</b> total). "
            "Send your scene description as your <b>next message</b>."
        ),
        "30": (
            "<b>~30s tier</b> — base clip plus multiple extensions (about <b>29 seconds</b> total). "
            "Send your scene description as your <b>next message</b>."
        ),
    }
    core = tiers.get(preset, tiers["10"])
    return (
        core
        + "\n\nGeneration can take several minutes — I’ll send the MP4 here when it’s ready.\n"
        + "Say <code>/cancel_video</code> to cancel before you send the description."
        + BRANDING_FOOTER_HTML
    )


def _video_placeholder_html(key: str) -> str:
    lines = {
        "ani": "<b>Animate image</b> — turning stills into motion is planned; stay tuned.",
    }
    core = lines.get(key, lines["ani"])
    return core + BRANDING_FOOTER_HTML


def _info_landing_html() -> str:
    return (
        "<b>Custom landing pages</b>\n\n"
        "After each deep research report, open the delivery card and tap "
        "<b>Landing page</b> — you’ll get a two-step flow to describe layout and tone. "
        "No separate command needed."
        + BRANDING_FOOTER_HTML
    )


def _edit_menu_message(
    tg: TelegramService,
    chat_id: int,
    message_id: int,
    html: str,
    reply_markup_json: str | None,
) -> bool:
    ok, _desc = tg.edit_message_html_in_chat(
        chat_id,
        message_id,
        html,
        reply_markup_json=reply_markup_json,
    )
    return ok


def process_ux_callback_query(callback_query: dict[str, Any], settings: Settings) -> None:
    """Handle ``u:*`` inline callbacks (menus, topic prompts, cancel landing/email)."""
    cqid = callback_query.get("id")
    if not isinstance(cqid, str):
        return
    raw = callback_query.get("data")
    if not isinstance(raw, str) or not raw.startswith("u:"):
        return

    msg = callback_query.get("message") if isinstance(callback_query.get("message"), dict) else {}
    ch = msg.get("chat") if isinstance(msg.get("chat"), dict) else {}
    chat_id = ch.get("id")
    mid = msg.get("message_id")
    if chat_id is None or mid is None:
        TelegramService(settings).answer_callback_query(cqid, text="Missing message.")
        return

    chat_id_int = int(chat_id)
    message_id_int = int(mid)
    rest = raw[2:]  # after "u:"
    tg = TelegramService(settings)

    def answer(short: str | None = None) -> None:
        tg.answer_callback_query(cqid, text=short)

    try:
        if rest == "main":
            answer()
            _edit_menu_message(
                tg,
                chat_id_int,
                message_id_int,
                welcome_message_html(),
                main_menu_reply_markup_json(),
            )
            _clear_ux_menu_navigation_state(chat_id_int)
            return

        if rest == "abt":
            answer()
            _edit_menu_message(
                tg,
                chat_id_int,
                message_id_int,
                about_message_html(),
                json.dumps(
                    {"inline_keyboard": [[{"text": "⬅️ Back to Main Menu", "callback_data": "u:main"}]]},
                    separators=(",", ":"),
                ),
            )
            _clear_ux_menu_navigation_state(chat_id_int)
            return

        if rest in ("p1", "p2", "p3", "p4", "p5"):
            answer()
            mk = _pillar_markup(rest)
            title = _pillar_title_html(rest)
            if mk and title:
                _edit_menu_message(tg, chat_id_int, message_id_int, title, mk)
            _clear_ux_menu_navigation_state(chat_id_int)
            return

        if rest.startswith("bk:") and len(rest) == 5:
            sub = rest[3:]
            answer()
            mk = _pillar_markup(sub)
            title = _pillar_title_html(sub)
            if mk and title:
                _edit_menu_message(tg, chat_id_int, message_id_int, title, mk)
            _clear_ux_menu_navigation_state(chat_id_int)
            return

        if rest.startswith("t:") and len(rest) >= 5:
            code = rest[2:5]
            if code not in _TOPIC_LABELS:
                answer("Unknown option.")
                return
            return_menu, label = _TOPIC_LABELS[code]
            answer()
            if code in _PHOTO_EDIT_MENU_CODES:
                clear_pending_photo_edit(chat_id_int)
                clear_pending_video_preset(chat_id_int)
                set_pending_ux_flow(
                    chat_id_int,
                    PendingUxFlow(kind="expect_photo_for_edit", code="phe", return_menu=return_menu),
                )
                _edit_menu_message(
                    tg,
                    chat_id_int,
                    message_id_int,
                    _photo_edit_menu_prompt_html(),
                    _topic_prompt_markup_json(return_menu),
                )
                return
            if code in _MISSION_CODES:
                clear_pending_photo_edit(chat_id_int)
                clear_pending_video_preset(chat_id_int)
                set_pending_ux_flow(
                    chat_id_int,
                    PendingUxFlow(kind="mission_topic", code=code, return_menu=return_menu),
                )
                _edit_menu_message(
                    tg,
                    chat_id_int,
                    message_id_int,
                    _topic_prompt_html(label),
                    _topic_prompt_markup_json(return_menu),
                )
                return
            if code in _IMAGE_CODES:
                clear_pending_photo_edit(chat_id_int)
                clear_pending_video_preset(chat_id_int)
                set_pending_ux_flow(
                    chat_id_int,
                    PendingUxFlow(kind="image_style", code=code, return_menu=return_menu),
                )
                _edit_menu_message(
                    tg,
                    chat_id_int,
                    message_id_int,
                    _topic_prompt_html(label),
                    _topic_prompt_markup_json(return_menu),
                )
                return
            return

        if rest.startswith("v:"):
            key = rest[2:]
            answer()
            back_rows = [
                [{"text": "⬅️ Back to Main Menu", "callback_data": "u:main"}],
                [{"text": "⬅️ Back to Video", "callback_data": "u:p4"}],
            ]
            back_markup = json.dumps({"inline_keyboard": back_rows}, separators=(",", ":"))
            if key in ("10", "20", "30"):
                if not (settings.gemini_api_key or "").strip():
                    _edit_menu_message(
                        tg,
                        chat_id_int,
                        message_id_int,
                        "<b>Video generation</b>\n\nThis feature needs an API key configured in your server "
                        "environment (.env). Once it’s set, come back and try again."
                        + BRANDING_FOOTER_HTML,
                        back_markup,
                    )
                    return
                clear_pending_photo_edit(chat_id_int)
                clear_pending_ux_flow(chat_id_int)
                set_pending_video_preset(chat_id_int, key)
                _edit_menu_message(
                    tg,
                    chat_id_int,
                    message_id_int,
                    _video_scene_prompt_html(key),
                    back_markup,
                )
                return
            _clear_ux_menu_navigation_state(chat_id_int)
            _edit_menu_message(
                tg,
                chat_id_int,
                message_id_int,
                _video_placeholder_html(key),
                back_markup,
            )
            return

        if rest == "il":
            answer()
            _edit_menu_message(
                tg,
                chat_id_int,
                message_id_int,
                _info_landing_html(),
                json.dumps(
                    {
                        "inline_keyboard": [
                            [{"text": "⬅️ Back to Main Menu", "callback_data": "u:main"}],
                            [{"text": "⬅️ Back to Web", "callback_data": "u:p5"}],
                        ]
                    },
                    separators=(",", ":"),
                ),
            )
            _clear_ux_menu_navigation_state(chat_id_int)
            return

        if rest.startswith("cl:"):
            rid_part = rest[3:].strip()
            try:
                uuid.UUID(rid_part)
            except ValueError:
                answer("Invalid id.")
                return
            clear_pending_landing_design(chat_id_int)
            clear_pending_photo_edit(chat_id_int)
            clear_pending_video_preset(chat_id_int)
            answer("Cancelled.")
            _edit_menu_message(
                tg,
                chat_id_int,
                message_id_int,
                "<b>Custom landing</b> — cancelled. Open <b>Landing page</b> on a report again anytime."
                + BRANDING_FOOTER_HTML,
                json.dumps(
                    {"inline_keyboard": [[{"text": "⬅️ Main menu", "callback_data": "u:main"}]]},
                    separators=(",", ":"),
                ),
            )
            return

        if rest == "ce":
            clear_pending_report_email(chat_id_int)
            clear_pending_photo_edit(chat_id_int)
            clear_pending_video_preset(chat_id_int)
            answer("Cancelled.")
            _edit_menu_message(
                tg,
                chat_id_int,
                message_id_int,
                "<b>Email delivery</b> — cancelled."
                + BRANDING_FOOTER_HTML,
                json.dumps(
                    {"inline_keyboard": [[{"text": "⬅️ Main menu", "callback_data": "u:main"}]]},
                    separators=(",", ":"),
                ),
            )
            return

        answer("Unknown menu action.")
    except Exception:
        logger.exception("UX menu callback failed rest=%r", rest)
        tg.answer_callback_query(cqid, text="Something went wrong.")


def cancel_landing_reply_markup_json(report_id: str) -> str | None:
    rid = str(report_id).strip()
    try:
        uuid.UUID(rid)
    except ValueError:
        return None
    cb = f"u:cl:{rid}"
    if len(cb.encode("utf-8")) > 64:
        return None
    return json.dumps(
        {"inline_keyboard": [[{"text": "❌ Cancel custom page", "callback_data": cb}]]},
        separators=(",", ":"),
    )


def cancel_email_reply_markup_json() -> str:
    return json.dumps(
        {"inline_keyboard": [[{"text": "❌ Cancel email", "callback_data": "u:ce"}]]},
        separators=(",", ":"),
    )


def _user_safe_error(_exc: BaseException) -> str:
    return "The creative service hiccuped — try a simpler line or again in a moment."


def _spawn_mission_thread(chat_id: int, topic: str, settings: Settings) -> None:
    clear_report_chat_context(chat_id)

    def run() -> None:
        try:
            execute_research_mission(
                SMOKE_TEST_USER_ID,
                topic,
                None,
                telegram_progress_chat_id=str(chat_id),
            )
        except Exception:
            logger.exception("UX-triggered mission failed topic=%r", topic[:120])

    threading.Thread(target=run, daemon=True, name=f"tunde-mission-ux-{chat_id}").start()


def _run_image_job(chat_id: int, user_prompt: str, style_code: str, settings: Settings) -> None:
    prefix = _IMAGE_STYLE_PREFIX.get(style_code, "")
    full_prompt = f"{prefix}\n\n{user_prompt}".strip()

    def run() -> None:
        tg = TelegramService(settings)
        tg.send_message_to_chat(chat_id, "On it — sketching that for you…")
        try:
            raw, _mime = generate_image_bytes(
                api_key=settings.gemini_api_key,
                model=settings.gemini_image_model,
                prompt=full_prompt,
            )
        except LLMError as exc:
            logger.warning("UX image gen failed: %s", exc)
            tg.send_message_to_chat(chat_id, _user_safe_error(exc))
            return
        try:
            tg.send_photo_to_chat(
                chat_id,
                raw,
                caption="Here you go — hope it sparks ideas.",
                filename="tunde_generated.png",
            )
        except Exception:
            logger.exception("UX send_photo failed")
            tg.send_message_to_chat(chat_id, "Image ready but upload failed — try again?")

    threading.Thread(target=run, daemon=True, name=f"tunde-img-ux-{chat_id}").start()


def consume_pending_ux_text_message(chat_id: int, text: str, settings: Settings) -> bool:
    """
    If the chat is waiting for topic or image prompt after a menu pick, handle ``text``.

    Returns True when consumed.
    """
    flow = get_pending_ux_flow(chat_id)
    if not flow:
        return False

    if flow.kind == "expect_photo_for_edit":
        clear_pending_video_preset(chat_id)
        TelegramService(settings).send_message_to_chat(
            chat_id,
            "<b>Photo edit</b> — send your <b>photo</b> next (optional caption with what to change), "
            "or tap ⬅️ Back on the menu message.",
            parse_mode="HTML",
        )
        return True

    stripped = text.strip()
    if not stripped or len(stripped) < 3:
        TelegramService(settings).send_message_to_chat(
            chat_id,
            "A little more detail would help — one clear sentence is enough.",
        )
        return True

    clear_pending_ux_flow(chat_id)
    if flow.kind == "mission_topic":
        clear_pending_photo_edit(chat_id)
        clear_pending_video_preset(chat_id)
        _, label = _TOPIC_LABELS.get(flow.code, ("p1", "Research"))
        topic = f"{label}: {stripped}"
        _spawn_mission_thread(chat_id, topic, settings)
        TelegramService(settings).send_message_to_chat(
            chat_id,
            "Starting your deep research mission — watch this chat for sources to approve and the final delivery.",
        )
        return True

    if flow.kind == "image_style":
        clear_pending_photo_edit(chat_id)
        clear_pending_video_preset(chat_id)
        _run_image_job(chat_id, stripped, flow.code, settings)
        return True

    return False
