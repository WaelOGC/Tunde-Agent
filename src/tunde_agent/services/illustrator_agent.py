"""
Illustrator Agent: Gemini plans editorial image prompts; Pollinations.ai renders images (no third-party LLM keys).

Pollinations is a separate image-synthesis HTTP service (not Gemini). It requires no API key for basic use;
availability and content policies are governed by that service.
"""

from __future__ import annotations

import base64
import json
import logging
from typing import Any
from urllib.parse import quote

import httpx

from tunde_agent.config.settings import Settings
from tunde_agent.services.llm_service import GeminiClient, LLMError
from tunde_agent.services.research_orchestration.json_util import parse_llm_json_for_agent

logger = logging.getLogger(__name__)

_POLLINATIONS_IMAGE = "https://image.pollinations.ai/prompt"
_CHROME_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)

ILLUSTRATOR_SYSTEM = """You are an art director for editorial research reports. Output ONLY valid JSON (no markdown fences).

Shape:
{"illustrations": [{"id": "hero|insights|context", "alt": "short accessible description", "image_prompt": "detailed prompt for an image model"}]}

Rules:
- 1 or 2 items only. Prompts: modern editorial illustration OR clean photorealistic scene; no text overlays, no logos, no watermarks, no celebrity likenesses.
- Prompts must match the research topic tone (professional, restrained).
- Keep image_prompt under 900 characters each."""


def _plan_prompts(
    settings: Settings,
    topic: str,
    executive_summary: str,
    insights: list[str],
) -> list[dict[str, Any]]:
    ins = [str(x).strip() for x in insights[:5] if x and str(x).strip()]
    user = json.dumps(
        {
            "topic": topic.strip()[:500],
            "executive_summary": executive_summary.strip()[:1200],
            "key_insights": ins,
        },
        ensure_ascii=False,
    )
    try:
        client = GeminiClient(settings.gemini_api_key, model=settings.gemini_model)
        raw = client.complete(ILLUSTRATOR_SYSTEM, user)
    except LLMError as exc:
        logger.warning("Illustrator Gemini failed: %s", exc)
        return []
    parsed = parse_llm_json_for_agent(raw, "illustrator")
    ill = parsed.get("illustrations")
    if not isinstance(ill, list):
        return []
    out: list[dict[str, Any]] = []
    for item in ill[:2]:
        if not isinstance(item, dict):
            continue
        prompt = str(item.get("image_prompt") or "").strip()
        alt = str(item.get("alt") or "Research illustration").strip()[:200]
        iid = str(item.get("id") or "visual").strip()[:40]
        if prompt:
            out.append({"id": iid, "alt": alt, "image_prompt": prompt[:900]})
    return out


def _pollinations_fetch_image(prompt: str) -> tuple[bytes, str] | None:
    """GET image bytes and MIME from Pollinations (prompt in URL path)."""
    safe = prompt.strip()[:1800]
    if not safe:
        return None
    encoded = quote(safe, safe="")
    url = f"{_POLLINATIONS_IMAGE}/{encoded}?width=1024&height=576&nologo=true"
    try:
        with httpx.Client(timeout=120.0, follow_redirects=True) as client:
            r = client.get(url, headers={"User-Agent": _CHROME_UA})
            r.raise_for_status()
            body = r.content
            if not body or len(body) < 100:
                return None
            ct = (r.headers.get("content-type") or "image/jpeg").split(";")[0].strip().lower()
            if "png" in ct:
                mime = "image/png"
            elif "webp" in ct:
                mime = "image/webp"
            else:
                mime = "image/jpeg"
            return body, mime
    except Exception as exc:
        logger.warning("Pollinations image fetch failed: %s", exc)
        return None


def run_illustrator(
    settings: Settings,
    topic: str,
    delivery: dict[str, Any],
    *,
    max_rendered: int = 1,
) -> list[dict[str, Any]]:
    """
    Each item: ``alt``, ``image_prompt``, optional ``src`` (data URI) when Pollinations returned bytes.
    """
    exec_sum = str(delivery.get("executive_summary") or "")
    ins = delivery.get("insights") if isinstance(delivery.get("insights"), list) else []
    plan = _plan_prompts(settings, topic, exec_sum, ins)
    if not plan:
        return []

    out: list[dict[str, Any]] = []
    rendered = 0
    for p in plan:
        row = {"alt": p["alt"], "image_prompt": p["image_prompt"], "id": p.get("id", "visual")}
        if rendered < max_rendered:
            got = _pollinations_fetch_image(p["image_prompt"])
            if got:
                raw, mime = got
                b64 = base64.standard_b64encode(raw).decode("ascii")
                row["src"] = f"data:{mime};base64,{b64}"
                rendered += 1
        out.append(row)
    return out
