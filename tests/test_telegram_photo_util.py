"""telegram_photo_util: dimension normalization for Telegram sendPhoto."""

from __future__ import annotations

from io import BytesIO

import pytest

pytest.importorskip("PIL")

from PIL import Image

from tunde_agent.services.telegram_photo_util import prepare_png_for_telegram_photo


def test_letterbox_tiny_image_to_standard_canvas() -> None:
    im = Image.new("RGB", (1, 1), color=(10, 20, 30))
    buf = BytesIO()
    im.save(buf, format="PNG")
    raw = buf.getvalue()
    out = prepare_png_for_telegram_photo(raw)
    parsed = Image.open(BytesIO(out))
    assert parsed.size == (1280, 720)


def test_reasonable_size_preserved() -> None:
    im = Image.new("RGB", (400, 300), color=(0, 0, 0))
    buf = BytesIO()
    im.save(buf, format="PNG")
    out = prepare_png_for_telegram_photo(buf.getvalue())
    parsed = Image.open(BytesIO(out))
    assert parsed.size == (400, 300)
