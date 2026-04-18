"""After “🎨 Landing page”, wait for the user’s design/layout description in Telegram."""

from __future__ import annotations

from threading import Lock

_lock = Lock()
_pending: dict[int, str] = {}


def set_pending_landing_design(chat_id: int, report_id: str) -> None:
    with _lock:
        _pending[int(chat_id)] = str(report_id).strip()


def get_pending_landing_design(chat_id: int) -> str | None:
    with _lock:
        rid = _pending.get(int(chat_id))
        return rid if rid else None


def clear_pending_landing_design(chat_id: int) -> None:
    with _lock:
        _pending.pop(int(chat_id), None)
