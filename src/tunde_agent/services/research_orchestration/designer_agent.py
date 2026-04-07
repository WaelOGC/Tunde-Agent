"""
Designer Agent: QuickChart.io charts with data-driven type selection (Chart.js config).

Chooses among bar, grouped bar, line/area, radar, and doughnut based on analyst hints and data shape.
"""

from __future__ import annotations

import hashlib
import io
import json
import logging
import re
import urllib.parse
from typing import Any

import httpx

logger = logging.getLogger(__name__)

_QUICKCHART = "https://quickchart.io/chart"
_CHROME_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)

_TIME_HINT = re.compile(
    r"\b(20\d{2}|q[1-4]|fy\s*\d{2}|h[12]|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b",
    re.I,
)
_DATEISH = re.compile(r"\d{4}[-/]\d{1,2}")


def _topic_theme_hue(topic: str) -> int:
    """Align chart gradients with landing-page ``theme_hue_from_topic`` (same hash)."""
    return int(hashlib.sha256(topic.encode("utf-8", errors="ignore")).hexdigest()[:8], 16) % 360


def _hue_palette_topic(topic: str, n: int) -> list[str]:
    h0 = _topic_theme_hue(topic)
    out: list[str] = []
    for i in range(max(n, 1)):
        h = (h0 + i * 32) % 360
        out.append(f"hsla({h}, 76%, 54%, 0.92)")
    return out


def _border_palette_topic(topic: str, n: int) -> list[str]:
    h0 = _topic_theme_hue(topic)
    out: list[str] = []
    for i in range(max(n, 1)):
        h = (h0 + i * 32) % 360
        out.append(f"hsla({h}, 82%, 44%, 1)")
    return out


def _hsla_fade_fill(accent: str, new_alpha: str) -> str:
    """Replace first hsla alpha segment (0.xx) so radar/area fills work with topic palettes (0.92)."""
    for token in ("0.92", "0.85"):
        if token in accent:
            return accent.replace(token, new_alpha, 1)
    return accent


def _looks_like_time_series(labels: list[str]) -> bool:
    if len(labels) < 2:
        return False
    hits = 0
    for L in labels:
        s = str(L)
        if _TIME_HINT.search(s) or _DATEISH.search(s):
            hits += 1
    return hits >= max(2, (len(labels) + 1) // 2)


def _looks_like_share_slice(values: list[float]) -> bool:
    if len(values) < 2 or len(values) > 12:
        return False
    if any(v < 0 for v in values):
        return False
    s = sum(values)
    return 80.0 <= s <= 120.0


def _normalize_kind(raw: str | None) -> str | None:
    if not raw:
        return None
    k = str(raw).strip().lower().replace(" ", "_").replace("-", "_")
    aliases = {
        "pie": "doughnut",
        "donut": "doughnut",
        "ring": "doughnut",
        "proportion": "doughnut",
        "distribution": "doughnut",
        "share": "doughnut",
        "trend": "area",
        "timeseries": "area",
        "time_series": "area",
        "candlestick": "line",
        "compare": "grouped_bar",
        "comparison": "grouped_bar",
        "multi": "grouped_bar",
        "radar": "radar",
        "spider": "radar",
        "default": None,
        "auto": None,
    }
    if k in aliases:
        v = aliases[k]
        return v
    if k in ("bar", "grouped_bar", "line", "area", "radar", "doughnut"):
        return k
    return None


def _infer_chart_kind(
    labels: list[str],
    values: list[float],
    secondary: list[float] | None,
    analyst_hint: str | None,
) -> str:
    hinted = _normalize_kind(analyst_hint)
    if secondary and len(secondary) == len(values):
        return "grouped_bar"
    if hinted == "grouped_bar" and secondary and len(secondary) == len(values):
        return "grouped_bar"
    if hinted and hinted != "grouped_bar":
        if hinted == "doughnut" and not _looks_like_share_slice(values):
            pass
        else:
            return hinted
    if secondary and len(secondary) == len(values):
        return "grouped_bar"
    if _looks_like_share_slice(values):
        return "doughnut"
    if _looks_like_time_series(labels):
        return "area"
    if 4 <= len(labels) <= 10 and not secondary:
        return "radar"
    return "bar"


def _chart_metrics_dict(analyst_out: dict[str, Any]) -> dict[str, Any] | None:
    """Prefer ``chart_metrics``; fall back to ``analyst_chart_metrics`` (delivery merge shape)."""
    cm = analyst_out.get("chart_metrics")
    if isinstance(cm, dict):
        return cm
    acm = analyst_out.get("analyst_chart_metrics")
    if isinstance(acm, dict):
        return acm
    return None


def _coerce_chart_spec(analyst_out: dict[str, Any]) -> dict[str, Any] | None:
    cm = _chart_metrics_dict(analyst_out)
    if not isinstance(cm, dict):
        return None
    title = str(cm.get("title") or "Key metrics").strip()[:120]
    labels = cm.get("labels")
    values = cm.get("values")
    if not isinstance(labels, list) or not isinstance(values, list):
        return None
    if len(labels) < 1 or len(values) < 1:
        return None
    n = min(len(labels), len(values))
    labels, values = labels[:n], values[:n]
    nums: list[float] = []
    for v in values:
        try:
            if isinstance(v, (int, float)):
                nums.append(float(v))
            else:
                s = str(v).replace(",", "").replace("%", "").strip()
                nums.append(float(s))
        except (TypeError, ValueError):
            return None
    slabels = [str(x)[:48] for x in labels]

    sec_raw = cm.get("secondary_values")
    secondary: list[float] | None = None
    if isinstance(sec_raw, list) and len(sec_raw) == len(nums):
        try:
            secondary = []
            for v in sec_raw:
                if isinstance(v, (int, float)):
                    secondary.append(float(v))
                else:
                    secondary.append(float(str(v).replace(",", "").replace("%", "").strip()))
        except (TypeError, ValueError):
            secondary = None

    hint = cm.get("chart_kind") or cm.get("chart_type") or cm.get("chart_type_hint")
    kind = _infer_chart_kind(slabels, nums, secondary, str(hint) if hint else None)
    if len(nums) == 1:
        kind = "bar"

    intel = str(cm.get("intelligence_caption") or cm.get("chart_caption") or "").strip()[:400]
    sec_label = str(cm.get("secondary_label") or "Series B").strip()[:60]

    return {
        "title": title,
        "labels": slabels,
        "values": nums,
        "secondary_values": secondary,
        "secondary_label": sec_label,
        "chart_kind": kind,
        "intelligence_caption": intel,
    }


def _chart_js_config(spec: dict[str, Any], theme_topic: str) -> dict[str, Any]:
    title = spec["title"]
    labels = spec["labels"]
    values = spec["values"]
    kind = spec["chart_kind"]
    tt = (theme_topic or "").strip() or "research"
    colors = _hue_palette_topic(tt, len(labels))
    borders = _border_palette_topic(tt, len(labels))
    accent = colors[0] if colors else "hsla(210, 72%, 52%, 0.85)"

    base_options: dict[str, Any] = {
        "plugins": {
            "title": {"display": True, "text": title[:80], "font": {"size": 16, "weight": "600"}},
            "legend": {"display": kind in ("grouped_bar", "line", "area", "doughnut")},
        },
        "responsive": True,
        "maintainAspectRatio": True,
    }

    if kind == "doughnut":
        return {
            "type": "doughnut",
            "data": {
                "labels": labels,
                "datasets": [
                    {
                        "data": values,
                        "backgroundColor": colors,
                        "borderColor": "#ffffff",
                        "borderWidth": 2,
                        "hoverOffset": 8,
                    }
                ],
            },
            "options": {
                **base_options,
                "plugins": {
                    **base_options["plugins"],
                    "legend": {"display": True, "position": "bottom"},
                },
                "cutout": "58%",
            },
        }

    if kind == "radar":
        return {
            "type": "radar",
            "data": {
                "labels": labels,
                "datasets": [
                    {
                        "label": title[:60],
                        "data": values,
                        "backgroundColor": _hsla_fade_fill(accent, "0.25"),
                        "borderColor": borders[0],
                        "borderWidth": 2,
                        "pointBackgroundColor": colors,
                    }
                ],
            },
            "options": {
                **base_options,
                "plugins": {**base_options["plugins"], "legend": {"display": False}},
                "scales": {
                    "r": {
                        "beginAtZero": True,
                        "grid": {"color": "rgba(0,0,0,0.06)"},
                        "angleLines": {"color": "rgba(0,0,0,0.08)"},
                    }
                },
            },
        }

    if kind == "grouped_bar" and spec.get("secondary_values"):
        sec = spec["secondary_values"]
        return {
            "type": "bar",
            "data": {
                "labels": labels,
                "datasets": [
                    {
                        "label": title[:40] or "A",
                        "data": values,
                        "backgroundColor": colors,
                        "borderColor": borders,
                        "borderWidth": 1,
                    },
                    {
                        "label": spec.get("secondary_label") or "B",
                        "data": sec,
                        "backgroundColor": [_hsla_fade_fill(c, "0.45") for c in colors],
                        "borderColor": borders,
                        "borderWidth": 1,
                    },
                ],
            },
            "options": {
                **base_options,
                "scales": {
                    "x": {"grid": {"display": False}, "ticks": {"maxRotation": 45, "minRotation": 0}},
                    "y": {"beginAtZero": True, "grid": {"color": "rgba(0,0,0,0.06)"}},
                },
            },
        }

    if kind in ("line", "area"):
        fill = kind == "area"
        return {
            "type": "line",
            "data": {
                "labels": labels,
                "datasets": [
                    {
                        "label": title[:60],
                        "data": values,
                        "fill": fill,
                        "tension": 0.35,
                        "borderColor": borders[0],
                        "backgroundColor": _hsla_fade_fill(accent, "0.2") if fill else "transparent",
                        "borderWidth": 2,
                        "pointRadius": 4,
                        "pointBackgroundColor": colors,
                    }
                ],
            },
            "options": {
                **base_options,
                "plugins": {**base_options["plugins"], "legend": {"display": False}},
                "scales": {
                    "x": {"grid": {"display": False}},
                    "y": {"beginAtZero": True, "grid": {"color": "rgba(0,0,0,0.06)"}},
                },
            },
        }

    return {
        "type": "bar",
        "data": {
            "labels": labels,
            "datasets": [
                {
                    "label": title[:60],
                    "data": values,
                    "backgroundColor": colors,
                    "borderColor": borders,
                    "borderWidth": 1,
                    "borderRadius": 6,
                }
            ],
        },
        "options": {
            **base_options,
            "plugins": {**base_options["plugins"], "legend": {"display": False}},
            "scales": {
                "x": {"grid": {"display": False}, "ticks": {"maxRotation": 40}},
                "y": {"beginAtZero": True, "grid": {"color": "rgba(0,0,0,0.06)"}},
            },
        },
    }


def has_chartable_metrics(analyst_out: dict[str, Any]) -> bool:
    """True when ``chart_metrics`` / ``analyst_chart_metrics`` can be coerced for QuickChart."""
    return _coerce_chart_spec(analyst_out) is not None


def build_quickchart_png_url(
    analyst_out: dict[str, Any],
    *,
    theme_topic: str | None = None,
) -> tuple[str, dict[str, Any]] | None:
    spec = _coerce_chart_spec(analyst_out)
    if not spec:
        return None
    tt = (theme_topic or "").strip() or "research"
    chart_config = _chart_js_config(spec, tt)
    q = urllib.parse.urlencode(
        {
            "format": "png",
            "width": 720,
            "height": 440,
            "c": json.dumps(chart_config, separators=(",", ":")),
        }
    )
    return f"{_QUICKCHART}?{q}", spec


def _hsl_to_rgb(h: float, s: float, l: float) -> tuple[int, int, int]:
    """h 0-360, s/l 0-1."""
    h = (h % 360) / 360.0
    s = max(0, min(1, s))
    l = max(0, min(1, l))
    if s == 0:
        v = int(l * 255)
        return v, v, v
    def f(n: float) -> float:
        k = (n + h * 12) % 12
        a = s * min(l, 1 - l)
        return l - a * max(-1, min(min(k - 3, 9 - k, 1), -1))

    return int(f(0) * 255), int(f(8) * 255), int(f(4) * 255)


def render_fallback_chart_png(spec: dict[str, Any], *, theme_topic: str) -> bytes | None:
    """
    Local PNG when QuickChart is unreachable — keeps PDF / Telegram visuals available.
    Renders a simple bar chart (best-effort for any ``chart_kind``).
    """
    try:
        from PIL import Image, ImageDraw
    except ImportError:
        logger.warning("Pillow not available; chart PNG fallback skipped.")
        return None
    labels = spec.get("labels") or []
    values = spec.get("values") or []
    if len(labels) < 1 or len(values) < 1:
        return None
    title = str(spec.get("title") or "Key metrics")[:80]
    W, H = 920, 520
    bg = (12, 16, 32)
    img = Image.new("RGB", (W, H), bg)
    draw = ImageDraw.Draw(img)
    margin_l, margin_r, margin_t, margin_b = 56, 40, 72, 100
    plot_w = W - margin_l - margin_r
    plot_h = H - margin_t - margin_b
    maxv = max(float(v) for v in values) or 1.0
    n = len(values)
    gap = 10
    bar_w = max(8, (plot_w - gap * (n + 1)) // max(n, 1))
    h0 = _topic_theme_hue(theme_topic)
    for i, v in enumerate(values):
        x0 = margin_l + gap + i * (bar_w + gap)
        frac = min(1.0, max(0.0, float(v) / maxv))
        bh = int(frac * plot_h)
        y1 = margin_t + plot_h
        y0 = y1 - bh
        rgb = _hsl_to_rgb(h0 + i * 28, 0.62, 0.52)
        draw.rectangle([x0, y0, x0 + bar_w, y1], fill=rgb)
    try:
        draw.text((margin_l, 24), title, fill=(230, 235, 250))
    except Exception:
        pass
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    out = buf.getvalue()
    return out if len(out) > 80 else None


def chart_js_config_from_metrics(
    cm: dict[str, Any] | None,
    *,
    theme_topic: str,
) -> dict[str, Any] | None:
    """Chart.js ``{type, data, options}`` dict for embedding in the landing page (or None)."""
    if not isinstance(cm, dict):
        return None
    spec = _coerce_chart_spec({"chart_metrics": cm})
    if not spec:
        return None
    return _chart_js_config(spec, theme_topic)


def generate_charts_from_analyst(
    analyst_out: dict[str, Any],
    *,
    theme_topic: str | None = None,
) -> list[tuple[bytes, str, str]]:
    """
    Return tuples of ``(png_bytes, caption, quickchart_url)`` for Telegram / HTML embed.

    ``theme_topic`` should be the research topic string so QuickChart colors match the HTML report.
    Caption includes optional ``intelligence_caption`` from the analyst (why the chart matters).
    """
    built = build_quickchart_png_url(analyst_out, theme_topic=theme_topic)
    if not built:
        return []
    url, spec = built
    try:
        with httpx.Client(timeout=45.0, follow_redirects=True) as client:
            r = client.get(url, headers={"User-Agent": _CHROME_UA})
            r.raise_for_status()
            data = r.content
    except Exception as exc:
        logger.warning("QuickChart fetch failed: %s", exc)
        return []

    if not data or len(data) < 100:
        return []

    kind = spec.get("chart_kind", "bar")
    cap = f"Summary chart ({kind}) — {spec['title']}"
    intel = (spec.get("intelligence_caption") or "").strip()
    if intel:
        cap = f"{cap} · {intel}"[:1024]

    return [(data, cap, url)]


def generate_charts_from_analyst_with_fallback(
    analyst_out: dict[str, Any],
    *,
    theme_topic: str | None = None,
) -> list[tuple[bytes, str, str]]:
    """QuickChart first; if it fails but metrics are valid, render a local bar-chart PNG."""
    primary = generate_charts_from_analyst(analyst_out, theme_topic=theme_topic)
    if primary:
        return primary
    spec = _coerce_chart_spec(analyst_out)
    if not spec:
        return []
    tt = (theme_topic or "").strip() or "research"
    png = render_fallback_chart_png(spec, theme_topic=tt)
    if not png:
        return []
    kind = spec.get("chart_kind", "bar")
    cap = f"Summary chart ({kind}, offline render) — {spec['title']}"
    intel = (spec.get("intelligence_caption") or "").strip()
    if intel:
        cap = f"{cap} · {intel}"[:1024]
    return [(png, cap, "")]
