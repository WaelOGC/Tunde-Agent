"""Google Programmable Search Engine (Custom Search JSON API)."""

from __future__ import annotations

import logging
from typing import Any
from urllib.parse import urlencode

import httpx

from tunde_agent.config.settings import Settings
from tunde_agent.services.search_api.exceptions import SearchProviderError, SearchProviderRateLimited

logger = logging.getLogger(__name__)

_CSE_URL = "https://www.googleapis.com/customsearch/v1"


def google_cse_configured(settings: Settings) -> bool:
    key = (getattr(settings, "google_search_api_key", None) or "").strip()
    cx = (getattr(settings, "google_custom_search_cx", None) or "").strip()
    return bool(key and cx)


def search_google_cse(
    query: str,
    settings: Settings,
    *,
    num: int,
    hl: str,
    gl: str,
) -> list[str]:
    key = (settings.google_search_api_key or "").strip()
    cx = (settings.google_custom_search_cx or "").strip()
    if not key or not cx:
        raise SearchProviderError("Google CSE not configured", provider="Google CSE")

    n = max(1, min(int(num), 10))
    params: dict[str, Any] = {
        "key": key,
        "cx": cx,
        "q": query.strip(),
        "num": n,
    }
    if hl:
        params["hl"] = hl
    if gl:
        params["gl"] = gl

    url = f"{_CSE_URL}?{urlencode(params)}"
    try:
        with httpx.Client(timeout=30.0) as client:
            r = client.get(url)
    except httpx.RequestError as exc:
        raise SearchProviderError(str(exc)[:300], provider="Google CSE") from exc

    if r.status_code == 429 or r.status_code == 403:
        raise SearchProviderRateLimited(
            r.text[:500] if r.text else r.reason_phrase,
            status_code=r.status_code,
            provider="Google CSE",
        )
    if r.status_code == 402:
        raise SearchProviderRateLimited(
            "quota or billing",
            status_code=r.status_code,
            provider="Google CSE",
        )
    if r.status_code >= 400:
        body = (r.text or "")[:400]
        if _body_suggests_quota(body):
            raise SearchProviderRateLimited(body, status_code=r.status_code, provider="Google CSE")
        raise SearchProviderError(f"HTTP {r.status_code}: {body}", status_code=r.status_code, provider="Google CSE")

    try:
        data = r.json()
    except Exception as exc:
        raise SearchProviderError(f"invalid JSON: {exc}", provider="Google CSE") from exc

    items = data.get("items")
    if not isinstance(items, list):
        return []

    out: list[str] = []
    seen: set[str] = set()
    for it in items:
        if not isinstance(it, dict):
            continue
        link = (it.get("link") or "").strip()
        if not link or link in seen:
            continue
        seen.add(link)
        out.append(link)
    return out


def _body_suggests_quota(body: str) -> bool:
    low = body.lower()
    return any(
        x in low
        for x in (
            "quota",
            "rate limit",
            "ratelimit",
            "too many requests",
            "daily limit",
            "exceeded",
        )
    )
