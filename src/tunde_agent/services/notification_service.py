"""
Human handoff notifications (CAPTCHA, approvals). See captcha_handling_policy.md and human_approval_gate.md.

Console + AuditLog today; Telegram is a deliberate placeholder for a later phase.
"""

from __future__ import annotations

import json
import logging
import uuid

from tunde_agent.db.session import db_session
from tunde_agent.models.audit_log import AuditLog

logger = logging.getLogger(__name__)


class NotificationService:
    """Dispatch alerts for operator action; persists CAPTCHA handoffs to ``audit_logs``."""

    def __init__(self, user_id: uuid.UUID) -> None:
        self._user_id = user_id

    def notify_captcha_handoff(
        self,
        url: str,
        *,
        captcha_kind: str | None = None,
        screenshot_png: bytes | None = None,
    ) -> None:
        """
        Log to console, write AuditLog, send Telegram (screenshot + caption when configured).

        Uses the canonical operator-facing sentence required by product policy.
        """
        line = f"ACTION REQUIRED: CAPTCHA detected at [{url}]. Please solve manually."
        logger.warning("%s", line)

        payload = {
            "message": line,
            "url": url,
            "kind": captcha_kind,
            "channel": "console+audit+telegram",
            "telegram_photo": bool(screenshot_png),
        }
        self._persist_audit("captcha_handoff", payload)
        self._telegram_captcha(line, url=url, kind=captcha_kind, screenshot_png=screenshot_png)

    def _persist_audit(self, action_type: str, payload: dict) -> None:
        with db_session(self._user_id) as session:
            session.add(
                AuditLog(
                    user_id=self._user_id,
                    action_type=action_type,
                    details=json.dumps(payload, separators=(",", ":")),
                )
            )

    def _telegram_captcha(
        self,
        text: str,
        *,
        url: str,
        kind: str | None,
        screenshot_png: bytes | None,
    ) -> None:
        from tunde_agent.config.settings import get_settings
        from tunde_agent.services.telegram_service import TelegramService

        svc = TelegramService(get_settings())
        if not svc.token:
            logger.debug("Telegram not configured (TELEGRAM_TOKEN empty); skip.")
            return
        try:
            if screenshot_png:
                svc.send_captcha_image(screenshot_png, url)
            else:
                svc.send_text(f"{text}\n\nKind: {kind or 'unknown'}")
        except Exception:
            logger.exception("Telegram CAPTCHA notification failed for url=%s", url[:120])
