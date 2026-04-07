"""Regression: DuckDuckGo HTML uses protocol-relative /l/?uddg= redirects — must unwrap to real URLs."""

from __future__ import annotations

from tunde_agent.tools.browser.google_search import (
    extract_duckduckgo_html_urls,
    normalize_serp_anchor_href,
)


def test_normalize_duckduckgo_uddg_redirect() -> None:
    href = "//duckduckgo.com/l/?uddg=https%3A%2F%2Fen.wikipedia.org%2Fwiki%2FCoffee&rut=abc"
    assert normalize_serp_anchor_href(href) == "https://en.wikipedia.org/wiki/Coffee"


def test_normalize_skips_ddg_ad_bridge() -> None:
    href = "//duckduckgo.com/l/?uddg=https%3A%2F%2Fduckduckgo.com%2Fy.js%3Fad_domain%3Dx"
    assert normalize_serp_anchor_href(href) is None


def test_extract_duckduckgo_from_fixture() -> None:
    # Minimal organic block matching live DDG HTML
    html = """
    <html><body><div id="links" class="results">
      <div class="result web-result">
        <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.org%2Fpage&amp;rut=x">Title</a>
      </div>
    </div></body></html>
    """
    urls = extract_duckduckgo_html_urls(html, max_results=5)
    assert urls == ["https://example.org/page"]
