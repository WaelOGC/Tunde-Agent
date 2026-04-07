"""Mission report public URL construction and Telegram teaser CTA."""

from __future__ import annotations

from types import SimpleNamespace

from tunde_agent.services.mission_service import _build_report_page_url, _resolve_report_public_base
from tunde_agent.services.telegram_markdown_v2 import (
    TEASER_REPORT_CTA_LABEL,
    format_telegram_mission_teaser_html,
    telegram_inline_keyboard_url_allowed,
)


def test_resolve_public_base_strips_path_and_adds_scheme() -> None:
    s = SimpleNamespace(public_base_url="https://app.example.com/v1/extra")
    assert _resolve_report_public_base(s) == "https://app.example.com"

    s2 = SimpleNamespace(public_base_url="reports.example.com:8443")
    assert _resolve_report_public_base(s2) == "https://reports.example.com:8443"


def test_build_report_page_url() -> None:
    s = SimpleNamespace(public_base_url="https://t.example.com/")
    assert _build_report_page_url(s, "550e8400-e29b-41d4-a716-446655440000") == (
        "https://t.example.com/reports/view/550e8400-e29b-41d4-a716-446655440000"
    )


def test_inline_keyboard_url_rejects_loopback() -> None:
    assert not telegram_inline_keyboard_url_allowed("http://localhost:8000/r")
    assert not telegram_inline_keyboard_url_allowed("http://127.0.0.1:8000/r")
    assert telegram_inline_keyboard_url_allowed("https://example.com/reports/view/x")


def test_teaser_cta_is_html_anchor() -> None:
    url = "https://x.example/reports/view/abc"
    body = format_telegram_mission_teaser_html(
        "My topic",
        tagline="Tag",
        executive_summary="Short.",
        insights=["One"],
        report_url=url,
    )
    assert "<a href=" in body
    assert TEASER_REPORT_CTA_LABEL in body
    assert "https://x.example/reports/view/abc" in body
