from __future__ import annotations

"""
Tabular analysis for the dashboard.

Structured block for the WebSocket/UI (``type: "table"``)::

    {
        "type": "table",
        "title": "Parsed table",
        "headers": ["Col A", "Col B"],
        "rows": [["a", "b"], ...],
    }

The chat UI also parses pipe-markdown tables from model text into the same table component.
"""

import csv
import io
import logging
import re
from typing import Any

logger = logging.getLogger(__name__)

_MAX_ROWS_UI = 24
_MAX_COLS = 12


def _looks_like_tabular(text: str) -> bool:
    lines = [ln.strip() for ln in (text or "").splitlines() if ln.strip()]
    if len(lines) < 2:
        return False
    sample = lines[:12]
    comma_hits = sum(1 for ln in sample if ln.count(",") >= 2 or ln.count("\t") >= 2)
    return comma_hits >= 2


def analyze_tabular_text(raw: str) -> tuple[str, dict[str, Any] | None]:
    """
    Parse CSV/TSV-like text into a summary for the LLM and a ``table`` block for the UI.
    Returns ``(context_markdown, block_or_none)``.
    """
    text = (raw or "").strip()
    if not text:
        return "", None
    if not _looks_like_tabular(text):
        return "", None

    delimiter = ","
    try:
        dialect = csv.Sniffer().sniff(text[:4096], delimiters=",\t;")
        delimiter = dialect.delimiter
    except csv.Error:
        if "\t" in text.splitlines()[0]:
            delimiter = "\t"

    reader = csv.reader(io.StringIO(text), delimiter=delimiter)
    rows: list[list[str]] = []
    try:
        for i, row in enumerate(reader):
            if i >= _MAX_ROWS_UI + 1:
                break
            cleaned = [str(c).strip() for c in row[:_MAX_COLS]]
            if any(cleaned):
                rows.append(cleaned)
    except Exception as exc:
        logger.debug("CSV parse failed: %s", exc)
        return "", None

    if len(rows) < 2:
        return "", None

    headers = rows[0]
    body = rows[1:]
    ncols = max(len(r) for r in rows)
    if ncols < 2 and len(body) < 2:
        return "", None

    # Pad ragged rows for display
    def pad(r: list[str]) -> list[str]:
        out = list(r) + [""] * (len(headers) - len(r))
        return out[: len(headers)]

    body_padded = [pad(r) for r in body[:_MAX_ROWS_UI]]

    numeric_cols: list[int] = []
    for ci in range(min(len(headers), len(body_padded[0]) if body_padded else 0)):
        col_vals = [r[ci] for r in body_padded if ci < len(r)]
        nums: list[float] = []
        for v in col_vals:
            v2 = re.sub(r"[,$%]", "", v).strip()
            try:
                nums.append(float(v2))
            except ValueError:
                break
        if len(nums) == len(col_vals) and nums:
            numeric_cols.append(ci)

    stats_lines: list[str] = ["[Data analysis — tabular input]"]
    for ci in numeric_cols[:6]:
        col_vals = [float(re.sub(r"[,$%]", "", r[ci]).strip()) for r in body_padded if ci < len(r)]
        if col_vals:
            h = headers[ci] if ci < len(headers) else f"col_{ci}"
            stats_lines.append(
                f"- Column {h!r}: n={len(col_vals)}, min={min(col_vals):.4g}, max={max(col_vals):.4g}, "
                f"avg={sum(col_vals) / len(col_vals):.4g}"
            )

    context = "\n".join(stats_lines) if len(stats_lines) > 1 else ""
    block: dict[str, Any] = {
        "type": "table",
        "title": "Parsed table",
        "headers": headers,
        "rows": body_padded,
    }
    return context, block
