"""
Navigate, extract visible text, screenshot — with CAPTCHA policy and per-navigation audit rows.
"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path

from bs4 import BeautifulSoup
from playwright.sync_api import Page

from tunde_agent.config.settings import project_root
from tunde_agent.db.session import db_session
from tunde_agent.models.audit_log import AuditLog
from tunde_agent.tools.browser.engine import BrowserEngine, assert_allowed_browse_url
from tunde_agent.tools.browser.exceptions import CaptchaHandoffRequired

logger = logging.getLogger(__name__)


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


def save_screenshot(page: Page, stem: str) -> Path:
    """Write PNG under ``downloads/`` with a unique filename."""
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    path = _downloads_dir() / f"{stem}_{ts}.png"
    page.screenshot(path=str(path), full_page=False)
    return path


def research_browse(
    url: str,
    user_id: uuid.UUID,
    *,
    headless: bool = True,
    navigation_timeout_ms: int = 45_000,
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
            page.goto(url, wait_until="domcontentloaded", timeout=navigation_timeout_ms)
            final_url = page.url
            engine.enforce_captcha_policy(page, final_url, user_id)

            title = page.title()
            text = extract_page_text(page)
            shot = save_screenshot(page, "research")

            _audit_navigation(
                user_id,
                "browser_navigate",
                {
                    "url": final_url,
                    "phase": "complete",
                    "tool": "research_browse",
                    "title": title[:500],
                    "screenshot": str(shot.name),
                },
            )

            return {
                "url": final_url,
                "title": title,
                "text": text,
                "text_excerpt": text[:8000],
                "screenshot_path": str(shot),
            }
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
