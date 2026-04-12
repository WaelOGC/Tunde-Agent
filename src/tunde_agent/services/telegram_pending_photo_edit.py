"""After a photo without caption, wait for the user's edit instructions (plain text)."""

from __future__ import annotations

from threading import Lock

_lock = Lock()
_pending: dict[int, str] = {}


def set_pending_photo_edit_file_id(chat_id: int, file_id: str) -> None:
    with _lock:
        _pending[int(chat_id)] = str(file_id).strip()


def get_pending_photo_edit_file_id(chat_id: int) -> str | None:
    with _lock:
        fid = _pending.get(int(chat_id))
        return fid if fid else None


def clear_pending_photo_edit(chat_id: int) -> None:
    with _lock:
        _pending.pop(int(chat_id), None)
