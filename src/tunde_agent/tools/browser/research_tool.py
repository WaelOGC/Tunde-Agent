"""
Navigate, extract visible text, screenshot — with CAPTCHA policy and per-navigation audit rows.
"""

from __future__ import annotations

import base64
import json
import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

from bs4 import BeautifulSoup
from playwright.sync_api import Error as PlaywrightError
from playwright.sync_api import Page

from tunde_agent.config.settings import project_root
from tunde_agent.db.session import db_session
from tunde_agent.models.audit_log import AuditLog
from tunde_agent.tools.browser.engine import BrowserEngine, assert_allowed_browse_url
from tunde_agent.tools.browser.exceptions import CaptchaHandoffRequired
from tunde_agent.tools.browser.visual_extract import collect_visual_data_urls

logger = logging.getLogger(__name__)


def serp_page_suggests_search_blocked(html: str) -> bool:
    """
    Whether raw SERP HTML looks like CAPTCHA, rate limiting, or a consent wall.

    Delegates to ``google_search.serp_html_suggests_blocked_search`` (single source of truth).
    """
    from tunde_agent.tools.browser.google_search import serp_html_suggests_blocked_search

    return serp_html_suggests_blocked_search(html)

# 1×1 PNG placeholder when navigation triggers a download (e.g. direct PDF) but a screenshot is required.
_PLACEHOLDER_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)


def _downloads_dir() -> Path:
    d = project_root() / "downloads"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _audit_navigation(user_id: uuid.UUID, action_type: str, details: dict) -> None:
    with db_session(user_id) as session:
        session.add(
            AuditLog(
                user_id=user_id,
                action_type=action_type,
                details=json.dumps(details, separators=(",", ":")),
            )
        )


def extract_page_text(page: Page) -> str:
    """Visible document text via BeautifulSoup (drops script/style)."""
    html = page.content()
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "noscript"]):
        tag.decompose()
    text = soup.get_text(separator="\n", strip=True)
    return "\n".join(line for line in text.splitlines() if line)


def save_screenshot(page: Page, stem: str, *, full_page: bool = False) -> Path:
    """Write PNG under ``downloads/`` with a unique filename."""
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    path = _downloads_dir() / f"{stem}_{ts}.png"
    page.screenshot(path=str(path), type="png", full_page=full_page)
    return path


def capture_screenshot_png(page: Page, stem: str, *, full_page: bool = False) -> tuple[Path, bytes]:
    """Capture viewport or full-page PNG; write to ``downloads/`` and return path + bytes."""
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    png = page.screenshot(type="png", full_page=full_page)
    path = _downloads_dir() / f"{stem}_{ts}.png"
    path.write_bytes(png)
    return path, png


def research_browse(
    url: str,
    user_id: uuid.UUID,
    *,
    headless: bool = True,
    navigation_timeout_ms: int = 45_000,
    screenshot_full_page: bool = False,
    include_screenshot_bytes: bool = False,
) -> dict:
    """
    Open ``url``, enforce CAPTCHA policy, return title, text excerpt, screenshot path.

    Raises ``CaptchaHandoffRequired`` after notification if a challenge remains.
    """
    assert_allowed_browse_url(url)
    _audit_navigation(
        user_id,
        "browser_navigate",
        {"url": url, "phase": "start", "tool": "research_browse"},
    )

    with BrowserEngine(headless=headless) as engine:
        context, page = engine.new_context_page()
        try:
            page.set_default_timeout(navigation_timeout_ms)
            try:
                page.goto(url, wait_until="domcontentloaded", timeout=navigation_timeout_ms)
            except PlaywrightError as exc:
                err = str(exc)
                if "Download is starting" not in err and "download" not in err.lower():
                    raise
                logger.warning("research_browse: URL triggered download instead of HTML url=%s", url[:160])
                path_name = Path(urlparse(url).path).name or url
                final_url = url
                title = path_name[:500] if path_name else (url[:500])
                body = (
                    "This URL initiated a file download (commonly a PDF or other binary) rather than an HTML page. "
                    "No page text was extracted from rendered content; open the link directly to view the file.\n\n"
                    f"URL: {url}"
                )
                _audit_navigation(
                    user_id,
                    "browser_navigate",
                    {
                        "url": final_url,
                        "phase": "download_only",
                        "tool": "research_browse",
                        "title": title[:500],
                        "error_hint": err[:300],
                    },
                )
                ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
                shot = _downloads_dir() / f"research_placeholder_{ts}.png"
                if include_screenshot_bytes:
                    shot.write_bytes(_PLACEHOLDER_PNG)
                    png_bytes = bytes(_PLACEHOLDER_PNG)
                else:
                    shot.write_bytes(_PLACEHOLDER_PNG)
                    png_bytes = None

                out: dict = {
                    "url": final_url,
                    "title": title,
                    "text": body,
                    "text_excerpt": body[:8000],
                    "screenshot_path": str(shot),
                }
                if png_bytes is not None:
                    out["screenshot_png"] = png_bytes
                out["visual_data_urls"] = []
                return out

            final_url = page.url
            engine.enforce_captcha_policy(page, final_url, user_id)

            title = page.title()
            text = extract_page_text(page)
            if include_screenshot_bytes:
                shot, png_bytes = capture_screenshot_png(page, "research", full_page=screenshot_full_page)
            else:
                shot = save_screenshot(page, "research", full_page=screenshot_full_page)
                png_bytes = None

            _audit_navigation(
                user_id,
                "browser_navigate",
                {
                    "url": final_url,
                    "phase": "complete",
                    "tool": "research_browse",
                    "title": title[:500],
                    "screenshot": str(shot.name),
                    "screenshot_full_page": screenshot_full_page,
                },
            )

            out = {
                "url": final_url,
                "title": title,
                "text": text,
                "text_excerpt": text[:8000],
                "screenshot_path": str(shot),
            }
            if png_bytes is not None:
                out["screenshot_png"] = png_bytes
            try:
                out["visual_data_urls"] = collect_visual_data_urls(page, final_url, limit=8)
            except Exception:
                out["visual_data_urls"] = []
            return out
        finally:
            context.close()


def run_test_browse(
    url: str,
    user_id: uuid.UUID,
    *,
    headless: bool = True,
) -> dict:
    """
    Lightweight browse for ``GET /test-browse``: title + CAPTCHA flags, minimal extraction.
    """
    assert_allowed_browse_url(url)
    _audit_navigation(
        user_id,
        "browser_navigate",
        {"url": url, "phase": "start", "tool": "test_browse"},
    )

    with BrowserEngine(headless=headless) as engine:
        context, page = engine.new_context_page()
        try:
            page.set_default_timeout(45_000)
            page.goto(url, wait_until="domcontentloaded", timeout=45_000)
            final_url = page.url
            try:
                engine.enforce_captcha_policy(page, final_url, user_id)
            except CaptchaHandoffRequired as exc:
                _audit_navigation(
                    user_id,
                    "browser_navigate",
                    {
                        "url": final_url,
                        "phase": "captcha_handoff",
                        "tool": "test_browse",
                        "captcha_kind": exc.kind,
                    },
                )
                return {
                    "url": final_url,
                    "title": page.title(),
                    "captcha_detected": True,
                    "captcha_handoff": True,
                    "captcha_kind": exc.kind,
                }

            title = page.title()
            _audit_navigation(
                user_id,
                "browser_navigate",
                {
                    "url": final_url,
                    "phase": "complete",
                    "tool": "test_browse",
                    "title": title[:500],
                },
            )
            return {
                "url": final_url,
                "title": title,
                "captcha_detected": False,
                "captcha_handoff": False,
                "captcha_kind": None,
            }
        finally:
            context.close()
