from __future__ import annotations

import html as html_lib
import logging
import re
from typing import Any

logger = logging.getLogger(__name__)

_MAX_CONTEXT_CHARS = 28_000

_LANDING_SYSTEM = """You are a senior product designer and front-end engineer for **Tunde** (research & analysis workspace).

Output **one complete HTML5 document only** (no markdown, no code fences, no preamble).

Requirements:
- **Head:** `<meta charset="utf-8">`, viewport meta, concise `<title>`.
- **Typography:** Load **Inter** (and optionally Roboto) from Google Fonts; set `font-family: 'Inter', 'Roboto', system-ui, sans-serif` on `body`.
- **Styling:** `<script src="https://cdn.tailwindcss.com"></script>` for utility classes.
- **Icons:** Load Lucide UMD, then call `lucide.createIcons()` once after DOM ready (e.g. `DOMContentLoaded`). Use `<i data-lucide="...">` for 4–8 meaningful icons (hero, sections, bullets) — not decoration spam.
- **Visual language — premium Tunde dark:** Default **dark mode**: `bg-slate-950` / `bg-slate-900`, **high contrast** text (`text-slate-100`, muted `text-slate-400`). Use **glassmorphism** on key surfaces: `backdrop-blur-xl`, semi-transparent backgrounds (`bg-slate-900/60`, `border border-white/10` or `border-slate-700/80`), soft inner highlights. **Clean borders** and rounded-2xl cards; restrained **sky** / **emerald** accents (no rainbow).
- **Layout (semantic HTML):**
  1) `<header>` — **Hero**: large `h1`, supporting line, pill badge “Tunde Report”, optional subtle gradient or radial glow **behind** glass panels (CSS only).
  2) `<main>` — **Synthesized** sections (not a wall of quoted context). Write as a polished briefing: executive tone, scannable.
     - **At a glance** — 3 short glass **stat or insight cards** (numbers only if present in source).
     - **Key findings** — tight bullets with Lucide icons where helpful.
     - **Evidence / data** — if the source has tables or metrics, one **HTML table** or **CSS-only bar chart** (flex + height %; no chart libraries).
     - **Recommendations or caveats** — only if grounded in the source; otherwise a brief **Gaps** note.
  3) `<footer>` — muted “Published with Tunde”.
- **Content rules:** **Synthesize** the user’s material into clear narratives and headings. Do **not** dump raw chat logs, long quotes, or repetitive lists. Do **not** invent numbers or facts. If something is unknown, state uncertainty briefly in a callout.
- **Safety:** Allowed remote assets only: Tailwind CDN, Google Fonts stylesheets, Lucide UMD. No other scripts, no iframes, no fetch/XHR. No provider or model names in visible copy.
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
