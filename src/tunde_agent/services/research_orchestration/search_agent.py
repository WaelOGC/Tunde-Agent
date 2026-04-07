"""
Search Agent: multilingual SERP discovery (parallel Google locale passes) + URL shortlist.
"""

from __future__ import annotations

import asyncio
import logging
import time
import uuid

from tunde_agent.config.settings import Settings, get_settings
from tunde_agent.services.search_api import api_search_urls, apis_configured_for_search
from tunde_agent.tools.browser.engine import assert_allowed_browse_url
from tunde_agent.tools.browser.google_search import (
    fetch_google_serp_links,
    fetch_google_serp_links_with_diag,
)

logger = logging.getLogger(__name__)

_MISSION_MAX_SOURCES = 5


def _compact_topic_for_serp(topic: str, *, max_words: int = 14) -> str:
    """Shorter query when the full mission prompt yields no organic links."""
    t = topic.strip()
    words = t.split()
    if len(words) <= max_words and len(t) <= 140:
        return t
    short = " ".join(words[:max_words]).strip()
    if len(short) > 160:
        short = short[:160].rsplit(" ", 1)[0]
    return short or t[:120]


def _norm_url_key(u: str) -> str:
    return u.split("#")[0].rstrip("/").lower()


def _topic_sensitive_locales(topic: str, output_language_key: str) -> list[tuple[str, str]] | None:
    """
    Pick a relevant third locale from the topic (e.g. tech → EN + Mandarin + JP/KR/AR/ES).

    Returns None to fall back to settings/default triplets.
    """
    low = topic.lower()
    ol = output_language_key.strip().lower()
    tech = any(
        k in low
        for k in (
            "tech",
            "software",
            "semiconductor",
            "chip",
            "battery",
            "electric vehicle",
            " ev ",
            "ai ",
            " artificial intelligence",
            "machine learning",
            "cloud",
            "startup",
        )
    )
    if tech:
        third: tuple[str, str]
        if ol.startswith("ar"):
            third = ("ar", "sa")
        elif ol.startswith("ko") or "korea" in low:
            third = ("ko", "kr")
        elif ol.startswith("ja") or "japan" in low:
            third = ("ja", "jp")
        elif ol.startswith("de"):
            third = ("de", "de")
        elif ol.startswith("fr"):
            third = ("fr", "fr")
        else:
            third = ("es", "mx")
        return [("en", "us"), ("zh-CN", "cn"), third]
    return None


def _search_locale_triplets(
    settings: Settings,
    output_language_override: str | None,
    topic_clean: str,
) -> list[tuple[str, str]]:
    raw = (settings.research_search_locales or "").strip()
    if raw:
        out: list[tuple[str, str]] = []
        for part in raw.split(","):
            part = part.strip()
            if not part or ":" not in part:
                continue
            hl, gl = part.split(":", 1)
            hl, gl = hl.strip(), gl.strip()
            if hl and gl:
                out.append((hl, gl))
        if len(out) >= 2:
            return out[:3]
    ol = (output_language_override or settings.research_output_language or "en").strip().lower()
    hinted = _topic_sensitive_locales(topic_clean, ol)
    if hinted:
        return hinted[:3]
    triple = [("en", "us"), ("zh-CN", "cn")]
    if ol.startswith("ar"):
        triple.append(("ar", "sa"))
    elif ol.startswith("fr"):
        triple.append(("fr", "fr"))
    elif ol.startswith("de"):
        triple.append(("de", "de"))
    else:
        triple.append(("es", "mx"))
    return triple[:3]


async def _fetch_serp_locale(
    topic: str,
    user_id: uuid.UUID,
    *,
    headless: bool,
    hl: str,
    gl: str,
    max_results: int,
) -> tuple[list[tuple[str, str, str]], bool]:
    urls, suspected = await asyncio.to_thread(
        fetch_google_serp_links_with_diag,
        topic,
        user_id,
        headless=headless,
        max_results=max_results,
        google_hl=hl,
        google_gl=gl,
    )
    return [(u, hl, gl) for u in urls], suspected


async def _parallel_multilingual_serp(
    topic_clean: str,
    user_id: uuid.UUID,
    *,
    headless: bool,
    settings: Settings,
    per_locale_cap: int,
    output_language_override: str | None,
) -> tuple[list[tuple[str, str, str]], bool]:
    locales = _search_locale_triplets(settings, output_language_override, topic_clean)
    sem = asyncio.Semaphore(3)

    async def _one(pair: tuple[str, str]) -> tuple[list[tuple[str, str, str]], bool]:
        hl, gl = pair
        async with sem:
            try:
                return await _fetch_serp_locale(
                    topic_clean,
                    user_id,
                    headless=headless,
                    hl=hl,
                    gl=gl,
                    max_results=per_locale_cap,
                )
            except Exception as exc:
                logger.warning("SERP locale hl=%s gl=%s failed: %s", hl, gl, exc)
                return [], False

    batches = await asyncio.gather(*[_one(p) for p in locales])
    merged: list[tuple[str, str, str]] = []
    seen: set[str] = set()
    any_suspected = False
    for batch, suspected in batches:
        any_suspected = any_suspected or suspected
        for u, hl, gl in batch:
            key = _norm_url_key(u)
            if key in seen:
                continue
            seen.add(key)
            merged.append((u, hl, gl))
    return merged, any_suspected


def _serp_strings_to_tagged(urls: list[str]) -> list[tuple[str, str, str]]:
    return [(u, "en", "us") for u in urls]


def _finalize_urls_and_multilingual_meta(
    priority_url: str | None,
    serp_tagged: list[tuple[str, str, str]],
    *,
    max_sources: int,
) -> tuple[list[str], list[dict[str, str]]]:
    """Ordered URLs plus ``multilingual_sources`` rows for the delivery payload."""
    seen: set[str] = set()
    out_urls: list[str] = []
    meta: list[dict[str, str]] = []

    if priority_url:
        u = priority_url.strip()
        assert_allowed_browse_url(u)
        out_urls.append(u)
        seen.add(_norm_url_key(u))
        meta.append({"url": u, "search_locale": "", "role": "user_priority"})

    for u, hl, gl in serp_tagged:
        key = _norm_url_key(u)
        if key in seen:
            continue
        out_urls.append(u)
        seen.add(key)
        meta.append({"url": u, "search_locale": f"{hl}/{gl}", "role": "serp"})
        if len(out_urls) >= max_sources:
            break

    return out_urls, meta


def discover_source_urls(
    user_id: uuid.UUID,
    topic: str,
    priority_url: str | None,
    *,
    headless: bool,
    max_sources: int = _MISSION_MAX_SOURCES,
    serp_pool: int = 14,
    settings: Settings | None = None,
    output_language_override: str | None = None,
) -> tuple[list[str], list[dict[str, str]], str | None]:
    """
    Return ``(urls, multilingual_sources, search_block_hint)``.

    ``search_block_hint`` is ``\"captcha_block\"`` when no URLs were found and SERP pages looked
    like CAPTCHA / rate-limit / consent (so the mission can show a specific Telegram message).

    ``multilingual_sources`` rows: ``url``, ``search_locale`` (``hl/gl`` or empty for user priority),
    ``role`` (``serp`` | ``user_priority``).
    """
    settings = settings or get_settings()
    topic_clean = topic.strip()

    per_locale = max(6, min(serp_pool, 12))

    serp_tagged: list[tuple[str, str, str]] = []
    captcha_guess = False

    if apis_configured_for_search(settings):
        api_urls = api_search_urls(
            topic_clean,
            settings,
            num=min(max(serp_pool, 8), 20),
            hl="en",
            gl="us",
        )
        if api_urls:
            serp_tagged = [(u, "en", "us") for u in api_urls[:serp_pool]]
            logger.info(
                "SERP: using HTTP API results count=%s (browser SERP skipped for this mission pass)",
                len(serp_tagged),
            )

    def _run_parallel(t: str) -> tuple[list[tuple[str, str, str]], bool]:
        try:
            return asyncio.run(
                _parallel_multilingual_serp(
                    t,
                    user_id,
                    headless=headless,
                    settings=settings,
                    per_locale_cap=per_locale,
                    output_language_override=output_language_override,
                )
            )
        except RuntimeError:
            urls, suspected = fetch_google_serp_links_with_diag(
                t,
                user_id,
                headless=headless,
                max_results=serp_pool,
            )
            return _serp_strings_to_tagged(urls), suspected

    if not serp_tagged:
        serp_tagged, captcha_guess = _run_parallel(topic_clean)

    if not serp_tagged and captcha_guess:
        logger.info(
            "SERP empty with captcha/block signals; retrying multilingual search once after delay topic=%r",
            topic_clean[:80],
        )
        time.sleep(3.0)
        serp_tagged, again = _run_parallel(topic_clean)
        captcha_guess = captcha_guess and again

    if not serp_tagged:
        compact = _compact_topic_for_serp(topic_clean)
        if compact != topic_clean:
            serp_tagged, cg2 = _run_parallel(compact)
            captcha_guess = captcha_guess or cg2

    if not serp_tagged:
        urls, suspected = fetch_google_serp_links_with_diag(
            topic_clean,
            user_id,
            headless=headless,
            max_results=serp_pool,
        )
        serp_tagged = _serp_strings_to_tagged(urls)
        captcha_guess = captcha_guess or suspected

    urls_out, meta = _finalize_urls_and_multilingual_meta(
        priority_url,
        serp_tagged,
        max_sources=max_sources,
    )
    block_hint: str | None = None
    if not urls_out and captcha_guess and not (priority_url or "").strip():
        block_hint = "captcha_block"
    return urls_out, meta, block_hint
