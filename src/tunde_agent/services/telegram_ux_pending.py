"""In-memory pending UX flows (topic capture after menu picks). Thread-safe for Telegram poller + handlers."""

from __future__ import annotations

from dataclasses import dataclass
from threading import Lock

_lock = Lock()
_pending: dict[int, "PendingUxFlow"] = {}


@dataclass(frozen=True)
class PendingUxFlow:
    """What we are waiting for the operator to type next."""

    kind: str  # "mission_topic" | "image_style" | "expect_photo_for_edit"
    code: str  # flow code e.g. bma, cph
    return_menu: str  # p1..p5 — restores submenu on Back


def set_pending_ux_flow(chat_id: int, flow: PendingUxFlow) -> None:
    with _lock:
        _pending[int(chat_id)] = flow


def get_pending_ux_flow(chat_id: int) -> PendingUxFlow | None:
    with _lock:
        return _pending.get(int(chat_id))


def clear_pending_ux_flow(chat_id: int) -> None:
    with _lock:
        _pending.pop(int(chat_id), None)
