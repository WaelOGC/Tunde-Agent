from __future__ import annotations

import io
import logging
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

_MAX_UPLOAD_BYTES = int(__import__("os").getenv("TUNDE_MAX_UPLOAD_BYTES", str(8 * 1024 * 1024)))
_ALLOWED_EXT = frozenset({".csv", ".xlsx", ".pdf", ".txt"})
_MAX_TABULAR_CSV_CHARS = 450_000
_MAX_TEXT_EXCERPT = 12_000
_MAX_PDF_PAGES = 15


class FileAnalystError(Exception):
    """Validation or parsing failure for uploads."""


def normalize_extension(filename: str) -> str:
    return Path(filename or "").suffix.lower()


def validate_upload(*, filename: str, size: int) -> str:
    ext = normalize_extension(filename)
    if ext not in _ALLOWED_EXT:
        raise FileAnalystError(f"Unsupported type {ext or '(none)'}. Allowed: {', '.join(sorted(_ALLOWED_EXT))}.")
    if size <= 0:
        raise FileAnalystError("Empty file.")
    if size > _MAX_UPLOAD_BYTES:
        mb = _MAX_UPLOAD_BYTES // (1024 * 1024)
        raise FileAnalystError(f"File too large (max {mb} MB).")
    return ext


def _truncate(s: str, n: int) -> str:
    t = (s or "").strip()
    if len(t) <= n:
        return t
    return t[: n - 1].rstrip() + "…"


def ingest_file(*, filename: str, content: bytes) -> dict[str, Any]:
    """
    Parse upload into fields consumed by the tools layer and UI.

    Returns a dict suitable for merging into file_store registry:
    kind, summary, tabular_csv?, text_excerpt?, n_rows?, n_cols?, pdf_pages?
    """
    ext = validate_upload(filename=filename, size=len(content))
    kind = ext.lstrip(".")

    if ext == ".txt":
        text = content.decode("utf-8", errors="replace")
        n = len(text)
        summary = f"I've received your text file ({n:,} characters). What would you like to do next?"
        return {
            "kind": "txt",
            "summary": summary,
            "tabular_csv": None,
            "text_excerpt": _truncate(text, _MAX_TEXT_EXCERPT),
            "n_rows": None,
            "n_cols": None,
            "pdf_pages": None,
        }

    if ext == ".pdf":
        text, pages_used = _extract_pdf_text(content)
        n = len(text)
        summary = (
            f"I've received your PDF ({pages_used} page(s) scanned for text, {n:,} characters extracted). "
            "What would you like to do next?"
        )
        return {
            "kind": "pdf",
            "summary": summary,
            "tabular_csv": None,
            "text_excerpt": _truncate(text, _MAX_TEXT_EXCERPT),
            "n_rows": None,
            "n_cols": None,
            "pdf_pages": pages_used,
        }

    try:
        import pandas as pd
    except ImportError as exc:
        raise FileAnalystError("Tabular support requires pandas (server dependency).") from exc

    if ext == ".csv":
        df = pd.read_csv(io.BytesIO(content))
        return _dataframe_ingest(df, label="CSV")

    if ext == ".xlsx":
        df = pd.read_excel(io.BytesIO(content), engine="openpyxl")
        return _dataframe_ingest(df, label="Excel")

    raise FileAnalystError("Unsupported file type.")


def _dataframe_ingest(df: Any, *, label: str) -> dict[str, Any]:
    rows, cols = int(df.shape[0]), int(df.shape[1])
    summary = (
        f"I've received your {label} with {rows:,} rows and {cols} columns. What would you like to do next?"
    )
    csv_buf = io.StringIO()
    try:
        df.head(5000).to_csv(csv_buf, index=False)
        tabular = csv_buf.getvalue()
    except Exception as exc:
        logger.warning("dataframe to_csv failed: %s", exc)
        tabular = ""
    if len(tabular) > _MAX_TABULAR_CSV_CHARS:
        tabular = tabular[:_MAX_TABULAR_CSV_CHARS].rstrip() + "\n…"
    return {
        "kind": "tabular",
        "summary": summary,
        "tabular_csv": tabular or None,
        "text_excerpt": None,
        "n_rows": rows,
        "n_cols": cols,
        "pdf_pages": None,
    }


def _extract_pdf_text(content: bytes) -> tuple[str, int]:
    try:
        import pdfplumber
    except ImportError as exc:
        raise FileAnalystError("PDF support requires pdfplumber (server dependency).") from exc
    chunks: list[str] = []
    pages_used = 0
    try:
        with pdfplumber.open(io.BytesIO(content)) as pdf:
            for i, page in enumerate(pdf.pages[:_MAX_PDF_PAGES]):
                try:
                    t = page.extract_text() or ""
                except Exception:
                    t = ""
                t = t.strip()
                if t:
                    chunks.append(t)
                pages_used = i + 1
    except Exception as exc:
        raise FileAnalystError(f"Could not read PDF: {exc!s}") from exc
    return "\n\n".join(chunks), pages_used or 0


def tool_context_markdown(meta: dict[str, Any]) -> str:
    """Rich context prepended to tool output for the LLM."""
    lines = [
        "[Tunde File Analyst — attached file context]",
        f"- File: {meta.get('filename')}",
        f"- kind: {meta.get('kind')}",
    ]
    if meta.get("n_rows") is not None:
        lines.append(f"- rows: {meta.get('n_rows')}, columns: {meta.get('n_cols')}")
    if meta.get("pdf_pages") is not None:
        lines.append(f"- pdf_pages_scanned: {meta.get('pdf_pages')}")
    lines.append(f"- summary: {meta.get('summary')}")
    ex = meta.get("text_excerpt")
    if isinstance(ex, str) and ex.strip():
        lines.append("\n### Extracted text (excerpt)\n" + ex.strip())
    return "\n".join(lines)


def planning_augmentation(meta: dict[str, Any]) -> str:
    """Short suffix appended to the user message for tool routing."""
    fn = meta.get("filename") or "file"
    kind = meta.get("kind") or "unknown"
    bits = [f"[Attached file: {fn}, type={kind}]"]
    if meta.get("n_rows") is not None:
        bits.append(f"Rows={meta.get('n_rows')}, columns={meta.get('n_cols')}.")
    if meta.get("tabular_csv"):
        bits.append("Tabular data is available for analysis.")
    elif meta.get("text_excerpt"):
        bits.append("Document text excerpt is available for summarization.")
    return " ".join(bits)


_ACTION_INSTRUCTIONS: dict[str, str] = {
    "summarize": (
        "[Tunde Data Wizard — Summarize Content]\n"
        "Give a structured summary of the attached file. Use clear headings and bullets; "
        "cover scope, key entities, and main takeaways."
    ),
    "analyze": (
        "[Tunde Data Wizard — Perform Data Analysis]\n"
        "Analyze the attached tabular data (or quantify text patterns if not tabular). "
        "Report notable statistics, missing values, outliers, and relationships where applicable."
    ),
    "insights": (
        "[Tunde Data Wizard — Extract Key Insights]\n"
        "List the highest-value insights and actionable takeaways from the attached file. "
        "Prioritize clarity and decision usefulness."
    ),
    "visualize": (
        "[Tunde Data Wizard — Visualize Data]\n"
        "Describe the best charts or visuals for this dataset or content (types, axes, metrics). "
        "Note: interactive canvas charts are not rendered yet—be specific so they can be implemented later."
    ),
}


def augment_user_message_for_action(user_text: str, action: str | None) -> str:
    ut = (user_text or "").strip()
    key = (action or "").strip().lower()
    if key not in _ACTION_INSTRUCTIONS:
        return ut
    prefix = _ACTION_INSTRUCTIONS[key]
    if not ut:
        return prefix
    return prefix + "\n\nUser note:\n" + ut
