"""Track last delivered report ids per operator chat (for “compare with previous”)."""

from __future__ import annotations

from collections import deque
from threading import Lock

_lock = Lock()
# operator chat id (string) -> deque of report UUID strings, maxlen=2
_history: dict[str, deque[str]] = {}


def record_report_delivered(telegram_chat_key: str, report_id: str) -> None:
    key = str(telegram_chat_key).strip()
    rid = str(report_id).strip()
    if not key or not rid:
        return
    with _lock:
        q = _history.setdefault(key, deque(maxlen=2))
        if q and q[-1] == rid:
            return
        q.append(rid)


def get_report_pair_for_compare(telegram_chat_key: str) -> tuple[str, str] | None:
    key = str(telegram_chat_key).strip()
    with _lock:
        q = _history.get(key)
        if not q or len(q) < 2:
            return None
        a, b = q[0], q[1]
        return a, b
