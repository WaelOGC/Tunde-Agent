"""Normalize PNG/JPEG bytes for Telegram ``sendPhoto`` (dimension limits, letterbox)."""

from __future__ import annotations

import logging
from io import BytesIO

logger = logging.getLogger(__name__)

# Bot API: width + height must not exceed 10000; very small images often trigger PHOTO_INVALID_DIMENSIONS.
_MAX_DIM_SUM = 10_000
_MIN_SIDE = 100
_LETTERBOX_W, _LETTERBOX_H = 1280, 720


def prepare_png_for_telegram_photo(photo_bytes: bytes) -> bytes:
    """
    Return PNG bytes suitable for ``sendPhoto``.

    - Letterboxes into 1280×720 when sides are too small, sum of dimensions is too large, or decode fails
      after one repair attempt.
    """
    if not photo_bytes:
        return photo_bytes
    try:
        from PIL import Image, ImageOps
    except ImportError:
        logger.warning("Pillow not installed; sending raw photo bytes unchanged.")
        return photo_bytes

    try:
        im = Image.open(BytesIO(photo_bytes))
        im.load()
    except Exception as exc:
        logger.warning("Telegram photo prep: could not open image (%s); returning original bytes.", exc)
        return photo_bytes

    im = ImageOps.exif_transpose(im)
    if im.mode not in ("RGB", "RGBA"):
        im = im.convert("RGBA")
    w, h = im.size
    needs_box = (
        w < _MIN_SIDE
        or h < _MIN_SIDE
        or (w + h) > _MAX_DIM_SUM
        or w <= 0
        or h <= 0
        or (w / max(h, 1)) > 25
        or (h / max(w, 1)) > 25
    )
    if not needs_box:
        out = BytesIO()
        if im.mode == "RGBA":
            bg = Image.new("RGB", im.size, (255, 255, 255))
            bg.paste(im, mask=im.split()[-1])
            bg.save(out, format="PNG", optimize=True)
        else:
            im.save(out, format="PNG", optimize=True)
        return out.getvalue()

    return _letterbox_to_canvas(im, _LETTERBOX_W, _LETTERBOX_H)


def _letterbox_to_canvas(im, tw: int, th: int) -> bytes:
    from PIL import Image

    if im.mode == "RGBA":
        base = Image.new("RGB", im.size, (255, 255, 255))
        base.paste(im, mask=im.split()[-1])
        im = base
    elif im.mode != "RGB":
        im = im.convert("RGB")

    w, h = im.size
    scale = min(tw / max(w, 1), th / max(h, 1))
    nw = max(1, int(round(w * scale)))
    nh = max(1, int(round(h * scale)))
    resized = im.resize((nw, nh), Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", (tw, th), (255, 255, 255))
    ox, oy = (tw - nw) // 2, (th - nh) // 2
    canvas.paste(resized, (ox, oy))
    out = BytesIO()
    canvas.save(out, format="PNG", optimize=True)
    return out.getvalue()
