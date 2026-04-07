"""
Premium SaaS-style single-file HTML for research deliveries (grid layout, glass cards, theme sync).

Served via ``GET /reports/view/{report_id}``; files live under ``data/reports/{uuid}.html``.
"""

from __future__ import annotations

import base64
import hashlib
import html
import json
from pathlib import Path
from typing import Any, Sequence
from urllib.parse import quote

from tunde_agent.config.settings import project_root


def reports_dir() -> Path:
    d = project_root() / "data" / "reports"
    d.mkdir(parents=True, exist_ok=True)
    return d


def theme_hue_from_topic(topic: str) -> int:
    """Stable hue (0–359) from topic; matches QuickChart palette when ``theme_topic`` is passed to designer."""
    return int(hashlib.sha256(topic.encode("utf-8", errors="ignore")).hexdigest()[:8], 16) % 360


def _feasibility_section_html(delivery: dict[str, Any]) -> str:
    fd = delivery.get("feasibility_deep_dive")
    if not isinstance(fd, dict):
        return ""
    budget = _esc(str(fd.get("budget_summary") or "").strip())
    roi = _esc(str(fd.get("roi_commentary") or "").strip())
    verdict = _esc(str(fd.get("feasibility_verdict") or "").strip())
    ms = fd.get("milestones") if isinstance(fd.get("milestones"), list) else []
    risks = fd.get("risk_and_mitigation") if isinstance(fd.get("risk_and_mitigation"), list) else []
    ms_li = "".join(f'<li class="ins-li">{_esc(str(x).strip())}</li>' for x in ms[:12] if str(x).strip())
    rk_li = "".join(f'<li class="ins-li">{_esc(str(x).strip())}</li>' for x in risks[:10] if str(x).strip())
    if not (budget or roi or verdict or ms_li or rk_li):
        return ""
    parts = ['<section id="feasibility" class="report-card">']
    parts.append('<header class="card-head"><h2 class="section-title">Feasibility & delivery</h2></header>')
    if budget:
        parts.append(f'<h3 class="card-title" style="margin:16px 0 8px;">Budget & cost</h3><p class="body-prose">{budget}</p>')
    if ms_li:
        parts.append(f'<h3 class="card-title" style="margin:20px 0 8px;">Milestones</h3><ul class="ins-list">{ms_li}</ul>')
    if roi:
        parts.append(f'<h3 class="card-title" style="margin:20px 0 8px;">ROI & economics</h3><p class="body-prose">{roi}</p>')
    if rk_li:
        parts.append(f'<h3 class="card-title" style="margin:20px 0 8px;">Risks & mitigation</h3><ul class="ins-list">{rk_li}</ul>')
    if verdict:
        parts.append(
            f'<p class="smart-observation" style="margin-top:24px;"><span class="so-label">Verdict</span>{verdict}</p>'
        )
    parts.append("</section>")
    return "".join(parts)


def _chartjs_interactive_block(cm: dict[str, Any], topic: str) -> tuple[str, str]:
    """HTML card + trailing scripts (Chart.js) when ``chart_metrics`` coerce."""
    from tunde_agent.services.research_orchestration.designer_agent import chart_js_config_from_metrics

    cfg = chart_js_config_from_metrics(cm, theme_topic=topic)
    if not cfg:
        return "", ""
    raw = json.dumps(cfg, separators=(",", ":"))
    b64 = base64.standard_b64encode(raw.encode("utf-8")).decode("ascii")
    card = (
        '<article class="report-card report-card--chart" id="chartjs-interactive">'
        '<header class="card-head"><span class="chart-pill">INTERACTIVE</span>'
        '<h3 class="card-title">Live chart (Chart.js)</h3></header>'
        '<div class="chartjs-wrap"><canvas id="tundeChartMain" aria-label="Analytics chart"></canvas></div>'
        "</article>"
    )
    tail = (
        '<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>\n'
        "<script>\n"
        "(function(){\n"
        f"  var cfg = JSON.parse(atob('{b64}'));\n"
        "  function go(){\n"
        "    var el = document.getElementById('tundeChartMain');\n"
        "    if (!el || typeof Chart === 'undefined') return;\n"
        "    try { new Chart(el, cfg); } catch(e) { console.warn(e); }\n"
        "  }\n"
        "  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go);\n"
        "  else go();\n"
        "})();\n"
        "</script>\n"
    )
    return card, tail


def _esc(s: str) -> str:
    return html.escape((s or "").strip(), quote=False)


def _placeholder_svg_data_uri(hue: int) -> str:
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540">'
        f'<defs><linearGradient id="ph" x1="0" y1="0" x2="1" y2="1">'
        f'<stop offset="0%" stop-color="hsl({hue},48%,28%)"/><stop offset="100%" stop-color="hsl({(hue + 42) % 360},40%,18%)"/>'
        f'</linearGradient><filter id="glow"><feGaussianBlur stdDeviation="24" result="b"/>'
        f'<feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>'
        f'<rect width="960" height="540" rx="28" fill="url(#ph)"/>'
        f'<rect x="48" y="48" width="864" height="444" rx="20" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="2"/>'
        f'<text x="480" y="268" text-anchor="middle" fill="rgba(255,255,255,0.45)" font-family="Montserrat,sans-serif" '
        f'font-size="20" font-weight="600">Visual asset unavailable</text>'
        f'<text x="480" y="302" text-anchor="middle" fill="rgba(255,255,255,0.28)" font-family="Inter,sans-serif" '
        f'font-size="13">Tunde placeholder · premium report</text></svg>'
    )
    return "data:image/svg+xml;charset=utf-8," + quote(svg)


def _partition_insights(insights: Sequence[str]) -> tuple[list[str], list[str]]:
    gp: list[str] = []
    rest: list[str] = []
    for x in insights:
        t = str(x).strip()
        if not t:
            continue
        if t.startswith("🌍"):
            gp.append(t)
        else:
            rest.append(t)
    return gp, rest


def _smart_observation(intel: str, exec_fallback: str) -> str:
    t = (intel or "").strip()
    if t:
        return t
    ef = (exec_fallback or "").strip()
    if len(ef) > 280:
        cut = ef[:280]
        sp = cut.rsplit(". ", 1)
        return sp[0] + "." if len(sp[0]) > 80 else cut + "…"
    return ef


def build_landing_page_html(
    topic: str,
    delivery: dict[str, Any],
    *,
    illustrations: list[dict[str, Any]],
    chart_embeds: list[dict[str, str]],
    rtl: bool = False,
    public_page_url: str = "",
) -> str:
    """Return a full HTML document (UTF-8) — dashboard-grade layout."""
    hue = theme_hue_from_topic(topic)
    ph_uri = _placeholder_svg_data_uri(hue)
    lang = "ar" if rtl else "en"
    tagline = _esc(str(delivery.get("tagline") or "Research intelligence brief"))
    exec_sum = _esc(str(delivery.get("executive_summary") or ""))
    exec_plain = str(delivery.get("executive_summary") or "")
    raw_ins = delivery.get("insights") if isinstance(delivery.get("insights"), list) else []
    insights = [str(x).strip() for x in raw_ins if x and str(x).strip()]
    gp, detail = _partition_insights(insights)

    sources = delivery.get("sources") or []
    src_rows: list[tuple[str, str]] = []
    if isinstance(sources, list):
        for it in sources:
            if isinstance(it, (list, tuple)) and len(it) >= 2:
                src_rows.append((str(it[0]), str(it[1])))
            elif isinstance(it, dict) and it.get("url"):
                src_rows.append((str(it.get("title") or "Source"), str(it["url"])))

    cm = delivery.get("analyst_chart_metrics")
    metrics_html = ""
    if isinstance(cm, dict):
        labels = cm.get("labels")
        values = cm.get("values")
        if isinstance(labels, list) and isinstance(values, list):
            pairs = list(zip(labels, values))[:4]
            cards = []
            for i, (lb, val) in enumerate(pairs):
                cards.append(
                    f'<div class="metric-card" data-i="{i}"><span class="m-val">{_esc(str(val))}</span>'
                    f'<span class="m-lb">{_esc(str(lb)[:80])}</span></div>'
                )
            if cards:
                metrics_html = '<div class="metric-grid">' + "".join(cards) + "</div>"

    cm_dict: dict[str, Any] = cm if isinstance(cm, dict) else {}

    hero_ill_html = ""
    first_src: str | None = None
    for ill in illustrations:
        s = ill.get("src")
        if isinstance(s, str) and s.startswith("data:image"):
            first_src = s
            alt = _esc(str(ill.get("alt") or "Research visual"))
            hero_ill_html = (
                '<section class="report-card report-card--hero-visual" id="hero-art" aria-label="Featured visual">'
                '<div class="hero-img-frame">'
                '<img class="hero-img tunde-img-fallback" src="'
                + html.escape(s, quote=True)
                + '" alt="'
                + alt
                + '" loading="eager"/>'
                "</div><p class=\"hero-art-caption\">"
                + alt
                + "</p></section>"
            )
            break

    chart_blocks: list[str] = []
    for ch in chart_embeds:
        b64 = ch.get("b64") or ""
        if not b64:
            continue
        cap = _esc(ch.get("caption") or "Data visualization")
        intel_raw = ch.get("intel") or ""
        obs = _esc(_smart_observation(intel_raw, exec_plain))
        kind = _esc((ch.get("kind") or "chart").upper())
        chart_blocks.append(
            f'<article class="report-card report-card--chart">'
            f'<header class="card-head"><span class="chart-pill">{kind}</span><h3 class="card-title">Analytics</h3></header>'
            f'<div class="chart-media">'
            f'<img class="tunde-img-fallback" src="data:image/png;base64,{b64}" alt="{cap}" width="720" height="440" loading="lazy"/>'
            f"</div>"
            f'<p class="chart-caption">{cap}</p>'
            f'<p class="smart-observation"><span class="so-label">Smart observation</span>{obs or "—"}</p>'
            f"</article>"
        )
    charts_section = "".join(chart_blocks)
    chartjs_card, chartjs_tail = _chartjs_interactive_block(cm_dict, topic)

    ill_rest: list[str] = []
    skip_first = bool(first_src)
    for ill in illustrations:
        s = ill.get("src")
        if skip_first and isinstance(s, str) and s.startswith("data:image"):
            skip_first = False
            continue
        alt = _esc(str(ill.get("alt") or "Illustration"))
        prompt = _esc(str(ill.get("image_prompt") or ""))
        if isinstance(s, str) and s.startswith("data:image"):
            ill_rest.append(
                f'<article class="report-card report-card--ill">'
                f'<div class="ill-frame"><img class="tunde-img-fallback" src="{html.escape(s, quote=True)}" '
                f'alt="{alt}" loading="lazy"/></div>'
                f'<p class="ill-cap">{alt}</p></article>'
            )
        elif prompt:
            ill_rest.append(
                f'<article class="report-card report-card--prompt"><h3 class="card-title">{alt}</h3>'
                f'<p class="prompt-body">{prompt}</p>'
                f'<p class="prompt-hint">Concept art direction · render via Pollinations when online.</p></article>'
            )
    ill_section_inner = "".join(ill_rest) if ill_rest else ""

    gp_items = "".join(f'<li class="ins-li">{_esc(g)}</li>' for g in gp) if gp else ""
    gp_section = ""
    if gp_items:
        gp_section = (
            f'<section id="global" class="report-card"><header class="card-head"><h2 class="section-title">'
            f'Global perspectives</h2></header><ul class="ins-list">{gp_items}</ul></section>'
        )

    det_items = "".join(f'<li class="ins-li">{_esc(d)}</li>' for d in detail) if detail else ""
    if not det_items and not gp_items:
        det_items = '<li class="ins-li">See executive summary and sources on this page.</li>'

    feasibility_block = _feasibility_section_html(delivery)

    def _source_anchor(title: str, url: str) -> str:
        u = (url or "").strip()
        if not u:
            return ""
        return (
            f'<li class="src-li"><a class="src-link" href="{html.escape(u, quote=True)}" '
            f'target="_blank" rel="noopener noreferrer">{_esc(title or "Source")}</a></li>'
        )

    src_items = "".join(_source_anchor(t, u) for t, u in src_rows[:24])

    via = _esc(public_page_url)
    ph_attr = html.escape(ph_uri, quote=True)
    img_summary = delivery.get("image_analysis_summary")
    vision_block = ""
    if isinstance(img_summary, str) and img_summary.strip():
        vision_block = (
            f'<section id="vision" class="report-card">'
            f'<header class="card-head"><h2 class="section-title">Visual intelligence</h2></header>'
            f'<p class="body-prose">{_esc(img_summary[:2200])}</p></section>'
        )

    ml = delivery.get("multilingual_sources")
    ml_block = ""
    if isinstance(ml, list) and ml:
        parts = []
        for row in ml[:12]:
            if not isinstance(row, dict):
                continue
            full_u = str(row.get("url") or "").strip()
            loc = str(row.get("search_locale") or "")
            if full_u:
                disp = full_u if len(full_u) <= 96 else full_u[:93] + "…"
                parts.append(
                    f'<li class="mini-li"><span class="loc">{_esc(loc or "—")}</span> '
                    f'<a class="src-link" href="{html.escape(full_u, quote=True)}" '
                    f'target="_blank" rel="noopener noreferrer">{_esc(disp)}</a></li>'
                )
        if parts:
            ml_block = (
                f'<section id="multilingual" class="report-card">'
                f'<header class="card-head"><h2 class="section-title">Multilingual discovery</h2></header>'
                f'<ul class="mini-list">{"".join(parts)}</ul></section>'
            )

    exec_raw = exec_plain
    summary_for_ta = html.escape(exec_raw, quote=False)

    css = f"""
:root {{
  --hue: {hue};
  --accent: hsl(var(--hue), 72%, 58%);
  --accent-dim: hsl(var(--hue), 55%, 42%);
  --accent-glow: hsla(var(--hue), 80%, 55%, 0.35);
  --bg-deep: #070a12;
  --bg-mid: #0c1020;
  --card-bg: linear-gradient(155deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.02) 100%);
  --stroke: rgba(255,255,255,0.14);
  --text: rgba(255,255,255,0.94);
  --muted: rgba(255,255,255,0.58);
  --font-body: "Inter", system-ui, sans-serif;
  --font-display: "Montserrat", var(--font-body);
}}
* {{ box-sizing: border-box; }}
html {{ scroll-behavior: smooth; }}
body {{
  margin: 0; min-height: 100vh; color: var(--text);
  font-family: var(--font-body), system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  font-size: 1.02rem; line-height: 1.65;
  background:
    radial-gradient(ellipse 1400px 900px at 15% -10%, hsla(var(--hue), 45%, 22%, 0.55), transparent 55%),
    radial-gradient(ellipse 1000px 700px at 95% 30%, hsla(calc(var(--hue) + 55), 40%, 18%, 0.4), transparent 50%),
    linear-gradient(180deg, var(--bg-deep), var(--bg-mid));
}}
a {{ color: var(--accent); text-decoration: none; font-weight: 600; }}
a:hover {{ text-decoration: underline; text-underline-offset: 3px; }}
.app-frame {{
  display: flex;
  width: 100%;
  min-height: 100vh;
  align-items: stretch;
}}
html[dir="rtl"] .app-frame {{ flex-direction: row-reverse; }}
.sidebar {{
  flex: 0 0 auto;
  width: 260px;
  min-height: 100vh;
  position: sticky;
  top: 0;
  align-self: flex-start;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 20px 12px 32px;
  background: rgba(8,10,20,0.75);
  backdrop-filter: blur(24px);
  border-inline-end: 1px solid var(--stroke);
  box-shadow: 4px 0 32px rgba(0,0,0,0.35);
  transition: width 0.28s ease, padding 0.28s ease;
  z-index: 40;
}}
html[dir="rtl"] .sidebar {{
  border-inline-end: none;
  border-inline-start: 1px solid var(--stroke);
  box-shadow: -4px 0 32px rgba(0,0,0,0.35);
}}
.sidebar[data-collapsed="true"] {{
  width: 76px;
  padding-inline: 8px;
}}
.sidebar-toggle {{
  align-self: stretch;
  margin-bottom: 8px;
  padding: 12px;
  border-radius: 14px;
  border: 1px solid var(--stroke);
  background: rgba(255,255,255,0.06);
  color: var(--text);
  font-size: 1.1rem;
  cursor: pointer;
  font-family: var(--font-display);
  transition: background 0.2s ease, transform 0.2s ease;
}}
.sidebar-toggle:hover {{ background: rgba(255,255,255,0.12); }}
.sidebar-nav {{
  display: flex;
  flex-direction: column;
  gap: 4px;
}}
.nav-item {{
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 14px;
  border-radius: 14px;
  color: var(--muted);
  text-decoration: none;
  font-weight: 600;
  font-size: 0.72rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  font-family: var(--font-display);
  transition: background 0.18s ease, color 0.18s ease;
}}
.nav-item:hover {{
  background: rgba(255,255,255,0.08);
  color: var(--text);
  text-decoration: none;
}}
.nav-ic {{
  font-size: 1.2rem;
  width: 1.75rem;
  text-align: center;
  flex-shrink: 0;
  line-height: 1;
}}
.nav-label {{ white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }}
.sidebar[data-collapsed="true"] .nav-label {{
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0,0,0,0);
  border: 0;
}}
.sidebar[data-collapsed="true"] .nav-item {{
  justify-content: center;
  padding: 12px 10px;
}}
.content-canvas {{
  flex: 1;
  min-width: 0;
  width: 100%;
}}
.content-inner {{
  width: 100%;
  max-width: 100%;
  margin: 0 auto;
  padding: 28px clamp(16px, 3vw, 40px) 100px;
}}
.section.full-bleed {{
  width: 100%;
  margin-left: 0;
  margin-right: 0;
}}
.report-card {{
  margin-bottom: 28px; padding: 40px clamp(24px, 4vw, 48px); border-radius: 20px; width: 100%;
  background: var(--card-bg);
  backdrop-filter: blur(22px);
  border: 1px solid var(--stroke);
  box-shadow:
    0 0 0 1px rgba(255,255,255,0.04) inset,
    0 24px 64px rgba(0,0,0,0.45),
    0 0 80px -20px var(--accent-glow);
}}
.report-card--hero-visual {{ padding: 0; overflow: hidden; }}
.hero-img-frame {{
  position: relative; width: 100%; aspect-ratio: 21/9; min-height: 220px; max-height: min(56vw, 520px); overflow: hidden;
  background: rgba(0,0,0,0.25);
}}
.hero-img {{ width: 100%; height: 100%; object-fit: cover; display: block; }}
.hero-art-caption {{
  margin: 0; padding: 16px 40px 28px; font-size: 0.88rem; color: var(--muted); font-family: var(--font-display);
}}
.hero-band {{
  padding: clamp(28px, 4vw, 44px) clamp(24px, 4vw, 48px); border-radius: 20px; margin-bottom: 28px;
  width: 100%;
  background: linear-gradient(125deg, hsla(var(--hue), 50%, 24%, 0.65), rgba(255,255,255,0.04));
  border: 1px solid var(--stroke);
  box-shadow: 0 32px 80px rgba(0,0,0,0.4), 0 0 100px -30px var(--accent-glow);
}}
.hero-band h1 {{
  font-family: var(--font-display); font-weight: 800;
  font-size: clamp(1.65rem, 2.4vw, 2.75rem);
  margin: 0 0 16px; line-height: 1.15; letter-spacing: -0.02em;
}}
.hero-band .tagline {{ font-size: 1.08rem; color: var(--muted); max-width: 56ch; margin: 0; }}
.toolbar {{
  display: flex; flex-wrap: wrap; gap: 14px; margin-top: 32px;
}}
.btn {{
  cursor: pointer; border: none; padding: 14px 26px; border-radius: 14px; font-weight: 700;
  font-family: var(--font-display); font-size: 0.82rem; letter-spacing: 0.04em; text-transform: uppercase;
  background: linear-gradient(135deg, var(--accent), var(--accent-dim));
  color: #0a0c12; box-shadow: 0 12px 32px rgba(0,0,0,0.35);
  transition: transform 0.18s ease, box-shadow 0.18s ease;
}}
.btn:hover {{ transform: translateY(-2px); box-shadow: 0 16px 40px rgba(0,0,0,0.45); }}
.btn--ghost {{
  background: rgba(255,255,255,0.06); color: var(--text); border: 1px solid var(--stroke);
  box-shadow: none;
}}
.card-head {{ margin-bottom: 20px; }}
.section-title, .card-title {{
  font-family: var(--font-display); font-weight: 800; margin: 0;
  font-size: 0.78rem; letter-spacing: 0.2em; text-transform: uppercase; color: var(--muted);
}}
.card-title {{ font-size: 1.05rem; letter-spacing: 0.08em; color: var(--text); }}
.chart-pill {{
  display: inline-block; font-size: 0.65rem; font-weight: 800; letter-spacing: 0.18em;
  color: var(--accent); margin-bottom: 8px;
}}
.body-prose {{ margin: 0; color: rgba(255,255,255,0.86); font-size: 1.05rem; }}
.metric-grid {{
  display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px;
}}
.metric-card {{
  padding: 28px 24px; border-radius: 16px; text-align: center;
  background: rgba(0,0,0,0.22);
  border: 1px solid rgba(255,255,255,0.08);
  transform: perspective(900px) rotateX(4deg);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  box-shadow: 0 16px 40px rgba(0,0,0,0.3);
}}
.metric-card:hover {{ transform: perspective(900px) rotateX(0deg) translateY(-4px); }}
.metric-card .m-val {{
  display: block; font-family: var(--font-display); font-size: 2rem; font-weight: 800;
  background: linear-gradient(90deg, var(--accent), hsl(calc(var(--hue) + 40), 70%, 70%));
  -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
}}
.metric-card .m-lb {{ display: block; font-size: 0.82rem; color: var(--muted); margin-top: 12px; }}
.chart-media {{
  border-radius: 16px; overflow: hidden; margin: 12px 0 8px;
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(0,0,0,0.2);
}}
.chart-media img {{ display: block; width: 100%; height: auto; }}
.chartjs-wrap {{
  border-radius: 16px; overflow: hidden; min-height: 360px;
  border: 1px solid rgba(255,255,255,0.1);
  background: rgba(0,0,0,0.25);
  padding: 16px;
}}
.chartjs-wrap canvas {{ max-width: 100% !important; height: auto !important; }}
.chart-caption {{ font-size: 0.92rem; color: var(--muted); margin: 12px 0 0; }}
.smart-observation {{
  margin: 24px 0 0; padding: 20px 22px; border-radius: 14px;
  background: rgba(0,0,0,0.35);
  border-left: 4px solid var(--accent);
  font-size: 0.98rem; color: rgba(255,255,255,0.88); line-height: 1.55;
}}
.so-label {{
  display: block; font-family: var(--font-display); font-size: 0.68rem; letter-spacing: 0.16em;
  text-transform: uppercase; color: var(--accent); margin-bottom: 10px; font-weight: 800;
}}
.ins-list, .mini-list {{ margin: 0; padding: 0; list-style: none; }}
.ins-li {{ padding: 14px 0; border-bottom: 1px solid rgba(255,255,255,0.06); color: rgba(255,255,255,0.9); }}
.ins-li:last-child {{ border-bottom: none; }}
.mini-li {{ font-size: 0.88rem; color: var(--muted); padding: 8px 0; }}
.mini-li .loc {{ font-family: ui-monospace, monospace; color: var(--accent); margin-right: 8px; }}
.src-li {{ margin: 10px 0; }}
.ill-frame {{ border-radius: 16px; overflow: hidden; border: 1px solid var(--stroke); }}
.ill-frame img {{ width: 100%; display: block; }}
.ill-cap {{ color: var(--muted); font-size: 0.88rem; margin-top: 12px; }}
.prompt-body {{ color: rgba(255,255,255,0.78); }}
.prompt-hint {{ font-size: 0.8rem; color: var(--muted); margin-top: 16px; }}
.site-footer {{
  text-align: center; padding: 48px 24px; color: var(--muted); font-size: 0.78rem;
  font-family: var(--font-display); letter-spacing: 0.02em; line-height: 1.65;
  text-transform: none;
}}
@media (max-width: 720px) {{
  .app-frame {{ flex-direction: column; }}
  .sidebar {{
    position: relative;
    width: 100% !important;
    min-height: 0;
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
    border-inline-end: none;
    border-bottom: 1px solid var(--stroke);
  }}
  .sidebar[data-collapsed="true"] {{ width: 100% !important; }}
  .sidebar[data-collapsed="true"] .nav-label {{
    position: static; width: auto; height: auto; margin: 0; clip: auto; overflow: visible;
  }}
  .sidebar-nav {{ flex-direction: row; flex-wrap: wrap; flex: 1; }}
}}
@media print {{
  .sidebar, .toolbar, .sidebar-toggle {{ display: none !important; }}
  body {{ background: #fff; color: #111; }}
  .report-card {{ box-shadow: none; border-color: #ddd; break-inside: avoid; }}
}}
"""

    from tunde_agent.services.research_orchestration.designer_agent import chart_js_config_from_metrics

    if not metrics_html and chart_js_config_from_metrics(cm_dict, theme_topic=topic):
        metrics_html = (
            '<p class="body-prose">Numeric series from the analyst power the chart below '
            "(interactive + static export).</p>"
        )

    visuals_inner = (chartjs_card or "") + charts_section
    if not visuals_inner.strip():
        visuals_inner = (
            '<article class="report-card"><p class="body-prose" style="color:var(--muted)">'
            "No structured numeric series was available to chart for this run.</p></article>"
        )

    scripts = f"""
<script>
function copySummary() {{
  const el = document.getElementById('tunde-summary-hold');
  const text = el ? el.value : '';
  navigator.clipboard.writeText(text).then(() => alert('Summary copied.')).catch(() => {{
    if (!el) return;
    el.style.display = 'block'; el.select(); document.execCommand('copy'); el.style.display = 'none';
    alert('Summary copied.');
  }});
}}
function shareReport() {{
  const url = document.body.dataset.pageUrl || window.location.href;
  if (navigator.share) {{
    navigator.share({{ title: document.title, url }}).catch(() => navigator.clipboard.writeText(url));
  }} else {{
    navigator.clipboard.writeText(url).then(() => alert('Link copied.'));
  }}
}}
function downloadPdf() {{ window.print(); }}
document.addEventListener('DOMContentLoaded', function() {{
  var ph = document.body.getAttribute('data-ph-uri');
  if (ph) {{
    document.querySelectorAll('img.tunde-img-fallback').forEach(function(el) {{
      el.addEventListener('error', function() {{
        this.onerror = null;
        this.src = ph;
      }});
    }});
  }}
  var btn = document.getElementById('tunde-sidebar-toggle');
  var side = document.getElementById('tunde-sidebar');
  if (btn && side) {{
    btn.addEventListener('click', function() {{
      var collapsed = side.getAttribute('data-collapsed') === 'true';
      side.setAttribute('data-collapsed', collapsed ? 'false' : 'true');
      btn.setAttribute('aria-expanded', collapsed ? 'true' : 'false');
      btn.textContent = collapsed ? '⟨' : '⟩';
    }});
  }}
}});
</script>
"""
    scripts_full = scripts + (chartjs_tail or "")

    nav_entries: list[tuple[str, str, str]] = [("#overview", "📋", "Overview")]
    if hero_ill_html:
        nav_entries.append(("#hero-art", "🎨", "Hero"))
    nav_entries.extend(
        [
            ("#summary", "📑", "Research"),
            ("#metrics", "📊", "Metrics"),
        ]
    )
    if feasibility_block:
        nav_entries.append(("#feasibility", "🧭", "Plan"))
    nav_entries.append(("#visuals", "📈", "Charts"))
    if vision_block:
        nav_entries.append(("#vision", "👁", "Vision"))
    if gp_section:
        nav_entries.append(("#global", "🌍", "Global"))
    nav_entries.append(("#insights", "💡", "Insights"))
    if ml_block:
        nav_entries.append(("#multilingual", "🌐", "Locales"))
    nav_entries.append(("#sources", "🔗", "Sources"))
    nav_entries.append(("#illustrations", "✨", "Art"))

    nav_html = "".join(
        f'<a class="nav-item" href="{href}"><span class="nav-ic" aria-hidden="true">{ic}</span>'
        f'<span class="nav-label">{lab}</span></a>'
        for href, ic, lab in nav_entries
    )

    main_inner = f"""
<header class="hero-band" id="overview">
  <h1>{_esc(topic[:320])}</h1>
  <p class="tagline">{tagline}</p>
  <div class="toolbar no-print">
    <button type="button" class="btn" onclick="copySummary()">Copy summary</button>
    <button type="button" class="btn btn--ghost" onclick="shareReport()">Share link</button>
    <button type="button" class="btn btn--ghost" onclick="downloadPdf()">Export PDF</button>
  </div>
</header>
{hero_ill_html}
<section id="summary" class="report-card">
  <header class="card-head"><h2 class="section-title">Executive overview</h2></header>
  <p class="body-prose">{exec_sum or "—"}</p>
</section>
<section id="metrics" class="report-card">
  <header class="card-head"><h2 class="section-title">Key metrics</h2></header>
  {metrics_html or '<p class="body-prose" style="color:var(--muted)">Structured metrics appear when chart data is available.</p>'}
</section>
{vision_block}
{gp_section}
<section id="insights" class="report-card">
  <header class="card-head"><h2 class="section-title">Detailed insights</h2></header>
  <ul class="ins-list">{det_items}</ul>
</section>
{feasibility_block}
<section id="visuals" class="section full-bleed">
  <h2 class="section-title" style="margin-bottom:20px;padding-left:8px;">Data visuals</h2>
  {visuals_inner}
</section>
{ml_block}
<section id="sources" class="report-card">
  <header class="card-head"><h2 class="section-title">Sources</h2></header>
  <ul class="ins-list">{src_items or '<li class="ins-li">Refer to primary research URL in mission metadata.</li>'}</ul>
</section>
<section id="illustrations" class="section full-bleed">
  <h2 class="section-title" style="margin-bottom:20px;padding-left:8px;">Visual context</h2>
  {ill_section_inner or '<article class="report-card"><p class="body-prose" style="color:var(--muted)">No additional illustrations.</p></article>'}
</section>
"""

    chart_cdn_hint = ""
    if chartjs_tail:
        chart_cdn_hint = '<link rel="dns-prefetch" href="https://cdn.jsdelivr.net"/>\n<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin/>\n'

    return f"""<!DOCTYPE html>
<html lang="{lang}" dir="{'rtl' if rtl else 'ltr'}">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="theme-color" content="#070a12"/>
<title>{_esc(topic[:120])} · Tunde AI Agent</title>
{chart_cdn_hint}<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Montserrat:wght@600;700;800&display=swap" rel="stylesheet"/>
<style>{css}</style>
</head>
<body data-page-url="{via}" data-ph-uri="{ph_attr}">
<textarea id="tunde-summary-hold" hidden>{summary_for_ta}</textarea>
<div class="app-frame">
  <aside class="sidebar no-print" id="tunde-sidebar" data-collapsed="false" aria-label="Report sections">
    <button type="button" class="sidebar-toggle" id="tunde-sidebar-toggle" aria-expanded="true" title="Toggle sidebar">⟨</button>
    <nav class="sidebar-nav" aria-label="On this page">{nav_html}</nav>
  </aside>
  <div class="content-canvas">
    <div class="content-inner">
      {main_inner}
      <footer class="site-footer no-print">Copyright © 2026 Tunde AI Agent. All rights reserved. Developed by Wael Safan | NewFinity.</footer>
    </div>
  </div>
</div>
{scripts_full}
</body>
</html>
"""
