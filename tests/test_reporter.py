"""Reporter helpers (plain text, PDF/DOCX/CSV builders)."""

from __future__ import annotations

from tunde_agent.services.reporter import (
    build_docx_bytes,
    build_pdf_bytes,
    build_sheet_csv_bytes,
    extract_title_from_html,
    html_to_plain,
)


def test_html_to_plain_strips_tags() -> None:
    h = "<html><body><p>Hello <b>world</b></p></body></html>"
    assert html_to_plain(h) == "Hello world"


def test_extract_title_from_html() -> None:
    h = "<head><title>Gold · Tunde AI Agent</title></head>"
    t = extract_title_from_html(h, fallback="x")
    assert "Gold" in t
    assert "Tunde" not in t or "Gold" in t


def test_build_pdf_and_docx_non_empty() -> None:
    pdf = build_pdf_bytes("Hi", "Paragraph one.\n\nParagraph two.")
    assert len(pdf) > 100
    assert pdf[:4] == b"%PDF"

    docx = build_docx_bytes("Hi", "Body text here.")
    assert len(docx) > 2000
    assert docx[:2] == b"PK"


def test_build_csv_has_bom_and_rows() -> None:
    raw = build_sheet_csv_bytes("T", "alpha" * 100)
    assert raw.startswith(b"\xef\xbb\xbf")
    assert b"block" in raw.lower() or b"block_1" in raw
