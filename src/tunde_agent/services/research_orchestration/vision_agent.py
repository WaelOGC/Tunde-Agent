"""
Vision Agent: download selected page images and extract chart/table readings via Gemini vision.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

from tunde_agent.config.settings import Settings
from tunde_agent.services.llm_service import GeminiClient, LLMError
from tunde_agent.services.research_orchestration.json_util import parse_llm_json_for_agent
from tunde_agent.services.research_orchestration.payload import aggregate_visual_data_urls

logger = logging.getLogger(__name__)

_CHROME_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)
_MAX_IMAGE_BYTES = 4_000_000


VISION_SYSTEM = """You are a vision analyst for research extraction. You read charts, plots, diagrams, and data-heavy figures.

Rules:
- Output ONLY valid JSON (no markdown fences). Shape:
{"readings": [{"source_url": "same as provided", "kind": "chart|table|diagram|other", "summary": "one sentence", "data_points": [{"label": "string", "value": "string or number"}]}]}
- If an image is decorative, empty, or unreadable, omit it or use an empty data_points array with a short summary.
- Preserve numeric units and labels when visible.
- Never invent values you cannot see."""


def _guess_mime(content: bytes, content_type: str) -> str:
    ct = (content_type or "").split(";")[0].strip().lower()
    if ct in ("image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"):
        return "image/jpeg" if ct == "image/jpg" else ct
    if content[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if content[:2] == b"\xff\xd8":
        return "image/jpeg"
    if content[:4] == b"RIFF" and content[8:12] == b"WEBP":
        return "image/webp"
    return "image/png"


def run_vision_on_collected(
    settings: Settings,
    collected: list[dict[str, Any]],
    topic: str,
    *,
    max_images: int = 4,
) -> str:
    """
    Returns a compact JSON string of readings, or empty string if nothing to analyze.
    """
    urls = aggregate_visual_data_urls(collected, max_urls=max_images * 2)[:max_images]
    if not urls:
        return ""

    images: list[tuple[bytes, str]] = []
    url_for_index: list[str] = []
    with httpx.Client(timeout=45.0, follow_redirects=True) as client:
        for u in urls:
            try:
                r = client.get(u, headers={"User-Agent": _CHROME_UA})
                if r.status_code != 200:
                    continue
                body = r.content
                if not body or len(body) > _MAX_IMAGE_BYTES:
                    continue
                mime = _guess_mime(body, r.headers.get("content-type") or "")
                images.append((body, mime))
                url_for_index.append(u)
            except Exception as exc:
                logger.debug("Vision skip url=%s err=%s", u[:120], exc)

    if not images:
        return ""

    listing = "\n".join(f"{i + 1}. {u}" for i, u in enumerate(url_for_index))
    user_text = (
        f"Research topic:\n{topic.strip()[:800]}\n\n"
        f"Images correspond to these source URLs (in order):\n{listing}\n\n"
        "Return JSON only as specified in your instructions."
    )

    try:
        client = GeminiClient(settings.gemini_api_key, model=settings.gemini_model)
        raw = client.complete_multimodal(VISION_SYSTEM, user_text, images)
    except LLMError as exc:
        logger.warning("Vision Gemini failed: %s", exc)
        return ""

    parsed = parse_llm_json_for_agent(raw, "vision")
    if "readings" not in parsed:
        return raw[:6000] if raw else ""
    import json

    return json.dumps(parsed, ensure_ascii=False, separators=(",", ":"))[:14_000]
