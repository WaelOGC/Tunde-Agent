"""Reference image normalization for Gemini multimodal image generation."""

from __future__ import annotations

from io import BytesIO

from PIL import Image

from tunde_agent.services.gemini_image_generation import prepare_reference_image_for_gemini


def test_prepare_reference_image_for_gemini_outputs_png() -> None:
    im = Image.new("RGB", (32, 48), color=(10, 120, 200))
    buf = BytesIO()
    im.save(buf, format="PNG")
    out, mime = prepare_reference_image_for_gemini(buf.getvalue())
    assert mime == "image/png"
    assert out[:8] == b"\x89PNG\r\n\x1a\n"
