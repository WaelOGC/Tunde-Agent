"""UX menu callback_data stays within Telegram Bot API limits."""

from __future__ import annotations

import json
import uuid

from tunde_agent.services.telegram_ux_menus import (
    cancel_email_reply_markup_json,
    cancel_landing_reply_markup_json,
    main_menu_reply_markup_json,
    pillar_business_markup_json,
    pillar_creative_markup_json,
)


def _assert_keyboard_callbacks(raw: str) -> None:
    data = json.loads(raw)
    for row in data["inline_keyboard"]:
        for btn in row:
            cb = btn.get("callback_data")
            if cb is not None:
                assert len(cb.encode("utf-8")) <= 64, cb


def test_main_menu_callbacks_under_64_bytes() -> None:
    _assert_keyboard_callbacks(main_menu_reply_markup_json())


def test_pillar_business_callbacks_under_64_bytes() -> None:
    _assert_keyboard_callbacks(pillar_business_markup_json())


def test_pillar_creative_callbacks_under_64_bytes() -> None:
    _assert_keyboard_callbacks(pillar_creative_markup_json())


def test_cancel_email_callback_under_64_bytes() -> None:
    _assert_keyboard_callbacks(cancel_email_reply_markup_json())


def test_cancel_landing_callback_under_64_bytes() -> None:
    rid = str(uuid.uuid4())
    raw = cancel_landing_reply_markup_json(rid)
    assert raw is not None
    _assert_keyboard_callbacks(raw)
