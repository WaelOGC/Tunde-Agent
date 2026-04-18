"""
Long-polling worker for Telegram updates (callback_query + message).

Runs in a daemon thread started from FastAPI lifespan. Replaces webhook delivery for approvals.
"""

from __future__ import annotations

import json
import logging
import threading
import time
import uuid

import httpx

from tunde_agent.config.settings import Settings, get_settings
from telegram_agent_core.services.telegram_chat_handler import process_incoming_message
from telegram_agent_core.services.telegram_callback_handler import CallbackQueryHandler
from telegram_agent_core.services.telegram_service import TelegramService

logger = logging.getLogger(__name__)

# getUpdates long-poll interval (seconds). Telegram allows 0–50; ~25 balances latency vs wake-ups.
_GET_UPDATES_TIMEOUT = 25


def _mask_token_hint(token: str) -> str:
    t = token.strip()
    if len(t) <= 8:
        return "(short)"
    return f"...{t[-6:]}"


def process_telegram_update(update: dict, settings: Settings) -> None:
    """Handle one Bot API update dict (callback or message)."""
    cq = update.get("callback_query")
    if isinstance(cq, dict):
        _process_callback_query(cq, settings)
        return

    msg = update.get("message")
    if isinstance(msg, dict):
        chat = msg.get("chat") if isinstance(msg.get("chat"), dict) else {}
        cid = chat.get("id")
        ctype = chat.get("type")
        text = (msg.get("text") or "").strip()

        if cid is not None and ctype == "private":
            process_incoming_message(msg, settings)

        print(
            f"Update received: [message] update_id={update.get('update_id')} "
            f"chat_id={cid} type={ctype!r} text={text!r}",
            flush=True,
        )
        return

    print(
        f"Update received: [other] update_id={update.get('update_id')} keys={list(update.keys())}",
        flush=True,
    )


def _process_callback_query(cq: dict, settings: Settings) -> None:
    CallbackQueryHandler(settings).handle(cq)


def _telegram_polling_loop(stop: threading.Event) -> None:
    settings = get_settings()
    token = (settings.telegram_token or "").strip()
    chat_id = (settings.telegram_chat_id or "").strip()

    print(
        f"Telegram env: token_set={bool(token)} token_hint={_mask_token_hint(token) if token else 'n/a'} "
        f"MY_TELEGRAM_CHAT_ID={chat_id!r}",
        flush=True,
    )

    if not token:
        print("Telegram polling skipped: TELEGRAM_TOKEN is empty.", flush=True)
        return

    svc = TelegramService(settings)
    if svc.delete_webhook(drop_pending_updates=True):
        print("Telegram deleteWebhook ok (webhook cleared; polling enabled).", flush=True)
    else:
        print(
            "Telegram deleteWebhook failed or token invalid — polling may not receive updates.",
            flush=True,
        )

    try:
        with httpx.Client(timeout=_GET_UPDATES_TIMEOUT + 15.0) as client:
            me = client.get(f"{svc._base_url()}/getMe")
            me_body = me.json()
            if me_body.get("ok"):
                un = (me_body.get("result") or {}).get("username", "?")
                print(f"Telegram getMe ok: @{un}", flush=True)
            else:
                print(f"Telegram getMe failed: {me_body}", flush=True)
    except Exception as exc:
        print(f"Telegram getMe error: {exc!s}", flush=True)
        logger.exception("telegram getMe")

    print("Telegram Polling Started...", flush=True)

    if svc.verify_operator_chat():
        print("Telegram getChat ok: operator chat is reachable.", flush=True)
    else:
        print("=" * 72, flush=True)
        print("TELEGRAM WARNING: Operator chat is NOT reachable yet (getChat failed or chat_id empty).", flush=True)
        print("  -> Open Telegram, open your bot, press Start or send: /start", flush=True)
        print("  -> We save your chat id to data/telegram_operator_chat_id.txt (mount ./data in Docker).", flush=True)
        print("  -> Then POST /mission/start again.", flush=True)
        print("=" * 72, flush=True)

    base = svc._base_url()
    offset = 0

    with httpx.Client(timeout=_GET_UPDATES_TIMEOUT + 15.0) as client:
        while not stop.is_set():
            try:
                r = client.get(
                    f"{base}/getUpdates",
                    params={
                        "offset": offset,
                        "timeout": _GET_UPDATES_TIMEOUT,
                        "allowed_updates": json.dumps(["callback_query", "message"]),
                    },
                )
                data = r.json()
            except Exception as exc:
                logger.exception("telegram getUpdates request failed")
                print(f"Telegram getUpdates error: {exc!s}", flush=True)
                time.sleep(2)
                continue

            if not isinstance(data, dict) or not data.get("ok"):
                raw = ""
                try:
                    raw = r.text[:300]
                except Exception:
                    pass
                desc = (data.get("description") if isinstance(data, dict) else None) or raw
                logger.error("Telegram getUpdates not ok: %s", desc)
                print(f"Telegram getUpdates failed: {desc}", flush=True)
                time.sleep(2)
                continue

            for u in data.get("result") or []:
                try:
                    uid = int(u["update_id"])
                    offset = uid + 1
                except (KeyError, TypeError, ValueError):
                    continue
                process_telegram_update(u, get_settings())

            # Short sleep so a stop event is noticed quickly if no timeout path
            if stop.wait(timeout=0.05):
                break


def start_telegram_poller_thread(stop: threading.Event) -> threading.Thread | None:
    """
    Spawn a daemon thread running the polling loop. Returns None if token missing.
    """
    token = (get_settings().telegram_token or "").strip()
    if not token:
        return None

    t = threading.Thread(target=_telegram_polling_loop, args=(stop,), name="telegram-poller", daemon=True)
    t.start()
    return t
