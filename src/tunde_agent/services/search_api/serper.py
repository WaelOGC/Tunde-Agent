"""Serper.dev Google SERP API."""

from __future__ import annotations

import logging

import httpx

from tunde_agent.config.settings import Settings
from tunde_agent.services.search_api.exceptions import SearchProviderError, SearchProviderRateLimited

logger = logging.getLogger(__name__)

_SERPER_URL = "https://google.serper.dev/search"


def serper_configured(settings: Settings) -> bool:
    return bool((getattr(settings, "serper_api_key", None) or "").strip())


def search_serper(
    query: str,
    settings: Settings,
    *,
    num: int,
    hl: str,
    gl: str,
) -> list[str]:
    api_key = (settings.serper_api_key or "").strip()
    if not api_key:
        raise SearchProviderError("Serper not configured", provider="Serper")

    payload: dict[str, object] = {
        "q": query.strip(),
        "num": max(1, min(int(num), 100)),
    }
    if hl:
        payload["hl"] = hl
    if gl:
        payload["gl"] = gl

    headers = {"X-API-KEY": api_key, "Content-Type": "application/json"}

    try:
        with httpx.Client(timeout=30.0) as client:
            r = client.post(_SERPER_URL, json=payload, headers=headers)
    except httpx.RequestError as exc:
        raise SearchProviderError(str(exc)[:300], provider="Serper") from exc

    if r.status_code in (429, 403):
        raise SearchProviderRateLimited(
            (r.text or r.reason_phrase)[:500],
            status_code=r.status_code,
            provider="Serper",
        )
    if r.status_code >= 400:
        body = (r.text or "")[:400]
        if _text_suggests_rate_limit(body, r.status_code):
            raise SearchProviderRateLimited(body, status_code=r.status_code, provider="Serper")
        raise SearchProviderError(f"HTTP {r.status_code}: {body}", status_code=r.status_code, provider="Serper")

    try:
        data = r.json()
    except Exception as exc:
        raise SearchProviderError(f"invalid JSON: {exc}", provider="Serper") from exc

    organic = data.get("organic")
    if not isinstance(organic, list):
        return []

    out: list[str] = []
    seen: set[str] = set()
    for row in organic:
        if not isinstance(row, dict):
            continue
        link = (row.get("link") or "").strip()
        if not link or link in seen:
            continue
        seen.add(link)
        out.append(link)
    return out


def _text_suggests_rate_limit(body: str, code: int) -> bool:
    low = body.lower()
    if code == 402:
        return True
    return any(x in low for x in ("rate", "quota", "limit", "exceeded", "too many"))
