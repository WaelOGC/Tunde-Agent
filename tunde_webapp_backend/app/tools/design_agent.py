"""
Design Agent — Gemini-driven brand identity JSON (palette, typography, SVG logos, guidelines).
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Any

import os

from tunde_agent.config.settings import get_settings
from tunde_agent.services.llm_service import GeminiClient, LLMError

logger = logging.getLogger(__name__)

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

_BRAND_IDENTITY_SYSTEM = """You are an expert brand designer. Output exactly ONE JSON object and nothing else.
No markdown code fences. No prose before or after the JSON.

Required keys: tagline (string), palette (array of exactly 5 objects with name, hex, usage),
typography (heading, body, accent — each with font, weight, usage),
logo_svg (string: valid SVG with viewBox 0 0 400 120; include the brand name as visible text),
logo_icon_svg (string: valid SVG with viewBox 0 0 80 80; monogram mark),
guidelines (object with brand_story string; color_rules, typography_scale, logo_rules, tone_of_voice as arrays of strings),
css_variables (single string, newline-separated CSS custom properties).

Rules:
- palette: exactly 5 swatches; hex values like #RRGGBB.
- Embed real SVG markup in logo_svg and logo_icon_svg (escape double quotes inside SVG as needed for JSON).
- guidelines.brand_story: 2-3 sentences; other guideline fields: arrays of short strings.
"""


def _strip_json_fence(text: str) -> str:
    s = (text or "").strip()
    m = re.match(r"^```(?:json)?\s*([\s\S]*?)\s*```$", s, re.IGNORECASE)
    if m:
        return m.group(1).strip()
    return s


def _brand_user_prompt(req: dict[str, Any]) -> str:
    return (
        "Create a brand identity package for:\n\n"
        f"- brand_name: {req.get('brand_name', '')}\n"
        f"- industry: {req.get('industry', '')}\n"
        f"- description: {req.get('description', '')}\n"
        f"- audience: {req.get('audience', '')}\n"
        f"- tone: {req.get('tone', '')}\n"
        f"- color_mood: {req.get('color_mood', '')}\n"
        f"- logo_style: {req.get('logo_style', '')}\n\n"
        "Respect industry, audience, tone, color mood, and logo style in every choice."
    )


def _default_palette(brand_name: str) -> dict[str, Any]:
    """Hardcoded fallback identity when Gemini or JSON parsing fails."""
    safe = (brand_name or "Brand").strip()[:80] or "Brand"
    esc = (
        safe.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )
    initials = "".join(w[0] for w in safe.split() if w)[:3].upper() or "BR"
    logo_svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 120">'
        f'<rect width="400" height="120" fill="#0f172a"/>'
        f'<text x="200" y="72" text-anchor="middle" font-family="Georgia,serif" font-size="36" fill="#e2e8f0">{esc}</text>'
        f"</svg>"
    )
    icon_svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80">'
        f'<rect width="80" height="80" rx="12" fill="#7c3aed"/>'
        f'<text x="40" y="48" text-anchor="middle" font-family="Georgia,serif" font-size="28" fill="#fafafa">{initials}</text>'
        f"</svg>"
    )
    return {
        "tagline": f"{safe} — clarity you can trust.",
        "palette": [
            {"name": "Primary", "hex": "#1e293b", "usage": "Primary surfaces and headings"},
            {"name": "Secondary", "hex": "#334155", "usage": "Secondary panels"},
            {"name": "Accent", "hex": "#7c3aed", "usage": "CTAs and highlights"},
            {"name": "Neutral", "hex": "#f8fafc", "usage": "Backgrounds"},
            {"name": "Supporting", "hex": "#94a3b8", "usage": "Muted text and borders"},
        ],
        "typography": {
            "heading": {"font": "Playfair Display", "weight": "700", "usage": "Headlines"},
            "body": {"font": "Inter", "weight": "400", "usage": "Body"},
            "accent": {"font": "Space Mono", "weight": "400", "usage": "Labels"},
        },
        "logo_svg": logo_svg,
        "logo_icon_svg": icon_svg,
        "guidelines": {
            "brand_story": (
                f"{safe} delivers focused value for its audience. "
                "This fallback identity applies when automated generation is unavailable."
            ),
            "color_rules": [
                "Maintain sufficient contrast for body text on backgrounds.",
                "Do not place accent on noisy photography without a scrim.",
            ],
            "typography_scale": [
                "H1: heading / 700",
                "Body: inter / 400",
                "Caption: accent / 400",
            ],
            "logo_rules": [
                "Clear space: at least the height of the icon around the wordmark.",
                "Do not stretch or skew the SVG.",
            ],
            "tone_of_voice": [
                "Clear and confident.",
                "Avoid jargon unless industry-appropriate.",
            ],
        },
        "css_variables": (
            "--color-primary: #1e293b;\n"
            "--color-accent: #7c3aed;\n"
            "--font-heading: 'Playfair Display';\n"
            "--font-body: 'Inter';\n"
        ),
        "provider": "fallback",
    }


def _normalize_payload(data: dict[str, Any]) -> dict[str, Any] | None:
    if not isinstance(data, dict):
        return None
    required = ("tagline", "palette", "typography", "logo_svg", "logo_icon_svg", "guidelines", "css_variables")
    if not all(k in data for k in required):
        return None
    pal = data.get("palette")
    if not isinstance(pal, list) or len(pal) != 5:
        return None
    for sw in pal:
        if not isinstance(sw, dict) or not all(x in sw for x in ("name", "hex", "usage")):
            return None
    typo = data.get("typography")
    if not isinstance(typo, dict):
        return None
    for slot in ("heading", "body", "accent"):
        block = typo.get(slot)
        if not isinstance(block, dict) or not all(k in block for k in ("font", "weight", "usage")):
            return None
    g = data.get("guidelines")
    if not isinstance(g, dict):
        return None
    for gk in ("brand_story", "color_rules", "typography_scale", "logo_rules", "tone_of_voice"):
        if gk not in g:
            return None
        if gk == "brand_story":
            if not isinstance(g["brand_story"], str):
                return None
        elif not isinstance(g[gk], list):
            return None
    if not isinstance(data.get("logo_svg"), str) or not isinstance(data.get("logo_icon_svg"), str):
        return None
    if not isinstance(data.get("css_variables"), str):
        return None
    if not isinstance(data.get("tagline"), str):
        return None
    return {
        "tagline": data["tagline"],
        "palette": pal,
        "typography": typo,
        "logo_svg": data["logo_svg"],
        "logo_icon_svg": data["logo_icon_svg"],
        "guidelines": g,
        "css_variables": data["css_variables"],
    }


def _generate_sync(req: dict[str, Any]) -> dict[str, Any]:
    brand_name = str(req.get("brand_name") or "Brand").strip() or "Brand"
    settings = get_settings()
    api_key = (settings.gemini_api_key or GEMINI_API_KEY or "").strip()
    if not api_key:
        print("[design_agent] Gemini skipped: no GEMINI_API_KEY (settings or env)")
        return _default_palette(brand_name)

    try:
        client = GeminiClient(api_key, model=settings.gemini_model)
        raw_text = client.complete(
            _BRAND_IDENTITY_SYSTEM,
            _brand_user_prompt(req),
            max_output_tokens=8192,
        )
        stripped = _strip_json_fence(raw_text)
        data = json.loads(stripped)
        normalized = _normalize_payload(data)
        if normalized is None:
            print("[design_agent] Gemini error: response failed schema validation, using fallback")
            return _default_palette(brand_name)
        normalized["provider"] = "gemini"
        return normalized
    except (LLMError, json.JSONDecodeError, TypeError, ValueError) as exc:
        print(f"[design_agent] Gemini error: {exc}")
        logger.warning("design_agent generate failed: %s", str(exc)[:200])
        return _default_palette(brand_name)
    except Exception as exc:
        print(f"[design_agent] Gemini error: {exc}")
        logger.warning("design_agent unexpected: %s", str(exc)[:200])
        return _default_palette(brand_name)


async def generate_brand_identity(req: dict) -> dict:
    """Call Gemini for a brand identity JSON package; never raises — returns fallback on failure."""
    try:
        return await asyncio.to_thread(_generate_sync, req)
    except Exception as exc:
        print(f"[design_agent] Gemini error: {exc}")
        logger.warning("design_agent async wrapper: %s", str(exc)[:200])
        bn = str((req or {}).get("brand_name") or "Brand").strip() or "Brand"
        return _default_palette(bn)
