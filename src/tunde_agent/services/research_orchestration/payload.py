"""Pack scraped text for LLM context windows; aggregate visual asset URLs.

Delivery payload extensions (orchestrator → mission / audit):

- ``multilingual_sources``: how each URL entered the pipeline (SERP locale / user priority).
- ``image_analysis_summary``: short prose derived from vision JSON (chart/table readings).
- ``generated_visual_url``: primary QuickChart (or similar) URL used to build the PNG, when available.
"""

from __future__ import annotations

import json
import re
from typing import Any
from urllib.parse import urlparse

_MAX_PER_SOURCE_FOR_LLM = 16_000
_MAX_COMBINED_FOR_LLM = 55_000


def clean_extracted_text(text: str, max_chars: int) -> str:
    t = re.sub(r"[ \t]+", " ", text)
    t = re.sub(r"\n{3,}", "\n\n", t)
    t = t.strip()
    if len(t) > max_chars:
        t = t[: max_chars - 1] + "…"
    return t


def host_label(url: str) -> str:
    try:
        host = urlparse(url).netloc or ""
        return host[:200] or "Source"
    except Exception:
        return "Source"


def pack_sources_for_llm(rows: list[dict]) -> str:
    """
    Pack ``rows`` with keys ``url``, ``title``, ``text``.

    Optional per-row ``visual_data_urls`` is not inlined here; use ``prepend_vision_block`` for vision text.
    """
    pieces: list[str] = []
    total = 0
    for i, row in enumerate(rows, 1):
        url = (row.get("url") or "").strip()
        title = (row.get("title") or "").strip()[:240]
        header = f"=== Source {i} ===\nURL: {url}\nTitle: {title}\n\n"
        room = _MAX_COMBINED_FOR_LLM - total - len(header) - 80
        if room < 400:
            pieces.append(f"=== Source {i} ===\nOmitted: context budget exhausted.\n")
            break
        cap = min(_MAX_PER_SOURCE_FOR_LLM, room)
        body = clean_extracted_text(row.get("text") or "", cap)
        block = header + body
        pieces.append(block)
        total += len(block) + 2
        if total >= _MAX_COMBINED_FOR_LLM:
            break
    return "\n".join(pieces)


def aggregate_visual_data_urls(collected: list[dict[str, Any]], *, max_urls: int = 12) -> list[str]:
    """Deduped list of figure/chart image URLs gathered during browsing."""
    out: list[str] = []
    seen: set[str] = set()
    for b in collected:
        for u in b.get("visual_data_urls") or []:
            u = (u or "").strip()
            if not u or u in seen:
                continue
            seen.add(u)
            out.append(u)
            if len(out) >= max_urls:
                return out
    return out


def prepend_vision_block(packed: str, vision_text: str) -> str:
    """Prepend structured vision readings before source extracts."""
    vt = (vision_text or "").strip()
    if not vt:
        return packed
    block = "--- Vision extraction (charts / figures / tables) ---\n" + vt[:14_000] + "\n\n"
    return block + packed


def image_analysis_summary_from_vision(vision_text: str, *, max_chars: int = 1200) -> str:
    """
    Compact human-readable summary for delivery / audit from vision JSON.

    Joins ``readings[].summary`` and key ``data_points`` when parseable; otherwise truncates raw text.
    """
    vt = (vision_text or "").strip()
    if not vt:
        return ""
    try:
        obj = json.loads(vt)
    except (json.JSONDecodeError, TypeError, ValueError):
        return vt[:max_chars].strip()

    readings = obj.get("readings")
    if not isinstance(readings, list) or not readings:
        return vt[:max_chars].strip()

    parts: list[str] = []
    for r in readings[:8]:
        if not isinstance(r, dict):
            continue
        summ = str(r.get("summary") or "").strip()
        kind = str(r.get("kind") or "").strip()
        dps = r.get("data_points")
        line = summ
        if kind and kind not in summ.lower():
            line = f"({kind}) {summ}".strip()
        if isinstance(dps, list) and dps:
            bits: list[str] = []
            for dp in dps[:6]:
                if isinstance(dp, dict):
                    lb = str(dp.get("label") or "").strip()
                    val = str(dp.get("value") or "").strip()
                    if lb or val:
                        bits.append(f"{lb}: {val}".strip(": "))
                elif dp:
                    bits.append(str(dp)[:80])
            if bits:
                line = (line + " — " + "; ".join(bits)).strip()
        if line:
            parts.append(line)
    out = " | ".join(parts) if parts else vt[:max_chars]
    return out[:max_chars].strip()


def normalize_multilingual_sources(
    entries: list[dict[str, Any]] | None,
    *,
    max_items: int = 24,
) -> list[dict[str, Any]]:
    """Sanitize ``multilingual_sources`` for JSON / audit (no secrets)."""
    if not entries:
        return []
    out: list[dict[str, Any]] = []
    for e in entries[:max_items]:
        if not isinstance(e, dict):
            continue
        url = str(e.get("url") or "").strip()[:2048]
        if not url:
            continue
        row: dict[str, Any] = {"url": url}
        sl = e.get("search_locale")
        if sl is not None:
            row["search_locale"] = str(sl).strip()[:32]
        role = e.get("role") or e.get("discovery")
        if role is not None:
            row["role"] = str(role).strip()[:48]
        out.append(row)
    return out
