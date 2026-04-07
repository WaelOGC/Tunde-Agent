"""Collect likely chart/diagram/table image URLs from a rendered page."""

from __future__ import annotations

import re
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup
from playwright.sync_api import Page

# Skip tiny UI / tracking patterns (heuristic).
_SKIP_SUBSTRINGS: tuple[str, ...] = (
    "favicon",
    "pixel",
    "tracking",
    "analytics",
    "facebook.com",
    "doubleclick",
    "googleads",
    "1x1",
    "spacer",
    "blank.gif",
    "data:image",
)

_CHART_HINTS: tuple[str, ...] = (
    "chart",
    "graph",
    "diagram",
    "plot",
    "figure",
    "infographic",
    "visualization",
    "data",
    "table",
    "svg",
    "stats",
    "trend",
    "growth",
    "forecast",
    "metric",
    "kpi",
)


def _absolute_url(base: str, href: str) -> str | None:
    href = (href or "").strip()
    if not href or href.startswith("#") or href.lower().startswith("javascript:"):
        return None
    if href.startswith("data:"):
        return None
    joined = urljoin(base, href)
    p = urlparse(joined)
    if p.scheme not in ("http", "https") or not p.netloc:
        return None
    return joined.split("#")[0]


def collect_visual_data_urls(page: Page, page_url: str, *, limit: int = 8) -> list[str]:
    """
    Return absolute image URLs likely to be charts, diagrams, or data figures.

    Uses DOM heuristics (alt/title/src/class/id) plus size hints when present.
    """
    try:
        html = page.content()
    except Exception:
        return []

    soup = BeautifulSoup(html, "html.parser")
    scored: list[tuple[int, str]] = []

    for img in soup.select("img[src], picture img[src]"):
        src = img.get("src") or ""
        abs_u = _absolute_url(page_url, src)
        if not abs_u:
            continue
        low = abs_u.lower()
        if any(s in low for s in _SKIP_SUBSTRINGS):
            continue

        alt = (img.get("alt") or "").lower()
        title = (img.get("title") or "").lower()
        cls = " ".join(img.get("class") or []).lower()
        elem_id = (img.get("id") or "").lower()
        blob = f"{alt} {title} {cls} {elem_id} {low}"

        score = 0
        for hint in _CHART_HINTS:
            if hint in blob:
                score += 3

        w = img.get("width")
        h = img.get("height")
        try:
            wi = int(str(w).rstrip("px")) if w else 0
            hi = int(str(h).rstrip("px")) if h else 0
            if wi >= 200 or hi >= 200:
                score += 2
            if wi and hi and wi < 24 and hi < 24:
                score -= 10
        except (TypeError, ValueError):
            pass

        if re.search(r"/(icon|logo|avatar|badge|emoji)[/.]", low):
            score -= 5

        if score < 1 and not any(h in low for h in ("chart", "graph", "plot", "diagram", "figure")):
            continue

        scored.append((score, abs_u))

    scored.sort(key=lambda x: -x[0])
    out: list[str] = []
    seen: set[str] = set()
    for _s, u in scored:
        k = u.lower().rstrip("/")
        if k in seen:
            continue
        seen.add(k)
        out.append(u)
        if len(out) >= limit:
            break

    return out
