"""Inline keyboard after mission delivery (exports, email, report chat, compare)."""

from __future__ import annotations

import json
import uuid

# Callback prefixes (1 char + ":" + UUID) must stay ≤ 64 bytes — length is 38.
_POST_CALLBACK_PREFIXES = frozenset("fwgbmqvs")


def post_task_reply_markup_json(report_id: str, report_url: str | None) -> str | None:
    """
    Telegram inline keyboard: landing URL, PDF, Word, CSV, Tailwind HTML, email, chat mode, compare, summarize.

    ``callback_data`` format: ``{prefix}:{uuid}`` (under 64 bytes).
    """
    rid = str(report_id).strip()
    try:
        uuid.UUID(rid)
    except ValueError:
        return None

    rows: list[list[dict[str, str]]] = []
    ru = (report_url or "").strip()
    if ru:
        rows.append(
            [{"text": "🏢 Open landing page", "url": ru[:2048]}],
        )

    rows.extend(
        [
            [
                {"text": "📄 Generate PDF", "callback_data": f"f:{rid}"},
                {"text": "📝 Export to Word", "callback_data": f"w:{rid}"},
            ],
            [
                {"text": "📊 Sheet (CSV)", "callback_data": f"g:{rid}"},
                {"text": "🏢 Tailwind page", "callback_data": f"b:{rid}"},
            ],
            [
                {"text": "📧 Send to Email", "callback_data": f"m:{rid}"},
                {"text": "🧐 Chat with report", "callback_data": f"q:{rid}"},
            ],
            [
                {"text": "🔄 Compare previous", "callback_data": f"v:{rid}"},
                {"text": "📝 Summarize more", "callback_data": f"s:{rid}"},
            ],
        ],
    )

    raw = json.dumps({"inline_keyboard": rows}, separators=(",", ":"))
    # Safety check in dev / tests
    data = json.loads(raw)
    for row in data["inline_keyboard"]:
        for btn in row:
            cb = btn.get("callback_data")
            if cb and (cb[0] not in _POST_CALLBACK_PREFIXES or cb[1] != ":"):
                raise ValueError(f"invalid post-task callback: {cb!r}")
            if cb and len(cb.encode("utf-8")) > 64:
                raise ValueError(f"callback_data too long: {cb!r}")
    return raw
