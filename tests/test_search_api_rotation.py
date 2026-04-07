"""Search API provider chain (rotation) unit tests."""

from __future__ import annotations

import os

os.environ.setdefault("TUNDE_SEARCH_API_SILENT_STDOUT", "1")

from types import SimpleNamespace
from unittest.mock import patch

import pytest

from tunde_agent.services.search_api.exceptions import SearchProviderRateLimited
from tunde_agent.services.search_api.router import api_search_urls


@pytest.fixture
def settings_google_then_serper() -> SimpleNamespace:
    return SimpleNamespace(
        google_search_api_key="gk",
        google_custom_search_cx="cx",
        serper_api_key="sk",
        riley_api_key="",
        riley_search_api_url="",
    )


def test_rotation_google_429_then_serper_ok(settings_google_then_serper: SimpleNamespace) -> None:
    """Patch router-bound callables (``httpx.Client`` lives on one shared ``httpx`` module)."""

    def fake_google(
        query: str,
        settings: SimpleNamespace,
        *,
        num: int,
        hl: str,
        gl: str,
    ) -> list[str]:
        raise SearchProviderRateLimited("limit", status_code=429, provider="Google CSE")

    def fake_serper(
        query: str,
        settings: SimpleNamespace,
        *,
        num: int,
        hl: str,
        gl: str,
    ) -> list[str]:
        return ["https://one.example/page", "https://two.example/"]

    with patch("tunde_agent.services.search_api.router.search_google_cse", side_effect=fake_google):
        with patch("tunde_agent.services.search_api.router.search_serper", side_effect=fake_serper):
            urls = api_search_urls("climate report", settings_google_then_serper, num=5)
    assert urls == ["https://one.example/page", "https://two.example/"]


def test_all_unconfigured_returns_empty() -> None:
    s = SimpleNamespace(
        google_search_api_key="",
        google_custom_search_cx="",
        serper_api_key="",
        riley_api_key="",
        riley_search_api_url="",
    )
    assert api_search_urls("q", s, num=5) == []
