"""
Extraction Agent: visit URLs and return page text (browser; sync, run via asyncio.to_thread).
"""

from __future__ import annotations

import logging
import uuid

from tunde_agent.tools.browser.exceptions import CaptchaHandoffRequired
from tunde_agent.tools.browser.research_tool import research_browse

logger = logging.getLogger(__name__)


def fetch_page_text(
    url: str,
    user_id: uuid.UUID,
    *,
    headless: bool,
    include_screenshot: bool,
) -> dict[str, object] | None:
    """Return browse dict or None if CAPTCHA/disallowed URL."""
    try:
        return research_browse(
            url,
            user_id,
            headless=headless,
            screenshot_full_page=False,
            include_screenshot_bytes=include_screenshot,
        )
    except CaptchaHandoffRequired as exc:
        logger.warning("Extraction skip CAPTCHA url=%s", getattr(exc, "url", url)[:120])
        return None
    except ValueError as exc:
        logger.warning("Extraction skip invalid URL %s: %s", url[:120], exc)
        return None
    except Exception as exc:
        logger.warning("Extraction failed url=%s err=%s", url[:120], exc, exc_info=True)
        return None
