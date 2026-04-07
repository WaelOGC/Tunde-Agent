"""Per-chat “ask about this report” mode (Telegram)."""

from __future__ import annotations

from threading import Lock

_lock = Lock()
# chat_id -> { "report_id": str, "excerpt": str }
_active: dict[int, dict[str, str]] = {}


def set_report_chat_context(chat_id: int, report_id: str, excerpt_plain: str, *, max_excerpt: int = 12_000) -> None:
    ex = (excerpt_plain or "").strip()[:max_excerpt]
    with _lock:
        _active[int(chat_id)] = {"report_id": report_id.strip(), "excerpt": ex}


def get_report_chat_context(chat_id: int) -> dict[str, str] | None:
    with _lock:
        return _active.get(int(chat_id))


def clear_report_chat_context(chat_id: int) -> None:
    with _lock:
        _active.pop(int(chat_id), None)
