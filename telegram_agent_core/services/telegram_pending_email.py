"""After “Send to Email”, wait for the user’s comma-separated addresses in Telegram."""

from __future__ import annotations

import re
from threading import Lock

_EMAIL_RE = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.I)

_lock = Lock()
_pending: dict[int, str] = {}


def set_pending_report_email(chat_id: int, report_id: str) -> None:
    with _lock:
        _pending[int(chat_id)] = str(report_id).strip()


def get_pending_report_email(chat_id: int) -> str | None:
    with _lock:
        rid = _pending.get(int(chat_id))
        return rid if rid else None


def clear_pending_report_email(chat_id: int) -> None:
    with _lock:
        _pending.pop(int(chat_id), None)


def parse_email_addresses(text: str) -> list[str]:
    """Unique addresses in order of first appearance (case-folded)."""
    seen: set[str] = set()
    out: list[str] = []
    for m in _EMAIL_RE.finditer(text or ""):
        e = m.group(0).strip().lower()
        if e not in seen:
            seen.add(e)
            out.append(e)
    return out
