"""After choosing a 10/20/30s preset, wait for the user's scene description (plain text)."""

from __future__ import annotations

from threading import Lock

_lock = Lock()
_pending: dict[int, str] = {}  # "10" | "20" | "30"


def set_pending_video_preset(chat_id: int, preset: str) -> None:
    p = str(preset).strip()
    if p not in ("10", "20", "30"):
        return
    with _lock:
        _pending[int(chat_id)] = p


def get_pending_video_preset(chat_id: int) -> str | None:
    with _lock:
        v = _pending.get(int(chat_id))
        return v if v else None


def clear_pending_video_preset(chat_id: int) -> None:
    with _lock:
        _pending.pop(int(chat_id), None)
