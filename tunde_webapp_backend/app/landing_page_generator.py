from __future__ import annotations

import html as html_lib
import logging
import re
from typing import Any

logger = logging.getLogger(__name__)

_MAX_CONTEXT_CHARS = 28_000

_LANDING_SYSTEM = """You are a world-class product designer and senior front-end engineer for Tunde (AI research & analysis workspace). Your output must rival the quality of top-tier SaaS dashboards like Linear, Vercel, or Notion.

Output ONE complete HTML5 document ONLY. No markdown, no code fences, no explanation.

MANDATORY TECHNICAL SETUP (include ALL of these):
- <meta charset="utf-8"> and viewport meta
- Google Fonts Inter: <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
- Tailwind CSS: <script src="https://cdn.tailwindcss.com"></script>
- Chart.js: <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
- Lucide icons: <script src="https://unpkg.com/lucide@0.447.0/dist/umd/lucide.min.js"></script>
- Body font: font-family: 'Inter', system-ui, sans-serif

MANDATORY STRUCTURE:
1. STICKY NAVIGATION BAR
   - Logo "Tunde" on left
   - 3-5 tab links on right (one per major section)
   - Dark background, blur backdrop
   - onclick smooth scroll ONLY: onclick="document.getElementById('id').scrollIntoView({behavior:'smooth'})"

2. HERO SECTION
   - Large bold title (H1, 3-4rem)
   - Subtitle paragraph
   - "Tunde Report" pill badge
   - Dark gradient background (slate-950 to slate-900)

3. AT A GLANCE — 3 KPI CARDS
   - Extract real numbers from source material
   - Large number (2-3rem, colored: sky/emerald/violet)
   - Label below
   - Glassmorphism cards: bg-slate-900/60, backdrop-blur, border border-white/10

4. MAIN CONTENT SECTIONS (2-4 sections based on content)
   - Each section has: clear H2 heading with Lucide icon, descriptive paragraph, relevant content
   - Alternate between: findings list, data table, chart, comparison cards

5. MANDATORY CHART.JS VISUALIZATION
   - Include AT LEAST ONE Chart.js chart (bar, line, or radar)
   - Use REAL data from the source material
   - Initialize inside: window.addEventListener('load', function() { ... })
   - Dark chart theme: backgroundColor with transparency, white labels

6. DATA TABLE (if source has tabular data)
   - Clean HTML table with dark theme
   - Alternating row colors
   - Highlighted important values (red for negative, green for positive)

7. FOOTER
   - "Published with Tunde © 2026"
   - Muted slate-500 text

DESIGN RULES — STRICTLY FOLLOW:
- Color palette: slate-950/900/800 backgrounds, sky-400/emerald-400/violet-400 accents
- Cards: rounded-2xl, border border-white/10, bg-slate-900/60, backdrop-blur-xl, shadow-2xl
- Typography: H1=3rem/800weight, H2=1.5rem/700, body=1rem/400, muted=slate-400
- Spacing: generous padding (py-20 for sections, p-8 for cards)
- NEVER use Markdown syntax (**bold**) — use <strong> and <em> HTML tags
- NEVER use href="#" for navigation — use onclick scrollIntoView only
- NEVER load external images — use CSS gradients and unicode emoji instead
- ALL navigation stays within the page — no window.location or external links

CONTENT RULES:
- Synthesize and rewrite content as polished professional copy
- Extract and highlight KEY NUMBERS prominently
- Group related information into logical sections
- Write executive-level, scannable content
- Do NOT copy raw text verbatim — transform it into designed content
- Do NOT invent facts — only use what's in the source material
- If data has trends (up/down), show with colored indicators (↑ green, ↓ red)

QUALITY STANDARD:
The result must look like a $10,000 custom dashboard — professional, beautiful, and immediately useful. Every section must add value. No filler content.
"""


def _strip_wrappers(raw: str) -> str:
    s = (raw or "").strip()
    m = re.match(r"^```(?:html)?\s*([\s\S]*?)\s*```$", s, re.IGNORECASE)
    if m:
        return m.group(1).strip()
    return s


def _extract_title_from_html(doc: str) -> str:
    m = re.search(r"<title[^>]*>([^<]+)</title>", doc, re.IGNORECASE)
    if m:
        return m.group(1).strip()[:512]
    m = re.search(r"<h1[^>]*>([\s\S]*?)</h1>", doc, re.IGNORECASE)
    if m:
        text = re.sub(r"<[^>]+>", "", m.group(1)).strip()
        return text[:512]
    return ""


def _fallback_document(context: str, title: str) -> str:
    safe = html_lib.escape((context or "")[:12000])
    t = html_lib.escape((title or "Tunde Report")[:200])
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>{t}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Roboto:wght@400;500;700&display=swap" rel="stylesheet"/>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/lucide@0.447.0/dist/umd/lucide.min.js"></script>
</head>
<body class="min-h-screen bg-slate-950 text-slate-100 antialiased" style="font-family: Inter, Roboto, system-ui, sans-serif">
  <div class="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(56,189,248,0.12),_transparent_55%),radial-gradient(ellipse_at_bottom,_rgba(16,185,129,0.08),_transparent_50%)]"></div>
  <header class="relative border-b border-slate-800/90 px-6 py-12">
    <div class="mx-auto max-w-4xl rounded-2xl border border-white/10 bg-slate-900/55 p-8 shadow-2xl shadow-black/40 backdrop-blur-xl">
      <div class="inline-flex items-center gap-2 rounded-full border border-sky-500/35 bg-sky-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-sky-300/95">
        <i data-lucide="sparkles" class="h-3.5 w-3.5"></i> Tunde Report
      </div>
      <h1 class="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">{t}</h1>
      <p class="mt-3 max-w-2xl text-sm leading-relaxed text-slate-400">
        Fallback layout — connect an LLM for a fully designed landing page. Below is a structured excerpt of your workspace context.
      </p>
    </div>
  </header>
  <main class="relative mx-auto max-w-4xl px-6 py-10">
    <section class="rounded-2xl border border-slate-700/80 bg-slate-900/50 p-6 shadow-xl backdrop-blur-md">
      <h2 class="flex items-center gap-2 text-lg font-semibold text-emerald-300/95">
        <i data-lucide="file-text" class="h-5 w-5 text-emerald-400/90"></i> Workspace context
      </h2>
      <pre class="mt-4 max-h-[28rem] overflow-auto whitespace-pre-wrap rounded-xl border border-slate-800/90 bg-slate-950/70 p-4 text-xs leading-relaxed text-slate-300">{safe}</pre>
    </section>
  </main>
  <footer class="relative border-t border-slate-800/90 px-6 py-8 text-center text-xs text-slate-500">Published with Tunde</footer>
  <script>document.addEventListener("DOMContentLoaded", function () {{ if (window.lucide) lucide.createIcons(); }});</script>
</body>
</html>"""


def generate_landing_document(
    *,
    context: str,
    title_hint: str | None = None,
    existing_html: str | None = None,
    revision_notes: str | None = None,
) -> dict[str, Any]:
    """
    Produce a full HTML document string. Uses configured LLM when available; otherwise fallback.
    """
    ctx = (context or "").strip()[:_MAX_CONTEXT_CHARS]
    parts: list[str] = []
    if ctx:
        parts.append(f"Source material:\n{ctx}")
    if existing_html and revision_notes:
        parts.append(
            "Existing page HTML (revise in place; keep Tailwind CDN and overall structure):\n"
            + (existing_html[:18_000])
            + "\n\nRevision request:\n"
            + (revision_notes.strip()[:4000])
        )
    elif revision_notes and not existing_html:
        parts.append("Additional instructions:\n" + revision_notes.strip()[:4000])

    if not parts:
        parts.append("(No new source material; apply revision to the existing page only.)")
    user_message = "\n\n---\n\n".join(parts)

    doc: str | None = None
    try:
        from tunde_agent.config.settings import get_settings
        from tunde_agent.services.llm_service import LLMError, build_llm_client

        settings = get_settings()
        provider = (settings.default_llm_provider or "gemini").strip().lower()
        client = build_llm_client(settings, provider)
        raw = client.complete(_LANDING_SYSTEM, user_message)
        candidate = _strip_wrappers(raw)
        if candidate.lower().startswith("<!doctype") or "<html" in candidate.lower():
            doc = candidate
    except Exception as exc:
        logger.warning("Landing LLM generation failed: %s", str(exc)[:200])

    if not doc:
        doc = _fallback_document(ctx, title_hint or "Tunde Report")

    title = _extract_title_from_html(doc) or (title_hint or "Tunde Report")
    return {"html": doc, "title": title[:512]}
