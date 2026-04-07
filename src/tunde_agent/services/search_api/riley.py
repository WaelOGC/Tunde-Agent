"""
Configurable HTTP search backend (``Riley`` or any compatible JSON API).

Requires ``RILEY_SEARCH_API_URL`` (POST endpoint) and ``RILEY_API_KEY``.
Response parsing accepts common shapes: ``organic`` / ``results`` / ``data`` lists with ``link`` or ``url``.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

from tunde_agent.config.settings import Settings
from tunde_agent.services.search_api.exceptions import SearchProviderError, SearchProviderRateLimited

logger = logging.getLogger(__name__)


def riley_configured(settings: Settings) -> bool:
    key = (getattr(settings, "riley_api_key", None) or "").strip()
    url = (getattr(settings, "riley_search_api_url", None) or "").strip()
    return bool(key and url)


def search_riley(
    query: str,
    settings: Settings,
    *,
    num: int,
    hl: str,
    gl: str,
) -> list[str]:
    api_key = (settings.riley_api_key or "").strip()
    endpoint = (settings.riley_search_api_url or "").strip()
    if not api_key or not endpoint:
        raise SearchProviderError("Riley-compatible API not configured", provider="Riley")

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
    }
    body: dict[str, Any] = {
        "q": query.strip(),
        "query": query.strip(),
        "num": max(1, min(int(num), 50)),
    }
    if hl:
        body["hl"] = hl
    if gl:
        body["gl"] = gl

    try:
        with httpx.Client(timeout=30.0) as client:
            r = client.post(endpoint, json=body, headers=headers)
            if r.status_code == 401:
                r = client.post(
                    endpoint,
                    json=body,
                    headers={"Content-Type": "application/json", "X-API-KEY": api_key},
                )
    except httpx.RequestError as exc:
        raise SearchProviderError(str(exc)[:300], provider="Riley") from exc

    if r.status_code in (429, 403):
        raise SearchProviderRateLimited(
            (r.text or r.reason_phrase)[:500],
            status_code=r.status_code,
            provider="Riley",
        )
    if r.status_code >= 400:
        body_txt = (r.text or "")[:400]
        if r.status_code == 402 or _rl(body_txt):
            raise SearchProviderRateLimited(body_txt, status_code=r.status_code, provider="Riley")
        raise SearchProviderError(
            f"HTTP {r.status_code}: {body_txt}",
            status_code=r.status_code,
            provider="Riley",
        )

    try:
        data = r.json()
    except Exception as exc:
        raise SearchProviderError(f"invalid JSON: {exc}", provider="Riley") from exc

    urls = _extract_urls_from_json(data)
    return urls


def _rl(t: str) -> bool:
    low = t.lower()
    return any(x in low for x in ("rate", "quota", "limit", "exceeded"))


def _extract_urls_from_json(data: object) -> list[str]:
    if isinstance(data, list):
        return _urls_from_list(data)

    if not isinstance(data, dict):
        return []

    for key in ("organic", "results", "data", "items", "links"):
        block = data.get(key)
        if isinstance(block, list):
            found = _urls_from_list(block)
            if found:
                return found

    # Single object with url
    for k in ("url", "link"):
        v = data.get(k)
        if isinstance(v, str) and v.startswith("http"):
            return [v.strip()]
    return []


def _urls_from_list(rows: list[Any]) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for row in rows:
        if isinstance(row, str) and row.startswith("http"):
            u = row.strip()
            if u not in seen:
                seen.add(u)
                out.append(u)
        elif isinstance(row, dict):
            for k in ("link", "url", "href"):
                v = row.get(k)
                if isinstance(v, str) and v.startswith("http"):
                    u = v.strip()
                    if u not in seen:
                        seen.add(u)
                        out.append(u)
                    break
    return out
