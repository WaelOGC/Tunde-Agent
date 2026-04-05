"""
Playwright browser engine with playwright-stealth and CAPTCHA detection (captcha_handling_policy.md).
"""

from __future__ import annotations

import logging
import uuid
from urllib.parse import urlparse

from playwright.sync_api import Browser, BrowserContext, Page, Playwright, sync_playwright
from playwright_stealth import Stealth

logger = logging.getLogger(__name__)

# Selectors for common challenge widgets (conservative; extend as needed).
_CAPTCHA_SELECTOR_GROUPS: tuple[tuple[str, str], ...] = (
    ("recaptcha", "iframe[src*='recaptcha'], iframe[title*='reCAPTCHA'], .g-recaptcha"),
    ("hcaptcha", "iframe[src*='hcaptcha'], iframe[title*='hCaptcha'], [data-hcaptcha-widget-id]"),
    ("turnstile", "iframe[src*='challenges.cloudflare.com'], iframe[src*='turnstile']"),
)


def assert_allowed_browse_url(url: str) -> None:
    """Reject non-http(s) schemes to reduce open-proxy risk."""
    parsed = urlparse(url.strip())
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise ValueError("Only absolute http or https URLs are allowed.")


class BrowserEngine:
    """
    Sync Playwright lifecycle with stealth applied via ``Stealth().use_sync(sync_playwright())``.

    Headless by default; set ``headed=True`` for local debugging (non-headless).
    """

    def __init__(self, *, headless: bool = True) -> None:
        self._headless = headless
        self._stealth: Stealth | None = None
        self._pw_cm = None
        self._playwright: Playwright | None = None
        self._browser: Browser | None = None

    @property
    def headless(self) -> bool:
        return self._headless

    def __enter__(self) -> BrowserEngine:
        self._stealth = Stealth()
        self._pw_cm = self._stealth.use_sync(sync_playwright())
        self._playwright = self._pw_cm.__enter__()
        self._browser = self._playwright.chromium.launch(headless=self._headless)
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        try:
            if self._browser is not None:
                self._browser.close()
        finally:
            if self._pw_cm is not None:
                self._pw_cm.__exit__(exc_type, exc, tb)
        self._browser = None
        self._playwright = None
        self._pw_cm = None
        self._stealth = None

    def new_context_page(self) -> tuple[BrowserContext, Page]:
        if self._browser is None:
            raise RuntimeError("BrowserEngine must be used as a context manager before new_context_page().")
        context = self._browser.new_context()
        page = context.new_page()
        return context, page

    @staticmethod
    def check_for_captcha(page: Page) -> tuple[bool, str | None]:
        """
        Heuristic scan for reCAPTCHA, hCaptcha, or Cloudflare Turnstile markers.

        Returns (detected, kind) where kind is a short label or None.
        """
        for kind, selector in _CAPTCHA_SELECTOR_GROUPS:
            try:
                loc = page.locator(selector)
                if loc.count() == 0:
                    continue
                first = loc.first
                try:
                    if first.is_visible(timeout=750):
                        return True, kind
                except Exception:
                    return True, kind
            except Exception:
                continue
        return False, None

    @staticmethod
    def attempt_automated_solve_stub(page: Page) -> bool:
        """
        Single bounded automated attempt (placeholder).

        Real solver hooks belong behind explicit operator config per captcha_handling_policy.md.
        This stub performs no interaction and always reports failure so we escalate to handoff.
        """
        _ = page
        logger.info("CAPTCHA stub solver: no-op (policy allows one attempt; escalating if still present).")
        return False

    def enforce_captcha_policy(
        self,
        page: Page,
        page_url: str,
        user_id: uuid.UUID,
    ) -> None:
        """
        If a CAPTCHA is present: one stub attempt; if still present, notify and raise CaptchaHandoffRequired.
        """
        from tunde_agent.services.notification_service import NotificationService
        from tunde_agent.tools.browser.exceptions import CaptchaHandoffRequired

        detected, kind = self.check_for_captcha(page)
        if not detected:
            return

        self.attempt_automated_solve_stub(page)
        try:
            page.wait_for_timeout(400)
        except Exception:
            pass

        still, kind2 = self.check_for_captcha(page)
        if still:
            NotificationService(user_id).notify_captcha_handoff(page_url, captcha_kind=kind or kind2)
            raise CaptchaHandoffRequired(page_url, kind=kind or kind2)
