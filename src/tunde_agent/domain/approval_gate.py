"""
Human-in-the-loop approval: persist request, notify Telegram, poll until resolved.

See docs/human_approval_gate.md.
"""

from __future__ import annotations

import logging
import time
import uuid

from tunde_agent.config.settings import get_settings
from tunde_agent.db.session import db_session
from tunde_agent.models.approval_request import ApprovalRequest
from tunde_agent.services.telegram_service import TelegramService

logger = logging.getLogger(__name__)


def request_human_approval(
    user_id: uuid.UUID,
    action_type: str,
    payload: dict,
    *,
    message: str | None = None,
    timeout_s: float = 600.0,
    poll_interval_s: float = 1.5,
    photo_png: bytes | None = None,
    photo_filename: str = "research.png",
    photo_caption_parse_mode: str | None = None,
) -> tuple[bool, str]:
    """
    Create a pending ``ApprovalRequest``, notify Telegram (text or photo + inline buttons), then poll the DB.

    When ``photo_png`` is set, sends one ``sendPhoto`` with ``message`` as the caption and the same
    ✅/❌ keyboard. Telegram chat id always comes from settings (``MY_TELEGRAM_CHAT_ID``), not ``user_id``.

    Returns ``(True, "approved")`` on approve, ``(False, "denied")`` if the user denied,
    or ``(False, "timeout")`` if the request stayed pending until ``timeout_s``.
    """
    with db_session(user_id) as session:
        row = ApprovalRequest(
            user_id=user_id,
            action_type=action_type,
            payload=payload or {},
            status=ApprovalRequest.STATUS_PENDING,
        )
        session.add(row)
        session.flush()
        request_id = row.id

    final_message = message or (
        f"Approval required\n\nAction: `{action_type}`\nID: `{request_id}`"
    )
    try:
        tg = TelegramService(get_settings())
        if photo_png is not None:
            tg.send_photo(
                bytes(photo_png),
                final_message,
                filename=photo_filename,
                request_id=request_id,
                caption_parse_mode=photo_caption_parse_mode,
            )
        else:
            tg.send_approval_request(request_id, final_message)
    except Exception:
        logger.exception(
            "Telegram approval notify failed; still polling DB for request_id=%s", request_id
        )

    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        with db_session(user_id) as session:
            current = session.get(ApprovalRequest, request_id)
            if current is None:
                logger.warning("ApprovalRequest %s missing during poll", request_id)
                return False, "error"
            if current.status == ApprovalRequest.STATUS_APPROVED:
                return True, "approved"
            if current.status == ApprovalRequest.STATUS_DENIED:
                return False, "denied"
        time.sleep(poll_interval_s)

    logger.warning("Human approval timed out request_id=%s action_type=%s", request_id, action_type)
    return False, "timeout"
