"""
Telegram Bot API *MarkdownV2* helpers: escaping and structured mission reports.

https://core.telegram.org/bots/api#markdownv2-style
"""

from __future__ import annotations

import html as html_module
import re
from collections.abc import Sequence
from typing import Any, Final
from urllib.parse import urlparse

# Characters that must be escaped outside of intentional entities.
_MD_V2_SPECIAL: Final[frozenset[str]] = frozenset(
    r"_*[]()~`>#+-=|{}.!"
)

_INSIGHT_ICONS: Final[tuple[str, ...]] = ("🚀", "📊", "💡", "🎯", "📌")


def escape_markdown_v2(text: str) -> str:
    """Escape all MarkdownV2 special characters in plain user/model text."""
    if not text:
        return ""
    out: list[str] = []
    for ch in text:
        if ch == "\\" or ch in _MD_V2_SPECIAL:
            out.append("\\" + ch)
        else:
            out.append(ch)
    return "".join(out)


def escape_markdown_v2_url(url: str) -> str:
    """Escape URL for use inside ``[text](url)`` (``)`` and ``\\`` must be escaped)."""
    if not url:
        return ""
    return url.replace("\\", "\\\\").replace(")", "\\)")


def escape_inside_code_span(text: str) -> str:
    """Escape content placed between single backticks (inline code)."""
    if not text:
        return ""
    return text.replace("\\", "\\\\").replace("`", "\\`")


def md_v2_link(display_text: str, url: str) -> str:
    """Safe MarkdownV2 inline link."""
    return f"[{escape_markdown_v2(display_text)}]({escape_markdown_v2_url(url)})"


def md_v2_bold_literal(label: str) -> str:
    """
    Bold a string that may contain emoji/punctuation we treat as literal header text.

    The whole label is escaped so emojis stay; section titles like '📑 Executive Summary' are safe.
    """
    return f"*{escape_markdown_v2(label)}*"


def md_v2_inline_code(text: str) -> str:
    """Inline fixed-width; inner escapes backticks and backslashes."""
    return f"`{escape_inside_code_span(text)}`"


def truncate_markdown_v2_caption(text: str, max_len: int = 1024) -> str:
    """Telegram photo captions max 1024 chars."""
    if len(text) <= max_len:
        return text
    suffix = "\\.\\.\\."
    cut = max_len - len(suffix)
    if cut < 1:
        return suffix[:max_len]
    return text[:cut] + suffix


def format_telegram_report(
    topic: str,
    *,
    tagline: str | None = None,
    executive_summary: str,
    insights: Sequence[str],
    sources: Sequence[tuple[str, str]],
    technical_ids: Sequence[str] | None = None,
    media_url: str | None = None,
) -> str:
    """
    Build one MarkdownV2 message: blockquote header, bold section titles, icon bullets, links.

    ``sources`` items are ``(title, url)``. Optional ``media_url`` is appended as a source if missing.
    """
    topic = topic.strip()
    line_tag = (tagline or "").strip() or f"Research brief — {topic}"

    lines: list[str] = [
        f"> 🟢 {escape_markdown_v2(line_tag)}",
        f"> {escape_markdown_v2(f'Based on topic: {topic}')}",
        "",
        md_v2_bold_literal("📑 Executive Summary"),
    ]

    summary = executive_summary.strip()
    sentences = re.split(r"(?<=[.!?])\s+", summary)
    sentences = [s.strip() for s in sentences if s.strip()][:2]
    if not sentences and summary:
        sentences = [summary[:800] + ("…" if len(summary) > 800 else "")]
    if not sentences:
        sentences = ["No summary available."]
    for s in sentences:
        lines.append(f"> {escape_markdown_v2(s)}")

    cleaned = [str(i).strip() for i in insights if i and str(i).strip()]
    if not cleaned:
        cleaned = ["See executive summary above; page text had limited extractable points."]
    global_lines = [x for x in cleaned if x.startswith("🌍")]
    detail_lines = [x for x in cleaned if x not in global_lines]

    if global_lines:
        lines.extend(["", md_v2_bold_literal("🌍 Global perspectives")])
        for item in global_lines:
            lines.append(escape_markdown_v2(item))

    lines.extend(["", md_v2_bold_literal("🔍 Detailed insights")])
    if detail_lines:
        for i, item in enumerate(detail_lines):
            icon = _INSIGHT_ICONS[i % len(_INSIGHT_ICONS)]
            lines.append(f"{icon} {escape_markdown_v2(item)}")
    elif not global_lines:
        for i, item in enumerate(cleaned):
            icon = _INSIGHT_ICONS[i % len(_INSIGHT_ICONS)]
            lines.append(f"{icon} {escape_markdown_v2(item)}")
    else:
        lines.append(escape_markdown_v2("Further points are captured in the executive summary and sources."))

    merged_sources: list[tuple[str, str]] = []
    seen_urls: set[str] = set()
    for title, url in sources:
        u = (url or "").strip()
        if not u:
            continue
        key = u.rstrip("/").lower()
        if key in seen_urls:
            continue
        seen_urls.add(key)
        merged_sources.append((title.strip() or "Source", u))

    mu = (media_url or "").strip()
    if mu:
        key = mu.rstrip("/").lower()
        if key not in seen_urls:
            seen_urls.add(key)
            merged_sources.append(("Primary page / media", mu))

    lines.extend(["", md_v2_bold_literal("🔗 Sources")])
    if not merged_sources:
        lines.append(escape_markdown_v2("(No URLs listed — check mission final_url in logs.)"))
    else:
        for title, url in merged_sources:
            lines.append(md_v2_link(title, url))

    if technical_ids:
        ids = [str(x).strip() for x in technical_ids if x and str(x).strip()]
        if ids:
            lines.extend(["", md_v2_bold_literal("Technical")])
            lines.append(" · ".join(md_v2_inline_code(x) for x in ids))

    return "\n".join(lines)


def format_approval_photo_caption(
    topic: str,
    media_url: str,
    instruction_plain: str,
) -> str:
    """
    MarkdownV2 caption for ``sendPhoto`` with Approve/Deny (≤ 1024 chars).

    ``instruction_plain`` is user-facing prose; it is escaped. ``media_url`` becomes a hyperlink.
    """
    parts: list[str] = [
        md_v2_bold_literal(f"🟢 Snapshot — {topic.strip()[:120]}"),
    ]
    u = (media_url or "").strip()
    if u:
        parts.append(md_v2_link("Open page", u))
    parts.append("")
    parts.append(escape_markdown_v2(instruction_plain.strip()))
    return truncate_markdown_v2_caption("\n".join(parts), 1024)


# Telegram MarkdownV2 inline link (same shape as classic Markdown: ``[text](url)``).
TEASER_REPORT_CTA_LABEL = "Click here to view the Full Visual Analytics"


def telegram_inline_keyboard_url_allowed(url: str) -> bool:
    """
    Telegram rejects many non-public URLs in ``inline_keyboard`` ``url`` buttons (e.g. localhost).

    When this returns False, omit the inline button and keep the link as ``<a href>`` in HTML body text.
    """
    u = (url or "").strip()
    if not u:
        return False
    try:
        p = urlparse(u)
    except Exception:
        return False
    if p.scheme not in ("http", "https"):
        return False
    host = (p.hostname or "").lower()
    if not host:
        return False
    if host == "localhost":
        return False
    if host in ("127.0.0.1", "0.0.0.0", "::1"):
        return False
    if host.endswith(".localhost"):
        return False
    return True


def escape_telegram_html(text: str) -> str:
    """Escape ``&``, ``<``, ``>`` for Telegram ``parse_mode=HTML`` body text."""
    if not text:
        return ""
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def _telegram_rule_line() -> str:
    """Visual separator safe in Telegram HTML (monospace line)."""
    return "<code>━━━━━━━━━━━━━━━━━━━━</code>"


def _chart_metrics_ascii_block(chart_metrics: dict[str, Any] | None) -> str:
    """Compact text bar chart for Telegram HTML (inside <pre>)."""
    if not isinstance(chart_metrics, dict):
        return ""
    labels = chart_metrics.get("labels")
    values = chart_metrics.get("values")
    if not isinstance(labels, list) or not isinstance(values, list):
        return ""
    rows: list[str] = []
    nums: list[float] = []
    for v in values[:8]:
        try:
            if isinstance(v, (int, float)):
                nums.append(float(v))
            else:
                nums.append(float(str(v).replace(",", "").replace("%", "").strip()))
        except (TypeError, ValueError):
            return ""
    lbs = [str(x)[:14] for x in labels[: len(nums)]]
    if len(lbs) != len(nums) or len(nums) < 2:
        return ""
    mx = max(nums) or 1.0
    for lb, n in zip(lbs, nums):
        w = max(1, int((n / mx) * 12))
        line = f"{lb[:14]:14} {'▓' * w} {n:g}"
        rows.append(escape_telegram_html(line))
    inner = "\n".join(rows)
    return f"<b>Key series</b>\n<pre>{inner}</pre>"


def format_telegram_mission_teaser_html(
    topic: str,
    *,
    tagline: str | None,
    executive_summary: str,
    insights: Sequence[str],
    report_url: str | None,
    chart_metrics: dict[str, Any] | None = None,
    max_summary_chars: int = 420,
    max_bullets: int = 5,
) -> str:
    """
    Telegram HTML briefing: headings, separators, bullets, optional ASCII chart from metrics.

    The CTA is a real ``<a href=\"...\">`` link (reliable in clients; MarkdownV2 links are finicky).
    """
    lines: list[str] = []
    t = topic.strip()[:200]
    lines.append(f"<b>📌 {escape_telegram_html(t)}</b>")
    tl = (tagline or "").strip()
    if tl:
        lines.append(f"<i>{escape_telegram_html(tl[:240])}</i>")
    lines.append("")
    lines.append(_telegram_rule_line())
    lines.append("")
    lines.append("<b>Executive thesis</b>")
    es = (executive_summary or "").strip()
    if len(es) > max_summary_chars:
        cut = es[: max_summary_chars - 1]
        es = cut.rsplit(" ", 1)[0] + "…" if len(cut) > 80 else cut + "…"
    lines.append(f"<blockquote>{escape_telegram_html(es or 'See the visual report for the full narrative.')}</blockquote>")
    lines.append("")
    chart_block = _chart_metrics_ascii_block(chart_metrics)
    if chart_block:
        lines.append(chart_block)
        lines.append("")
        lines.append(_telegram_rule_line())
        lines.append("")
    lines.append("<b>Key signals</b>")
    bullets = [str(x).strip() for x in insights if x and str(x).strip()][:max_bullets]
    if not bullets:
        bullets = ["Charts, sources, and visuals are on the landing page."]
    for i, b in enumerate(bullets, 1):
        lines.append(f"{i}. {escape_telegram_html(b[:340])}")
    lines.append("")
    lines.append(_telegram_rule_line())
    lines.append("")
    lines.append("<b>Full visual analytics</b>")
    lines.append("")
    ru = (report_url or "").strip()
    if ru:
        href = html_module.escape(ru, quote=True)
        lines.append(
            f'<a href="{href}">{escape_telegram_html(TEASER_REPORT_CTA_LABEL)}</a>'
        )
        # Plain URL + monospace copy line — some Telegram clients stall on link previews; this opens reliably.
        lines.append(f"<code>{escape_telegram_html(ru)}</code>")
        if not telegram_inline_keyboard_url_allowed(ru):
            lines.append("")
            lines.append(
                "<i>"
                + escape_telegram_html(
                    "Tip: this report link points at a local or non-public URL — open it on the machine "
                    "running Tunde, or set TUNDE_PUBLIC_BASE_URL / REPORT_PUBLIC_BASE_URL to your HTTPS origin."
                )
                + "</i>"
            )
    else:
        lines.append(
            escape_telegram_html(
                "Interactive report could not be linked this run — check app logs or try again."
            )
        )
    return "\n".join(lines)


def tunde_sign_off_html() -> str:
    """HTML-mode closing line (italic body escaped)."""
    return (
        "\n\n— Tunde ✨\n<i>"
        + escape_telegram_html("Built for Visionaries by Wael Safan & NewFinity")
        + "</i>"
    )


def split_html_message(text: str, max_len: int = 4096) -> list[str]:
    """Split long HTML for Telegram ``sendMessage`` (same paragraph strategy as MarkdownV2)."""
    text = text.strip()
    if len(text) <= max_len:
        return [text]
    paras = [p.strip() for p in text.split("\n\n") if p.strip()]
    if not paras:
        return [text[i : i + max_len] for i in range(0, len(text), max_len)]
    chunks: list[str] = []
    buf = ""
    for p in paras:
        candidate = p if not buf else f"{buf}\n\n{p}"
        if len(candidate) <= max_len:
            buf = candidate
            continue
        if buf:
            chunks.append(buf)
        if len(p) <= max_len:
            buf = p
        else:
            for i in range(0, len(p), max_len):
                chunks.append(p[i : i + max_len])
            buf = ""
    if buf:
        chunks.append(buf)
    return [c for c in chunks if c]


def format_telegram_mission_teaser(
    topic: str,
    *,
    tagline: str | None,
    executive_summary: str,
    insights: Sequence[str],
    report_url: str | None,
    max_summary_chars: int = 420,
    max_bullets: int = 5,
) -> str:
    """
    Short Telegram briefing: tight summary, a few bullets, CTA to the full HTML report.

    The CTA uses a MarkdownV2 ``text_link`` entity: ``[label](url)`` with the label and URL
    escaped per https://core.telegram.org/bots/api#markdownv2-style (see ``md_v2_link``).
    Paragraph breaks (``\\n\\n``) before the CTA reduce split/parse edge cases in long messages.
    """
    lines: list[str] = []
    t = topic.strip()[:200]
    lines.append(md_v2_bold_literal(f"📌 {t}"))
    tl = (tagline or "").strip()
    if tl:
        lines.append(escape_markdown_v2(tl[:240]))
    lines.append("")
    lines.append(md_v2_bold_literal("TL;DR"))
    es = (executive_summary or "").strip()
    if len(es) > max_summary_chars:
        cut = es[: max_summary_chars - 1]
        es = cut.rsplit(" ", 1)[0] + "…" if len(cut) > 80 else cut + "…"
    lines.append(escape_markdown_v2(es or "See the visual report for the full narrative."))
    lines.append("")
    lines.append(md_v2_bold_literal("Highlights"))
    bullets = [str(x).strip() for x in insights if x and str(x).strip()][:max_bullets]
    if not bullets:
        bullets = ["Charts, sources, and visuals are on the landing page."]
    for b in bullets:
        lines.append("• " + escape_markdown_v2(b[:340]))
    lines.append("")
    lines.append(md_v2_bold_literal("Full visual analytics"))
    lines.append("")
    ru = (report_url or "").strip()
    if ru:
        # Plain ``[text](url)`` in MDV2; do not prefix emoji here — it can confuse entity boundaries.
        lines.append(md_v2_link(TEASER_REPORT_CTA_LABEL, ru))
    else:
        lines.append(
            escape_markdown_v2(
                "Interactive report could not be linked this run — check app logs or try again."
            )
        )
    return "\n".join(lines)


def tunde_sign_off_markdown_v2() -> str:
    """Closing line; italic body escaped."""
    return (
        "\n\n— Tunde ✨\n_"
        + escape_markdown_v2("Built for Visionaries by Wael Safan & NewFinity")
        + "_"
    )


def split_markdown_v2_message(text: str, max_len: int = 4096) -> list[str]:
    """
    Split long MarkdownV2 into Telegram-sized chunks, packing double-newline paragraphs first.
    """
    text = text.strip()
    if len(text) <= max_len:
        return [text]
    paras = [p.strip() for p in text.split("\n\n") if p.strip()]
    if not paras:
        return [text[i : i + max_len] for i in range(0, len(text), max_len)]
    chunks: list[str] = []
    buf = ""
    for p in paras:
        candidate = p if not buf else f"{buf}\n\n{p}"
        if len(candidate) <= max_len:
            buf = candidate
            continue
        if buf:
            chunks.append(buf)
        if len(p) <= max_len:
            buf = p
        else:
            for i in range(0, len(p), max_len):
                chunks.append(p[i : i + max_len])
            buf = ""
    if buf:
        chunks.append(buf)
    return [c for c in chunks if c]
