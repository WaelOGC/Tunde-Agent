from __future__ import annotations

import logging
from typing import Any

from tunde_agent.services.llm_service import LLMError

logger = logging.getLogger(__name__)

# Canonical aspect values aligned with the web wizard (`aspect_ratio` or `aspect_ratio_id`).
_ASPECT_RATIO_BY_ID: dict[str, str] = {
    "1_1": "1:1",
    "16_9": "16:9",
    "9_16": "9:16",
    "4_3": "4:3",
    "3_4": "3:4",
    "21_9": "21:9",
}

_REALISTIC_PREFIX = "A hyper-realistic, high-detail professional photograph of "
_REALISTIC_SUFFIX = (
    "shot on 35mm lens, f/1.8, cinematic lighting, sharp focus, 8k resolution, "
    "highly detailed textures, NO text, NO infographics, NO charts."
)


def generate_workspace_image(*, prompt: str) -> tuple[bytes, str]:
    """
    Native image generation via configured image model (see env image settings).
    Returns ``(image_bytes, mime_type)``.
    """
    from tunde_agent.config.settings import get_settings
    from tunde_agent.services.gemini_image_generation import generate_image_bytes

    settings = get_settings()
    p = (prompt or "").strip()
    if not p:
        raise LLMError("Image prompt is empty.")
    return generate_image_bytes(
        api_key=settings.gemini_api_key,
        model=settings.gemini_image_model,
        prompt=p[:8000],
    )


def _resolve_aspect_ratio(ig: dict[str, Any]) -> tuple[str, str]:
    """Return ``(canonical_ratio, aspect_ratio_id)`` for prompt locking."""
    rid = str(ig.get("aspect_ratio_id") or "").strip()
    av = str(ig.get("aspect_ratio") or "").strip()
    if not av and rid:
        av = _ASPECT_RATIO_BY_ID.get(rid, "")
    return av, rid


def _build_realistic_photo_prompt(
    *,
    user_text: str,
    plan_image_prompt: str,
    reply_summary: str,
    ig: dict[str, Any],
) -> str:
    ut = (user_text or "").strip()[:1200]
    ip = (plan_image_prompt or "").strip()[:800]
    rs = (reply_summary or "").strip()[:2000]
    sl = str(ig.get("style_label") or "").strip()
    rl = str(ig.get("aspect_ratio_label") or "").strip()
    aspect_val, rid = _resolve_aspect_ratio(ig)

    subject = " ".join(x for x in (ut, ip) if x).strip()
    if not subject:
        subject = (
            "the scene and subject matter described in the conversation, "
            "rendered as a believable real-world photograph"
        )

    chunks: list[str] = [
        f"{_REALISTIC_PREFIX}{subject}",
        (
            f"Composition: frame for **{aspect_val or 'not specified'}** aspect ratio"
            + (f" ({rl})" if rl else "")
            + ". "
            "Locked wizard parameters (honor exactly): "
            f'style_id="realistic_photo"; style_label="{sl or "Realistic Photo"}"; '
            f'aspect_ratio_id="{rid or "not specified"}"; '
            f'target_aspect_ratio="{aspect_val or "not specified"}".'
        ),
    ]
    if rs:
        chunks.append(
            "Integrate the following as natural photographic content only "
            "(environment, subjects, props, lighting)—do not add charts, diagrams, "
            "infographics, captions, or on-image text:\n"
            f"{rs}"
        )
    chunks.append(_REALISTIC_SUFFIX)
    return "\n\n".join(chunks)


def build_infographic_prompt(
    *,
    user_text: str,
    plan_image_prompt: str,
    reply_summary: str,
    image_generation: dict[str, Any] | None = None,
) -> str:
    """Compose a single image prompt from user intent + model reply."""
    ig = image_generation if isinstance(image_generation, dict) else None
    sid = str(ig.get("style_id") or "").strip() if ig else ""

    if sid == "realistic_photo" and ig is not None:
        return _build_realistic_photo_prompt(
            user_text=user_text,
            plan_image_prompt=plan_image_prompt,
            reply_summary=reply_summary,
            ig=ig,
        )

    parts: list[str] = [
        "Create a single polished infographic or visual summary suitable for a professional dashboard.",
        "Use clear hierarchy, readable labels, and a modern dark-friendly palette (deep blues, teal accents).",
        "No tiny text; no watermarks.",
    ]
    if ig:
        sl = str(ig.get("style_label") or "").strip()
        rl = str(ig.get("aspect_ratio_label") or "").strip()
        aspect_val, rid = _resolve_aspect_ratio(ig)
        if sl or rl or sid or aspect_val or rid:
            parts.append(
                "User-selected image parameters (web workspace wizard; honor these ids and ratio):\n"
                f'- style_id: "{sid or "not specified"}"\n'
                f'- style_label: {sl or "not specified"}\n'
                f'- aspect_ratio_id: "{rid or "not specified"}"\n'
                f'- target_aspect_ratio: {aspect_val or "not specified"}\n'
                f"- aspect_ratio_label: {rl or 'not specified'}\n"
                "Match the visual language and composition to these choices."
            )
        if sid == "comic_book":
            parts.append(
                "Comic book mode: bold ink outlines, halftone or cel shading, dynamic poses, panel-friendly "
                "composition; reserve layout for future text-to-comic / panel pipeline extensions."
            )
    ut = (user_text or "").strip()[:1200]
    if ut:
        parts.append(f"User request:\n{ut}")
    ip = (plan_image_prompt or "").strip()[:800]
    if ip:
        parts.append(f"Art direction:\n{ip}")
    rs = (reply_summary or "").strip()[:2000]
    if rs:
        parts.append(f"Content to visualize (summarize into charts/icons/bullets, do not paste verbatim paragraphs):\n{rs}")
    return "\n\n".join(parts)
