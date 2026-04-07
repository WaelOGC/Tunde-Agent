"""Post-mission Telegram inline keyboard stays within Bot API limits."""

from __future__ import annotations

import json
import uuid

from tunde_agent.services.telegram_post_task_markup import post_task_reply_markup_json


def test_post_task_callback_data_under_64_bytes() -> None:
    rid = str(uuid.uuid4())
    url = "https://example.com/reports/view/" + rid
    raw = post_task_reply_markup_json(rid, url)
    assert raw is not None
    data = json.loads(raw)
    for row in data["inline_keyboard"]:
        for btn in row:
            cb = btn.get("callback_data")
            if cb is not None:
                assert len(cb.encode("utf-8")) <= 64, cb


def test_post_task_invalid_id_returns_none() -> None:
    assert post_task_reply_markup_json("not-a-uuid", "https://x.test/y") is None
