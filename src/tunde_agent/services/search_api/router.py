"""
Ordered API rotation: Google CSE → Serper → Riley (skip unconfigured backends).

Falls back to an empty list when every provider fails (caller may use browser SERP).
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from dataclasses import dataclass
from typing import TYPE_CHECKING

from tunde_agent.services.search_api.exceptions import SearchProviderError, SearchProviderRateLimited
from tunde_agent.services.search_api.google_cse import google_cse_configured, search_google_cse
from tunde_agent.services.search_api.logging import log_search_api_event
from tunde_agent.services.search_api.riley import riley_configured, search_riley
from tunde_agent.services.search_api.serper import serper_configured, search_serper

if TYPE_CHECKING:
    from tunde_agent.config.settings import Settings

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class _Provider:
    id: str
    label: str
    configured: Callable[["Settings"], bool]


def _dispatch_search(
    prov_id: str,
    query: str,
    settings: "Settings",
    *,
    num: int,
    hl: str,
    gl: str,
) -> list[str]:
    """Resolve provider at call time so tests can patch ``search_google_cse`` / ``search_serper`` / etc."""
    if prov_id == "google_cse":
        return search_google_cse(query, settings, num=num, hl=hl, gl=gl)
    if prov_id == "serper":
        return search_serper(query, settings, num=num, hl=hl, gl=gl)
    if prov_id == "riley":
        return search_riley(query, settings, num=num, hl=hl, gl=gl)
    raise RuntimeError(f"unknown search provider: {prov_id}")


# User priority: start with Google (lower free-tier quota), then higher-capacity Serper, then Riley.
_CHAIN: tuple[_Provider, ...] = (
    _Provider("google_cse", "Google CSE", google_cse_configured),
    _Provider("serper", "Serper", serper_configured),
    _Provider("riley", "Riley", riley_configured),
)


def apis_configured_for_search(settings: Settings) -> bool:
    return any(p.configured(settings) for p in _CHAIN)


def api_search_urls(
    query: str,
    settings: Settings,
    *,
    num: int,
    hl: str = "en",
    gl: str = "us",
) -> list[str]:
    """
    Run ``query`` through the provider chain until one returns URLs or all fail.

    Rate limits / 403 / quota errors trigger rotation without surfacing to the end user.
    """
    q = (query or "").strip()
    if not q:
        return []

    active = [p for p in _CHAIN if p.configured(settings)]
    if not active:
        return []

    last_error: str | None = None
    for i, prov in enumerate(active):
        next_label = active[i + 1].label if i + 1 < len(active) else "browser fallback / exhausted"
        try:
            urls = _dispatch_search(prov.id, q, settings, num=num, hl=hl, gl=gl)
            if urls:
                if i > 0:
                    log_search_api_event(
                        provider=prov.label,
                        error_type="ok",
                        action=f"Succeeded after rotation (attempt {i + 1})",
                    )
                return urls
            log_search_api_event(
                provider=prov.label,
                error_type="empty_results",
                action=f"Switched to {next_label}",
            )
        except SearchProviderRateLimited as exc:
            last_error = f"rate_limited:{exc.status_code}"
            log_search_api_event(
                provider=prov.label,
                error_type=f"rate_limited HTTP {exc.status_code}",
                action=f"Switched to {next_label}",
            )
            logger.debug("Search provider rate limited: %s", prov.label, exc_info=True)
        except SearchProviderError as exc:
            last_error = str(exc)[:200]
            log_search_api_event(
                provider=prov.label,
                error_type=exc.__class__.__name__,
                action=f"Switched to {next_label}",
            )
            logger.debug("Search provider error: %s", prov.label, exc_info=True)

    if last_error:
        log_search_api_event(
            provider="search_api_chain",
            error_type=last_error or "all_failed",
            action="No URLs from API providers; caller may use browser SERP",
        )
    return []
