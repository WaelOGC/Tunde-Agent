"""
Extract organic result URLs from search SERPs (Playwright + BeautifulSoup).

Google’s DOM changes often; we use layered selectors, realistic browser context, and DuckDuckGo HTML fallback.
"""

from __future__ import annotations

import hashlib
import json
import logging
import re
import uuid
from urllib.parse import parse_qs, quote, quote_plus, unquote, urlparse

from bs4 import BeautifulSoup

from tunde_agent.db.session import db_session
from tunde_agent.models.audit_log import AuditLog
from tunde_agent.tools.browser.engine import BrowserEngine
from tunde_agent.tools.browser.exceptions import CaptchaHandoffRequired

logger = logging.getLogger(__name__)

# Recent desktop Chrome variants — rotate per SERP attempt to reduce simple rate fingerprints.
CHROME_WINDOWS_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/131.0.0.0 Safari/537.36"
)
_SERP_USER_AGENTS: tuple[str, ...] = (
    CHROME_WINDOWS_USER_AGENT,
    (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0"
    ),
    (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/131.0.0.0 Safari/537.36"
    ),
)

_SERP_VIEWPORT = {"width": 1920, "height": 1080}

_SERP_EXTRA_HEADERS: dict[str, str] = {
    "Accept-Language": "en-US,en;q=0.9",
    "Accept": (
        "text/html,application/xhtml+xml,application/xml;q=0.9,"
        "image/avif,image/webp,image/apng,*/*;q=0.8"
    ),
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
}

_SKIP_HOST_SUBSTRINGS: tuple[str, ...] = (
    "google.",
    "gstatic.",
    "googleusercontent.",
    "youtube.com",
    "gmail.com",
    "blogger.com",
    "webcache.googleusercontent",
    "doubleclick.net",
    "googleadservices",
    "googleads.",
    "duckduckgo.com",
    "bing.com/aclick",
)

# Resolved targets that are ad / tracking bridges (DDG wraps ads in y.js).
_JUNK_TARGET_SUBSTRINGS: tuple[str, ...] = (
    "duckduckgo.com/y.js",
    "bing.com/aclick",
    "doubleclick.net",
    "googleadservices",
)

_DIAGNOSTIC_SNIPPET_CHARS = 12_000


def _serp_browser_context(engine: BrowserEngine, *, user_agent: str | None = None) -> tuple[object, object]:
    """Desktop-like Chromium context for search pages."""
    ua = (user_agent or CHROME_WINDOWS_USER_AGENT).strip() or CHROME_WINDOWS_USER_AGENT
    return engine.new_context_page(
        user_agent=ua,
        locale="en-US",
        viewport=_SERP_VIEWPORT,
        extra_http_headers=_SERP_EXTRA_HEADERS,
    )


def _ua_for_serp_attempt(query: str, attempt_index: int) -> str:
    """Stable-but-varied UA per query + attempt to spread fingerprints."""
    h = int(hashlib.sha256(f"{query}:{attempt_index}".encode()).hexdigest()[:8], 16)
    return _SERP_USER_AGENTS[h % len(_SERP_USER_AGENTS)]


def _compact_serp_query(query: str) -> str:
    """Shorter query for a second pass when long prompts yield consent-only pages."""
    q = query.strip()
    if len(q) <= 96:
        return q
    words = q.split()
    if len(words) > 14:
        q = " ".join(words[:14])
    if len(q) > 140:
        q = q[:140].rsplit(" ", 1)[0]
    return q.strip() or query.strip()[:80]


def _is_junk_target_url(url: str) -> bool:
    low = url.lower()
    return any(s in low for s in _JUNK_TARGET_SUBSTRINGS)


def normalize_serp_anchor_href(href: str) -> str | None:
    """
    Turn SERP anchor hrefs into a real destination URL.

    Handles protocol-relative URLs, Google ``/url?q=``, and DuckDuckGo ``/l/?uddg=`` redirects.
    """
    raw = (href or "").strip()
    if not raw or raw.startswith("#") or raw.lower().startswith("javascript:"):
        return None
    if raw.startswith("//"):
        raw = "https:" + raw
    if not raw.startswith("http"):
        if raw.startswith("/url?"):
            pass
        else:
            return None

    if "duckduckgo.com" in raw.lower() and "uddg=" in raw:
        parsed = urlparse(raw)
        qs = parse_qs(parsed.query)
        inner = (qs.get("uddg") or [None])[0]
        if not inner:
            return None
        out = unquote(inner)
        if _is_junk_target_url(out):
            return None
        if out.startswith("//"):
            out = "https:" + out
        return out if out.startswith("http") else None

    return _href_to_http_url(raw)


def _href_to_http_url(href: str) -> str | None:
    """Normalize Google `/url?q=`, `https://www.google.com/url?...`, or plain https links."""
    href = (href or "").strip()
    if not href or href.startswith("#") or href.lower().startswith("javascript:"):
        return None
    if href.startswith("//"):
        href = "https:" + href
    if href.startswith("/url?"):
        q = urlparse(href).query
        params = parse_qs(q)
        target = (params.get("q") or [None])[0]
        return unquote(target) if target else None
    low = href.lower()
    if "google.com/url?" in low or "google.co.uk/url?" in low:
        q = urlparse(href).query
        params = parse_qs(q)
        target = (params.get("q") or [None])[0]
        return unquote(target) if target else None
    if href.startswith(("http://", "https://")):
        return href
    return None


def _url_is_candidate(href: str) -> bool:
    if not href or not href.startswith(("http://", "https://")):
        return False
    low = href.lower()
    for frag in _SKIP_HOST_SUBSTRINGS:
        if frag in low:
            return False
    if "google.com/search" in low or "/search?q=" in low:
        return False
    return True


def _consume_href(href: str, found: list[str], seen: set[str], max_results: int) -> bool:
    """Append if new candidate; return True if max_results reached."""
    real = normalize_serp_anchor_href(href)
    if not real or not _url_is_candidate(real) or _is_junk_target_url(real):
        return len(found) >= max_results
    key = real.split("#")[0].rstrip("/").lower()
    if key in seen:
        return len(found) >= max_results
    seen.add(key)
    found.append(real.split("#")[0])
    return len(found) >= max_results


def _serp_empty_hints(html: str) -> list[str]:
    """Classify empty-parse SERP HTML (shared by logging and captcha/consent detection)."""
    if not html:
        return []
    low = html.lower()
    hints: list[str] = []
    if "unusual traffic" in low or "detected unusual traffic" in low:
        hints.append("possible_google_rate_limit")
    if "captcha" in low or "recaptcha" in low:
        hints.append("captcha_mention_in_html")
    if (
        "before you continue" in low
        or "consent.google.com" in low
        or "voordat je verdergaat" in low  # nl consent
        or "before you continue to google" in low
    ):
        hints.append("possible_consent_interstitial")
    if "enable javascript" in low or "noscript" in low[:3000]:
        hints.append("noscript_or_js_required")
    return hints


def serp_html_suggests_blocked_search(html: str) -> bool:
    """Heuristic: empty SERP parse may be due to CAPTCHA, rate limit, or consent wall."""
    if not html:
        return False
    hints = _serp_empty_hints(html)
    return bool(
        set(hints).intersection(
            {
                "captcha_mention_in_html",
                "possible_google_rate_limit",
                "possible_consent_interstitial",
            }
        )
    )


def _log_empty_serp_diagnostic(html: str, source_label: str) -> None:
    """When no links parse out, log hints (captcha/consent/blocked) and a HTML snippet at DEBUG."""
    if not html:
        logger.warning("SERP empty HTML source=%s", source_label)
        return
    hints = _serp_empty_hints(html)
    title_m = re.search(r"<title[^>]*>([^<]{0,200})", html, re.I)
    title = title_m.group(1).strip() if title_m else ""
    snippet = html[:_DIAGNOSTIC_SNIPPET_CHARS]
    logger.warning(
        "SERP parsed zero result URLs source=%s html_len=%s title=%r hints=%s",
        source_label,
        len(html),
        title[:200],
        hints or ["no_known_patterns"],
    )
    logger.debug("SERP diagnostic HTML snippet source=%s:\n%s", source_label, snippet)


def extract_google_result_urls(html: str, *, max_results: int = 8) -> list[str]:
    """
    Parse Google SERP HTML using result-oriented selectors first, then a global fallback.

    Targets ``#rso``, ``div.g``, and ``a[data-ved]`` style markup used on desktop results.
    """
    soup = BeautifulSoup(html, "html.parser")
    found: list[str] = []
    seen: set[str] = set()

    # Prefer main results column to reduce noise from header/footer links.
    priority_selectors = (
        "#rso a[href][data-ved]",
        "#rso div.g a[href]",
        "#rso a[href]",
        "div[data-hveid] a[href][data-ved]",
        "div.g a[href]",
        "a[href][data-ved]",
        "#search div.g a[href]",
        "#center_col a[href]",
    )

    for sel in priority_selectors:
        try:
            for a in soup.select(sel):
                if _consume_href(a.get("href") or "", found, seen, max_results):
                    return found
        except Exception:
            continue

    # Links that only appear as /url?q= without data-ved in some layouts
    for a in soup.select("#rso a[href^='/url'], #search a[href^='/url']"):
        if _consume_href(a.get("href") or "", found, seen, max_results):
            return found

    for a in soup.select("a[href]"):
        if _consume_href(a.get("href") or "", found, seen, max_results):
            return found

    return found


def extract_duckduckgo_html_urls(html: str, *, max_results: int = 8) -> list[str]:
    """
    Parse DuckDuckGo HTML endpoint.

    Organic rows use ``.web-result``; titles are ``a.result__a`` with
    ``href="//duckduckgo.com/l/?uddg=https%3A%2F%2Freal-site..."`` — those must be unwrapped.
    """
    soup = BeautifulSoup(html, "html.parser")
    found: list[str] = []
    seen: set[str] = set()

    # Organic only first (skip ``result--ad`` blocks).
    for a in soup.select("div.web-result a.result__a[href]"):
        if _consume_href(a.get("href") or "", found, seen, max_results):
            return found

    for a in soup.select("div.result:not(.result--ad) a.result__a[href]"):
        if _consume_href(a.get("href") or "", found, seen, max_results):
            return found

    for sel in (
        "#links a.result__a[href]",
        "a.result__a[href]",
        ".links_main a.result__url[href]",
    ):
        for a in soup.select(sel):
            if _consume_href(a.get("href") or "", found, seen, max_results):
                return found
    return found


def extract_bing_result_urls(html: str, *, max_results: int = 8) -> list[str]:
    """Parse Bing web results (``li.b_algo h2 a`` and fallbacks)."""
    soup = BeautifulSoup(html, "html.parser")
    found: list[str] = []
    seen: set[str] = set()
    for sel in (
        "li.b_algo h2 a[href]",
        ".b_algoheader a[href]",
        "h2.b_algo_title a[href]",
    ):
        for a in soup.select(sel):
            if _consume_href(a.get("href") or "", found, seen, max_results):
                return found
    return found


def _dismiss_google_consent(page: object) -> None:
    """
    Dismiss Google consent / GDPR interstitials in main document and embedded frames.

    Tries visible buttons by text (multilingual) and role, with a few retries for slow iframe loads.
    """
    selectors = (
        'button:has-text("Accept all")',
        'button:has-text("I agree")',
        'button:has-text("Accept All")',
        'div[role="button"]:has-text("Accept all")',
        'button:has-text("Aceptar todo")',
        'button:has-text("Tout accepter")',
        'button:has-text("Alles accepteren")',
        'button:has-text("Accepteren")',
        'button:has-text("Alle akzeptieren")',
        'button:has-text("Zustimmen")',
        'button:has-text("同意")',
        'button:has-text("接受全部")',
        'button:has-text("全部同意")',
        'button:has-text("同意并继续")',
        'button:has-text("继续使用")',
        'form[action*="consent"] button[type="submit"]',
        'form[action*="consent"] button',
        '[aria-label*="Accept all" i]',
        "#L2AGLb",
    )
    name_res = (
        re.compile(r"accept\s+all", re.I),
        re.compile(r"^i\s+agree$", re.I),
        re.compile(r"aceptar\s+todo", re.I),
        re.compile(r"^同意$", re.I),
        re.compile(r"接受全部|全部同意", re.I),
    )
    for _ in range(5):
        frames: list = []
        try:
            frames = [page.main_frame] + [f for f in page.frames if f is not page.main_frame]
        except Exception:
            frames = [page.main_frame]
        clicked = False
        for fr in frames:
            for sel in selectors:
                try:
                    loc = fr.locator(sel).first
                    if loc.count() == 0:
                        continue
                    if loc.is_visible(timeout=700):
                        loc.click(timeout=4500)
                        page.wait_for_timeout(1000)
                        clicked = True
                        break
                except Exception:
                    continue
            if clicked:
                break
            for pat in name_res:
                try:
                    btn = fr.get_by_role("button", name=pat)
                    if btn.count() == 0:
                        continue
                    b0 = btn.first
                    if b0.is_visible(timeout=600):
                        b0.click(timeout=4500)
                        page.wait_for_timeout(1000)
                        clicked = True
                        break
                except Exception:
                    continue
            if clicked:
                break
        if not clicked:
            break


def _google_search_urls(query: str, *, hl: str = "en", gl: str = "us") -> list[str]:
    q = quote_plus(query.strip())
    hl_q = quote((hl or "en").strip(), safe="-")
    gl_q = quote((gl or "us").strip(), safe="-")
    return [
        f"https://www.google.com/search?q={q}&num=15&hl={hl_q}&gl={gl_q}&pws=0",
        f"https://www.google.com/search?q={q}&num=10&hl={hl_q}&gl={gl_q}&safe=off",
        f"https://www.google.com/search?q={q}&num=10&hl={hl_q}&source=hp&ei=&gbv=1",
    ]


def _duckduckgo_html_url(query: str) -> str:
    return f"https://html.duckduckgo.com/html/?q={quote_plus(query.strip())}"


def _bing_search_url(query: str) -> str:
    return f"https://www.bing.com/search?q={quote_plus(query.strip())}&setlang=en-us&mkt=en-US"


def _dismiss_bing_consent(page: object) -> None:
    for sel in (
        "#bnp_btn_accept",
        'button:has-text("Accept")',
        'a:has-text("Accept")',
    ):
        try:
            loc = page.locator(sel).first
            if loc.is_visible(timeout=700):
                loc.click(timeout=2000)
                page.wait_for_timeout(600)
                break
        except Exception:
            continue


def fetch_google_serp_links_with_diag(
    query: str,
    user_id: uuid.UUID,
    *,
    headless: bool = True,
    max_results: int = 8,
    navigation_timeout_ms: int = 45_000,
    google_hl: str | None = None,
    google_gl: str | None = None,
    _recurse_shorten: bool = True,
) -> tuple[list[str], bool]:
    """
    Like ``fetch_google_serp_links`` but also returns whether an **empty** result likely reflects
    CAPTCHA / rate-limit / consent (so callers can retry or message the user).
    """
    q = query.strip()
    if not q:
        return [], False

    with db_session(user_id) as session:
        session.add(
            AuditLog(
                user_id=user_id,
                action_type="browser_navigate",
                details=json.dumps(
                    {"phase": "google_serp_start", "tool": "fetch_google_serp_links", "query": q[:200]},
                    separators=(",", ":"),
                ),
            )
        )

    hl = (google_hl or "en").strip() or "en"
    gl = (google_gl or "us").strip() or "us"

    urls: list[str] = []
    saw_blocked_signal = False
    strategies: list[tuple[str, str, str]] = []  # (label, url, family)
    for gurl in _google_search_urls(q, hl=hl, gl=gl):
        strategies.append(("google", gurl, "google"))
    strategies.append(("duckduckgo_html", _duckduckgo_html_url(q), "ddg"))
    strategies.append(("bing", _bing_search_url(q), "bing"))

    with BrowserEngine(headless=headless) as engine:
        for attempt_i, (label, target_url, family) in enumerate(strategies):
            ua = _ua_for_serp_attempt(q, attempt_i)
            context, page = _serp_browser_context(engine, user_agent=ua)
            try:
                page.set_default_timeout(navigation_timeout_ms)
                page.goto(target_url, wait_until="domcontentloaded", timeout=navigation_timeout_ms)
                if family == "google":
                    try:
                        engine.enforce_captcha_policy(page, page.url, user_id)
                    except CaptchaHandoffRequired as exc:
                        saw_blocked_signal = True
                        logger.warning(
                            "Google SERP CAPTCHA handoff; trying next strategy (%s): %s",
                            label,
                            exc,
                        )
                        try:
                            _log_empty_serp_diagnostic(page.content(), f"{label}_captcha")
                        except Exception:
                            pass
                        continue
                    _dismiss_google_consent(page)
                    try:
                        page.wait_for_timeout(1600)
                    except Exception:
                        pass
                    # Second consent pass after partial render
                    _dismiss_google_consent(page)
                elif family == "bing":
                    _dismiss_bing_consent(page)
                    try:
                        page.wait_for_timeout(1400)
                    except Exception:
                        pass
                    _dismiss_bing_consent(page)
                elif family == "ddg":
                    try:
                        page.wait_for_selector("#links .web-result, #links a.result__a", timeout=12_000)
                    except Exception:
                        pass
                    try:
                        page.wait_for_timeout(800)
                    except Exception:
                        pass
                else:
                    try:
                        page.wait_for_timeout(1200)
                    except Exception:
                        pass

                html = page.content()
                if family == "google":
                    candidate = extract_google_result_urls(html, max_results=max_results)
                elif family == "bing":
                    candidate = extract_bing_result_urls(html, max_results=max_results)
                else:
                    candidate = extract_duckduckgo_html_urls(html, max_results=max_results)

                if candidate:
                    urls = candidate
                    logger.info(
                        "SERP success strategy=%s label=%s count=%s query=%r",
                        family,
                        label,
                        len(urls),
                        q[:80],
                    )
                    break

                _log_empty_serp_diagnostic(html, f"{label}:{target_url[:100]}")
                if serp_html_suggests_blocked_search(html):
                    saw_blocked_signal = True
            except Exception as exc:
                logger.warning(
                    "SERP strategy failed label=%s url=%s err=%s",
                    label,
                    target_url[:120],
                    exc,
                )
            finally:
                context.close()

    if not urls and _recurse_shorten and len(q) > 88:
        short = _compact_serp_query(q)
        if short and short != q:
            u2, b2 = fetch_google_serp_links_with_diag(
                short,
                user_id,
                headless=headless,
                max_results=max_results,
                navigation_timeout_ms=navigation_timeout_ms,
                google_hl=google_hl,
                google_gl=google_gl,
                _recurse_shorten=False,
            )
            return u2, b2 or saw_blocked_signal

    with db_session(user_id) as session:
        session.add(
            AuditLog(
                user_id=user_id,
                action_type="browser_navigate",
                details=json.dumps(
                    {
                        "phase": "google_serp_complete",
                        "tool": "fetch_google_serp_links",
                        "query": q[:200],
                        "url_count": len(urls),
                        "urls": [u[:500] for u in urls[:10]],
                        "suspected_search_block": bool(not urls and saw_blocked_signal),
                    },
                    separators=(",", ":"),
                ),
            )
        )

    return urls, bool(not urls and saw_blocked_signal)


def fetch_google_serp_links(
    query: str,
    user_id: uuid.UUID,
    *,
    headless: bool = True,
    max_results: int = 8,
    navigation_timeout_ms: int = 45_000,
    google_hl: str | None = None,
    google_gl: str | None = None,
    _recurse_shorten: bool = True,
) -> list[str]:
    """
    Resolve organic-style result URLs: Google (several URL variants) then DuckDuckGo HTML backup.

    Uses a real Chrome-on-Windows user agent and desktop viewport on a dedicated context.
    """
    return fetch_google_serp_links_with_diag(
        query,
        user_id,
        headless=headless,
        max_results=max_results,
        navigation_timeout_ms=navigation_timeout_ms,
        google_hl=google_hl,
        google_gl=google_gl,
        _recurse_shorten=_recurse_shorten,
    )[0]
