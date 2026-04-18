"""
CallbackQueryHandler: single dispatch point for all Telegram inline buttons.

This keeps button handling centralized and enforces the “no-command” UX:
- Menus use prefix ``u:`` (nested inline keyboards, message editing).
- Approvals use ``a:`` / ``d:``.
- Post-report actions use one-letter prefixes (o/l/f/w/g/b/m/q/v/s) + ``:uuid``.
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from typing import Any

from tunde_agent.config.settings import Settings
from tunde_agent.db.session import resolve_approval_from_telegram_callback
from telegram_agent_core.services.telegram_post_task_handlers import process_post_task_callback
from telegram_agent_core.services.telegram_service import TelegramService
from telegram_agent_core.services.telegram_ux_menus import process_ux_callback_query

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class CallbackQueryHandler:
    """Routes callback queries to the correct handler."""

    settings: Settings

    def handle(self, cq: dict[str, Any]) -> None:
        cqid = cq.get("id")
        if not isinstance(cqid, str):
            return

        raw = cq.get("data")
        if not isinstance(raw, str) or ":" not in raw:
            TelegramService(self.settings).answer_callback_query(cqid, text="Invalid action.")
            return

        prefix, _, rest = raw.partition(":")
        tg = TelegramService(self.settings)

        # UX menus (nested framework)
        if raw.startswith("u:"):
            try:
                process_ux_callback_query(cq, self.settings)
            except Exception:
                logger.exception("CallbackQueryHandler: UX callback failed")
                tg.answer_callback_query(cqid, text="Server error.")
            return

        # Post-report actions (exports, follow-ups)
        if prefix in ("o", "l", "f", "w", "g", "b", "m", "q", "v", "s"):
            try:
                rid = uuid.UUID(rest.strip())
            except ValueError:
                tg.answer_callback_query(cqid, text="Invalid action.")
                return
            msg = cq.get("message") if isinstance(cq.get("message"), dict) else {}
            ch = msg.get("chat") if isinstance(msg.get("chat"), dict) else {}
            chat_id = ch.get("id")
            if chat_id is None:
                tg.answer_callback_query(cqid, text="No chat.")
                return
            try:
                process_post_task_callback(
                    prefix=prefix,
                    report_id=str(rid),
                    chat_id=int(chat_id),
                    callback_query_id=cqid,
                    settings=self.settings,
                )
            except Exception:
                logger.exception("CallbackQueryHandler: post-task callback failed")
                tg.answer_callback_query(cqid, text="Server error.")
            return

        # Approvals
        if prefix in ("a", "d"):
            approve = prefix == "a"
            try:
                rid = uuid.UUID(rest.strip())
            except ValueError:
                tg.answer_callback_query(cqid, text="Invalid action.")
                return
            try:
                changed = resolve_approval_from_telegram_callback(rid, approve)
            except Exception:
                logger.exception("CallbackQueryHandler: approval DB update failed request_id=%s", rid)
                tg.answer_callback_query(cqid, text="Server error.")
                return
            tg.answer_callback_query(cqid, text="Recorded." if changed else "Already handled.")
            return

        tg.answer_callback_query(cqid, text="Unknown action.")

