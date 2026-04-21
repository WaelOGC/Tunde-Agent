"""
Web Page Designer — Phase 2 of Design Agent
AI provider: Gemini (generates complete, self-contained HTML page)
"""

import asyncio
import os
import re
import uuid
from datetime import datetime, timezone

from tunde_agent.config.settings import get_settings

# ── Gemini setup ─────────────────────────────────────────────────────────────

settings = get_settings()
GEMINI_API_KEY = settings.gemini_api_key or os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL   = getattr(settings, "gemini_model", "gemini-2.5-flash")

# ── System prompt ─────────────────────────────────────────────────────────────

WEB_PAGE_SYSTEM_PROMPT = """
You are an elite web designer and frontend developer AI.
You receive a website brief and return ONE complete, self-contained HTML file —
no markdown fences, no prose, no preamble, just raw HTML starting with <!DOCTYPE html>.

Requirements:

CRITICAL RULES FOR CSS:
- Do NOT use Tailwind CSS CDN or any external CDN
- Do NOT use any <link> or <script src> for stylesheets
- Write ALL styles using plain inline CSS in a <style>
  tag inside <head>
- Do NOT use Tailwind class names (bg-gray-900, etc.)
- Use only standard CSS properties
- Google Fonts: allowed via <link> from fonts.googleapis.com
- All colors, spacing, layout must be written as pure CSS
- The page must look professional using only plain CSS

- Fully responsive (mobile + desktop)
- Dark or light theme based on the requested style
- Smooth CSS animations and hover effects
- No external images — use SVG shapes, CSS gradients, or emoji as placeholders
- No JavaScript frameworks — vanilla JS only if needed
- The page must look production-ready, not like a template

Every section listed by the user is REQUIRED. Never skip a section. Never merge two
sections into one. Each section must have its own distinct HTML block with an id
attribute matching the section name (use kebab-case or slug form, e.g. id="features"
for Features).

Always include a sticky navigation bar at the top with links that scroll to each
section (anchor links to each section id).

Always include a Footer section at the very bottom with copyright, useful links,
and contact info — even if "Footer" was not in the user's section list.

Return ONLY the raw HTML. Nothing else. Start with <!DOCTYPE html>.
"""


def _build_user_prompt(req: dict) -> str:
    raw = req.get("sections") or ["Hero", "Features", "About", "CTA"]
    if not isinstance(raw, list):
        raw = ["Hero", "Features", "About", "CTA"]
    sections_list = [str(s).strip() for s in raw if str(s).strip()]
    if not sections_list:
        sections_list = ["Hero", "Features", "About", "CTA"]
    numbered = "\n".join(f"     {i + 1}. {name}" for i, name in enumerate(sections_list))
    return f"""Design a complete landing page for this website:

Business name: {req["business_name"]}
Industry: {req["industry"]}
Description: {req["description"]}
Target audience: {req["audience"]}
Page style: {req["page_style"]}
Color scheme: {req["color_scheme"]}
Call to action text: {req.get("cta_text", "Get Started")}

You MUST include ALL of these sections in order, do not skip any:
{numbered}

Also include a sticky top navigation linking to each section above, and a Footer at
the bottom (copyright, links, contact) as specified in your system instructions.

Return the complete HTML page now. Start with <!DOCTYPE html>.

IMPORTANT: Do NOT use Tailwind CSS or any CDN links.
Write all styling as plain CSS in a <style> tag only."""


def _default_html(business_name: str) -> str:
    """Minimal safe fallback page when Gemini fails."""
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>{business_name}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet"/>
  <style>body {{ font-family: 'Inter', sans-serif; }}</style>
</head>
<body class="bg-gray-950 text-white min-h-screen flex flex-col items-center justify-center">
  <div class="text-center px-6">
    <h1 class="text-6xl font-bold mb-4 bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
      {business_name}
    </h1>
    <p class="text-gray-400 text-xl mb-8">Coming soon. Something great is on the way.</p>
    <a href="#" class="px-8 py-3 bg-purple-600 hover:bg-purple-500 rounded-full font-semibold transition">
      Get Started
    </a>
  </div>
</body>
</html>"""


def _clean_html(raw: str) -> str:
    """Strip markdown fences if Gemini wraps the response."""
    raw = raw.strip()
    raw = re.sub(r"^```(?:html)?\s*", "", raw, flags=re.IGNORECASE)
    raw = re.sub(r"\s*```$", "", raw)
    return raw.strip()


def _embed_tailwind(html: str) -> str:
    """Replace any Tailwind CDN script/link with a version that loads correctly inside iframes."""
    html = re.sub(
        r'<script src="https://cdn\.tailwindcss\.com[^"]*"></script>',
        "",
        html,
        flags=re.IGNORECASE,
    )
    html = re.sub(
        r"<link[^>]*cdn\.jsdelivr\.net/npm/tailwindcss[^>]*>",
        "",
        html,
        flags=re.IGNORECASE,
    )
    tailwind_tag = (
        '<meta http-equiv="Content-Security-Policy" '
        "content=\"default-src * 'unsafe-inline' 'unsafe-eval' "
        'data: blob:;">\n'
        '<link rel="stylesheet" '
        'href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css">'
    )
    html = re.sub(
        r"<head>",
        f"<head>\n{tailwind_tag}",
        html,
        count=1,
        flags=re.IGNORECASE,
    )
    return html


def _gemini_generate_sync(req: dict) -> str:
    """Sync Gemini call — run inside asyncio.to_thread."""
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=GEMINI_API_KEY)
    response = client.models.generate_content(
        model=GEMINI_MODEL,
        contents=_build_user_prompt(req),
        config=types.GenerateContentConfig(
            system_instruction=WEB_PAGE_SYSTEM_PROMPT,
            temperature=0.8,
            max_output_tokens=8192,
        ),
    )
    return response.text or ""


async def generate_web_page(req: dict) -> dict:
    """
    Core entrypoint called by web_page_router.py.

    req keys: business_name, industry, description, audience,
              page_style, color_scheme, sections[], cta_text,
              user_id?, session_id?
    Returns dict with html_content, page_title, provider.
    """
    business_name = req.get("business_name", "My Business")

    if not GEMINI_API_KEY:
        print("[web_page_designer] Gemini skipped: no GEMINI_API_KEY")
        return {
            "html_content": _default_html(business_name),
            "page_title": business_name,
            "provider": "fallback",
        }

    try:
        raw = await asyncio.to_thread(_gemini_generate_sync, req)
        lower = raw.lower()
        first = lower.find("<!doctype html")
        if first > 0:
            raw = raw[first:]
        lower = raw.lower()
        second = lower.find("<!doctype html", 1)
        if second > 0:
            raw = raw[:second]
        html = _clean_html(raw)
        html = _embed_tailwind(html)

        if not html.lower().startswith("<!doctype"):
            raise ValueError("Response is not valid HTML")

        return {
            "html_content": html,
            "page_title": business_name,
            "provider": "gemini",
        }

    except Exception as exc:
        print(f"[web_page_designer] Gemini error: {exc}")
        return {
            "html_content": _default_html(business_name),
            "page_title": business_name,
            "provider": "fallback",
        }