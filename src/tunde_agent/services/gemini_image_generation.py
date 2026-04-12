"""Native Gemini image generation via REST ``generateContent`` (responseModalities IMAGE)."""

from __future__ import annotations

import base64
import logging
from typing import Any

import httpx

from tunde_agent.services.llm_service import LLMError

logger = logging.getLogger(__name__)

_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"


def _normalize_model(model: str) -> str:
    m = (model or "").strip()
    if m.startswith("models/"):
        m = m[len("models/") :]
    return m


def _extract_images_from_response(data: dict[str, Any]) -> list[tuple[bytes, str]]:
    out: list[tuple[bytes, str]] = []
    for c in data.get("candidates") or []:
        content = c.get("content") or {}
        for p in content.get("parts") or []:
            if not isinstance(p, dict):
                continue
            inline = p.get("inline_data") or p.get("inlineData")
            if not isinstance(inline, dict):
                continue
            b64 = inline.get("data") or ""
            if not b64:
                continue
            mime = (
                inline.get("mime_type") or inline.get("mimeType") or "image/png"
            ).split(";")[0].strip().lower()
            try:
                raw = base64.standard_b64decode(b64)
            except Exception:
                continue
            if raw:
                out.append((raw, mime or "image/png"))
    return out


def prepare_reference_image_for_gemini(
    raw: bytes,
    *,
    max_side: int = 1536,
) -> tuple[bytes, str]:
    """
    Normalize incoming Telegram / browser bytes to RGB PNG within ``max_side`` for multimodal
    image generation.
    """
    from io import BytesIO

    from PIL import Image

    im = Image.open(BytesIO(raw))
    im = im.convert("RGB")
    w, h = im.size
    if max(w, h) > max_side:
        im.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
    buf = BytesIO()
    im.save(buf, format="PNG", optimize=True)
    return buf.getvalue(), "image/png"


def generate_image_from_reference_bytes(
    *,
    api_key: str,
    model: str,
    instruction: str,
    reference_image_bytes: bytes,
    _reference_mime_hint: str = "image/jpeg",
) -> tuple[bytes, str]:
    """
    Image-to-image style edits: reference image + text instruction → new image bytes.

    Uses the same ``generateContent`` + ``responseModalities`` path as text-only generation.
    ``_reference_mime_hint`` is reserved for future format-specific handling; bytes are normalized to
    PNG before the API call.
    """
    key = (api_key or "").strip()
    if not key:
        raise LLMError("GEMINI_API_KEY is not set.")
    inst = (instruction or "").strip()
    if not inst:
        raise LLMError("Edit instruction is empty.")
    m = _normalize_model(model)
    if not m:
        raise LLMError("Gemini image model is empty.")

    png_bytes, mime = prepare_reference_image_for_gemini(reference_image_bytes)
    b64 = base64.standard_b64encode(png_bytes).decode("ascii")
    full_text = (
        "You are given one reference image. Apply the user's edit request and output a single "
        "new image. Preserve the main subject and composition unless the user explicitly asks to "
        "change them.\n\nUser request:\n"
        + inst[:7500]
    )
    url = _URL.format(model=m)
    payload: dict[str, Any] = {
        "contents": [
            {
                "role": "user",
                "parts": [
                    {"inline_data": {"mime_type": mime, "data": b64}},
                    {"text": full_text},
                ],
            }
        ],
        "generationConfig": {"responseModalities": ["TEXT", "IMAGE"]},
    }
    try:
        with httpx.Client(timeout=180.0) as client:
            r = client.post(url, params={"key": key}, json=payload)
            r.raise_for_status()
            data = r.json()
    except httpx.HTTPStatusError as e:
        detail = ""
        if e.response is not None:
            try:
                detail = str(e.response.json().get("error", {}).get("message", e.response.text))
            except Exception:
                detail = e.response.text[:500]
        logger.warning("Gemini image-edit HTTP %s: %s", e.response.status_code if e.response else "?", detail)
        raise LLMError(f"Gemini image API error: {detail or e!s}") from e
    except httpx.RequestError as e:
        raise LLMError(f"Gemini image request failed: {e!s}") from e

    images = _extract_images_from_response(data)
    if not images:
        raise LLMError(
            "No edited image was returned (this model may not support reference edits — try "
            "GEMINI_IMAGE_MODEL=gemini-2.5-flash-image or shorten the request)."
        )
    return images[0]


def generate_image_bytes(*, api_key: str, model: str, prompt: str) -> tuple[bytes, str]:
    """
    Return ``(image_bytes, mime_type)`` from Gemini native image output.

    Raises ``LLMError`` on HTTP errors or when no image part is returned.
    """
    key = (api_key or "").strip()
    if not key:
        raise LLMError("GEMINI_API_KEY is not set.")
    p = (prompt or "").strip()
    if not p:
        raise LLMError("Image prompt is empty.")
    m = _normalize_model(model)
    if not m:
        raise LLMError("Gemini image model is empty.")

    url = _URL.format(model=m)
    payload: dict[str, Any] = {
        "contents": [
            {
                "role": "user",
                "parts": [{"text": p[:8000]}],
            }
        ],
        "generationConfig": {"responseModalities": ["TEXT", "IMAGE"]},
    }
    try:
        with httpx.Client(timeout=180.0) as client:
            r = client.post(url, params={"key": key}, json=payload)
            r.raise_for_status()
            data = r.json()
    except httpx.HTTPStatusError as e:
        detail = ""
        if e.response is not None:
            try:
                detail = str(e.response.json().get("error", {}).get("message", e.response.text))
            except Exception:
                detail = e.response.text[:500]
        logger.warning("Gemini image HTTP %s: %s", e.response.status_code if e.response else "?", detail)
        raise LLMError(f"Gemini image API error: {detail or e!s}") from e
    except httpx.RequestError as e:
        raise LLMError(f"Gemini image request failed: {e!s}") from e

    images = _extract_images_from_response(data)
    if not images:
        raise LLMError("Gemini returned no image (try another GEMINI_IMAGE_MODEL or shorten the prompt).")
    return images[0]
