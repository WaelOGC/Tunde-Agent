"""Per-chat conversation memory for Telegram (last few turns, in-process only)."""

from __future__ import annotations

from collections import deque
from threading import Lock

_MAX_TURNS = 6  # user+assistant pairs counted as two entries
_lock = Lock()
_sessions: dict[int, deque[tuple[str, str]]] = {}


def append_turn(chat_id: int, role: str, text: str) -> None:
    """Store one message; ``role`` is ``user`` or ``assistant``."""
    t = (text or "").strip()
    if not t:
        return
    r = role.strip().lower()
    if r not in ("user", "assistant"):
        return
    with _lock:
        q = _sessions.setdefault(int(chat_id), deque(maxlen=_MAX_TURNS))
        q.append((r, t[:4000]))


def history_block_for_prompt(chat_id: int) -> str:
    """Format recent turns for a single user bundle to the LLM."""
    with _lock:
        q = _sessions.get(int(chat_id))
        if not q:
            return ""
        lines: list[str] = ["Recent conversation (for context only):"]
        for role, text in q:
            who = "User" if role == "user" else "Tunde"
            lines.append(f"{who}: {text}")
        lines.append("---")
        return "\n".join(lines) + "\n"
