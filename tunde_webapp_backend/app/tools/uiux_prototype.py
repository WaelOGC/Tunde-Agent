"""
UI/UX Prototype Layout — Design Agent Phase 3
AI provider: Gemini (generates interactive HTML/CSS prototype)
"""

import asyncio
import os
import re
from datetime import datetime, timezone

from tunde_agent.config.settings import get_settings

# ── Gemini setup ─────────────────────────────────────────────────────────────

settings = get_settings()
GEMINI_API_KEY = settings.gemini_api_key or os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL   = getattr(settings, "gemini_model", "gemini-2.5-flash")

# ── System prompt ─────────────────────────────────────────────────────────────

UIUX_SYSTEM_PROMPT = """
You are a world-class UI/UX designer and frontend developer.
You receive a product brief and return ONE complete, self-contained HTML file
that is a high-fidelity UI/UX prototype — no markdown fences, no prose,
no preamble, just raw HTML starting with <!DOCTYPE html>.

Design requirements:
- Modern, pixel-perfect UI matching the requested style

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

- Dark or light theme based on requested style
- Fully interactive: clickable tabs, toggles, hover states, transitions
- Must include a realistic sidebar or navbar (whichever fits the app type)
- Must show realistic placeholder content (fake names, numbers, charts descriptions)
- Use CSS animations for smooth transitions
- No external images — use SVG icons, emoji, or CSS shapes
- No JS frameworks — vanilla JS only
- Must look like a real product screenshot, not a wireframe

Prototype types and their requirements:
- Dashboard: sidebar nav + main content area + stat cards + charts placeholder + table
- Mobile App: phone frame (390×844) centered + bottom nav + realistic screens
- SaaS Product: top nav + hero/features layout + pricing cards + CTA
- Admin Panel: sidebar + data tables + filters + action buttons + stats
- Landing Page UI Kit: components showcase — buttons, cards, forms, modals
- E-commerce: product grid + filters sidebar + cart + product cards

Return ONLY the raw HTML. Nothing else. Start with <!DOCTYPE html>.
"""


def _build_user_prompt(req: dict) -> str:
    screens = ", ".join(req.get("screens", ["Main Screen"]))
    components = ", ".join(req.get("components", ["Navigation", "Cards"]))
    return f"""Design a complete UI/UX prototype for this product:

Product name: {req["product_name"]}
Product type: {req["product_type"]}
Industry: {req["industry"]}
Description: {req["description"]}
Target platform: {req["platform"]}
UI style: {req["ui_style"]}
Color theme: {req["color_theme"]}
Screens/sections to include: {screens}
UI components to include: {components}
Primary action: {req.get("primary_action", "Get Started")}

Requirements:
- Make it look like a real, polished product
- Include realistic fake data (names, numbers, percentages)
- All interactive elements must have hover/active states
- Navigation must be functional (clicking tabs shows different content via JS)
- Return the complete HTML prototype now. Start with <!DOCTYPE html>.

IMPORTANT: Do NOT use Tailwind CSS or any CDN links.
Write all styling as plain CSS in a <style> tag only."""


def _default_prototype(product_name: str) -> str:
    """Minimal safe fallback prototype when Gemini fails."""
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>{product_name} — UI Prototype</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet"/>
  <style>
    body {{ font-family: 'Inter', sans-serif; }}
    .sidebar-item:hover {{ background: rgba(139,92,246,0.15); }}
    .card {{ transition: transform 0.2s; }}
    .card:hover {{ transform: translateY(-2px); }}
  </style>
</head>
<body class="bg-gray-950 text-white flex h-screen overflow-hidden">
  <!-- Sidebar -->
  <aside class="w-64 bg-gray-900 border-r border-white/10 flex flex-col p-4 shrink-0">
    <div class="flex items-center gap-3 mb-8 px-2">
      <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-sm font-bold">
        {product_name[0].upper() if product_name else "P"}
      </div>
      <span class="font-bold text-white">{product_name}</span>
    </div>
    <nav class="space-y-1 flex-1">
      {"".join([f'<a href="#" class="sidebar-item flex items-center gap-3 px-3 py-2 rounded-lg text-gray-400 hover:text-white transition text-sm"><span>{icon}</span>{label}</a>' for icon, label in [("📊","Dashboard"),("👥","Users"),("📈","Analytics"),("⚙️","Settings")]])}
    </nav>
  </aside>
  <!-- Main -->
  <main class="flex-1 overflow-auto p-8">
    <h1 class="text-2xl font-bold mb-2">{product_name} Dashboard</h1>
    <p class="text-gray-400 mb-8">Welcome back — here's what's happening.</p>
    <div class="grid grid-cols-3 gap-4 mb-8">
      {" ".join([f'<div class="card bg-gray-900 border border-white/10 rounded-xl p-5"><p class="text-gray-400 text-sm mb-1">{label}</p><p class="text-2xl font-bold text-white">{val}</p><p class="text-green-400 text-xs mt-1">↑ {pct}% this month</p></div>' for label, val, pct in [("Total Users","12,483","18"),("Revenue","$48,291","24"),("Active Sessions","3,847","9")]])}
    </div>
    <div class="bg-gray-900 border border-white/10 rounded-xl p-6">
      <h2 class="font-semibold mb-4">Recent Activity</h2>
      <div class="space-y-3">
        {" ".join([f'<div class="flex items-center justify-between py-2 border-b border-white/5"><span class="text-gray-300 text-sm">{name}</span><span class="text-purple-400 text-xs">{action}</span></div>' for name, action in [("Alex Chen","Signed up"),("Maria Rodriguez","Upgraded plan"),("Sam Patel","Created project"),("Lisa Wang","Invited team member")]])}
      </div>
    </div>
  </main>
</body>
</html>"""


def _clean_html(raw: str) -> str:
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
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=GEMINI_API_KEY)
    response = client.models.generate_content(
        model=GEMINI_MODEL,
        contents=_build_user_prompt(req),
        config=types.GenerateContentConfig(
            system_instruction=UIUX_SYSTEM_PROMPT,
            temperature=0.7,
            max_output_tokens=8192,
        ),
    )
    return response.text or ""


async def generate_uiux_prototype(req: dict) -> dict:
    """
    Core entrypoint called by uiux_router.py.

    req keys: product_name, product_type, industry, description,
              platform, ui_style, color_theme, screens[], components[],
              primary_action, user_id?, session_id?
    Returns dict with html_content, provider.
    """
    product_name = req.get("product_name", "My Product")

    if not GEMINI_API_KEY:
        print("[uiux_prototype] Gemini skipped: no GEMINI_API_KEY")
        return {
            "html_content": _default_prototype(product_name),
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
            "provider": "gemini",
        }

    except Exception as exc:
        print(f"[uiux_prototype] Gemini error: {exc}")
        return {
            "html_content": _default_prototype(product_name),
            "provider": "fallback",
        }