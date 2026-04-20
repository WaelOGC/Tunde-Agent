"""
Business Agent — market/competitor intelligence, SWOT, simulations, accounting helpers.

Combines optional live web search (Tavily/Serper) with structured JSON from the LLM.
"""

from __future__ import annotations

import asyncio
import csv
import io
import json
import logging
import re
import uuid
from typing import Any

from tunde_agent.config.settings import get_settings
from tunde_agent.multi_agent.model_router import TaskKind, resolve_llm_client
from tunde_agent.services.llm_service import LLMError

from tunde_webapp_backend.app.tools.search_tool import format_research_for_llm, search_web

logger = logging.getLogger(__name__)

BUSINESS_JSON_SYSTEM = """You are a senior strategy consultant. Using the user's niche/business QUERY and optional LIVE WEB NOTES, output ONE JSON object ONLY (no markdown fences) with this exact shape and keys (arrays may be empty but must exist):

{
  "confidence": "high|medium|low",
  "narrative_summary": "markdown string, 250-500 words: exec summary + how to use the canvas sections",
  "market_analysis": {
    "niche": "string",
    "trends": [{"title": "", "detail": ""}],
    "market_size_notes": "",
    "opportunities": ["..."],
    "risks": ["..."]
  },
  "competitor_analysis": {
    "players": [{"name": "", "strengths": [""], "weaknesses": [""], "notes": ""}]
  },
  "competitor_radar": {
    "axes": {"x": "Price position (low to high)", "y": "Differentiation / quality"},
    "points": [{"name": "", "x": 0-100, "y": 0-100, "share_hint": ""}]
  },
  "review_sentiment": {
    "summary": "",
    "gaps": ["unmet needs / complaints themes"],
    "polarity": "mixed|positive|negative"
  },
  "swot": {
    "strengths": [""],
    "weaknesses": [""],
    "opportunities": [""],
    "threats": [""]
  },
  "scenario_simulation": {
    "assumptions": [""],
    "pl_rows": [["Period", "Revenue", "COGS", "GrossProfit", "OpEx", "EBIT", "Tax", "NetIncome"]]
  },
  "market_cap": {
    "niche_value_band": "plain language band, e.g. $XM–$YM",
    "methodology": "how estimated",
    "drivers": [""]
  },
  "smart_accounting": {
    "quarterly_tax_report_stub": {"Q1": "", "Q2": "", "Q3": "", "Q4": ""},
    "notes": "disclaimer: not tax advice; illustrative"
  },
  "future_outlook": {
    "horizon_years": 5,
    "milestones": [{"year": 1, "title": "", "detail": ""}]
  },
  "canvas_html": "<section>...</section> concise dark-theme glassmorphism HTML snippet summarizing the analysis (no external scripts)"
}

Rules:
- Never invent precise public company financials; use ranges and qualifiers.
- radar.points: at least 3 entries if competitors known, else use generic archetypes (Incumbent, Challenger, Niche).
- scenario_simulation.pl_rows: include header row + 4 quarterly periods with plausible relative numbers (use $ and % where helpful).
- If LIVE WEB NOTES are empty, rely on general knowledge and set confidence accordingly.
"""


def _strip_json_fence(text: str) -> str:
    s = (text or "").strip()
    m = re.match(r"^```(?:json)?\s*([\s\S]*?)\s*```$", s, re.IGNORECASE)
    if m:
        return m.group(1).strip()
    return s


def _default_response(query: str, *, session_id: uuid.UUID, search_status: str) -> dict[str, Any]:
    return {
        "session_id": str(session_id),
        "query": query.strip(),
        "confidence": "low",
        "search_status": search_status,
        "narrative_summary": (
            f"## Business snapshot: {query.strip()[:120]}\n\n"
            "Structured sections below are running in **fallback mode** because synthesis "
            "or search data was incomplete. Re-run with a narrower niche or verify API keys."
        ),
        "market_analysis": {
            "niche": query.strip()[:200],
            "trends": [],
            "market_size_notes": "Unavailable — refine query or enable live search.",
            "opportunities": [],
            "risks": ["Data quality / incomplete inputs"],
        },
        "competitor_analysis": {"players": []},
        "competitor_radar": {
            "axes": {"x": "Price", "y": "Differentiation"},
            "points": [
                {"name": "Incumbent", "x": 70, "y": 60, "share_hint": "High"},
                {"name": "Challenger", "x": 45, "y": 75, "share_hint": "Growing"},
                {"name": "Niche specialist", "x": 35, "y": 85, "share_hint": "Low volume"},
            ],
        },
        "review_sentiment": {"summary": "Insufficient review signals.", "gaps": [], "polarity": "mixed"},
        "swot": {
            "strengths": ["—"],
            "weaknesses": ["—"],
            "opportunities": ["—"],
            "threats": ["Information gaps"],
        },
        "scenario_simulation": {
            "assumptions": ["Fallback linear model"],
            "pl_rows": [
                ["Period", "Revenue", "COGS", "GrossProfit", "OpEx", "EBIT", "Tax", "NetIncome"],
                ["Q1", "$250k", "42%", "$145k", "28%", "$75k", "21%", "$59k"],
                ["Q2", "$265k", "42%", "$154k", "28%", "$80k", "21%", "$63k"],
                ["Q3", "$281k", "42%", "$163k", "28%", "$85k", "21%", "$67k"],
                ["Q4", "$298k", "42%", "$173k", "28%", "$91k", "21%", "$72k"],
            ],
        },
        "market_cap": {
            "niche_value_band": "Not estimated (fallback)",
            "methodology": "n/a",
            "drivers": [],
        },
        "smart_accounting": {
            "quarterly_tax_report_stub": {"Q1": "—", "Q2": "—", "Q3": "—", "Q4": "—"},
            "notes": "Illustrative only — not tax or legal advice.",
        },
        "future_outlook": {
            "horizon_years": 5,
            "milestones": [{"year": 1, "title": "Validate ICP", "detail": "Tighten positioning"}],
        },
        "canvas_html": (
            "<section style=\"padding:1rem;border-radius:12px;border:1px solid rgba(148,163,184,.25);"
            "background:rgba(15,23,42,.65)\"><h2 style=\"color:#e2e8f0\">Business Agent (fallback)</h2>"
            f"<p style=\"color:#94a3b8\">{query[:280]}</p></section>"
        ),
    }


def _merge_llm_into_base(base: dict[str, Any], data: dict[str, Any]) -> dict[str, Any]:
    for key in (
        "narrative_summary",
        "market_analysis",
        "competitor_analysis",
        "competitor_radar",
        "review_sentiment",
        "swot",
        "scenario_simulation",
        "market_cap",
        "smart_accounting",
        "future_outlook",
        "canvas_html",
    ):
        if key in data and data[key] is not None:
            base[key] = data[key]
    conf = data.get("confidence")
    if isinstance(conf, str) and conf.strip():
        base["confidence"] = conf.strip().lower()[:12]
    return base


def run_scenario_simulation(
    *,
    label: str,
    base_revenue: float,
    revenue_growth_yoy: float,
    cogs_ratio: float,
    opex_ratio: float,
    tax_rate: float,
    periods: int,
) -> dict[str, Any]:
    rows: list[list[str]] = [
        ["Period", "Revenue", "COGS", "GrossProfit", "OpEx", "EBIT", "Tax", "NetIncome"],
    ]
    rev = float(base_revenue)
    growth = float(revenue_growth_yoy)
    chart_revenue: list[float] = []
    chart_net: list[float] = []
    warnings: list[str] = []
    if cogs_ratio + opex_ratio >= 0.98:
        warnings.append("COGS + OpEx ratios are very high — margins will be thin.")

    step_mult = (1.0 + growth) ** (1.0 / max(periods, 1))
    for i in range(periods):
        period = f"Q{i + 1}"
        cogs = rev * cogs_ratio
        gp = rev - cogs
        opex = rev * opex_ratio
        ebit = gp - opex
        tax = max(ebit, 0) * tax_rate
        net = ebit - tax
        rows.append(
            [
                period,
                f"${rev:,.0f}",
                f"{cogs_ratio * 100:.1f}%",
                f"${gp:,.0f}",
                f"{opex_ratio * 100:.1f}%",
                f"${ebit:,.0f}",
                f"{tax_rate * 100:.0f}%",
                f"${net:,.0f}",
            ]
        )
        chart_revenue.append(round(rev, 2))
        chart_net.append(round(net, 2))
        rev *= step_mult

    assumptions = [
        f"Starting revenue: ${base_revenue:,.0f}",
        f"Growth (blended across {periods} periods): {revenue_growth_yoy * 100:.1f}% YoY equivalent",
        f"COGS ratio: {cogs_ratio * 100:.1f}% · OpEx ratio: {opex_ratio * 100:.1f}% · Tax on positive EBIT: {tax_rate * 100:.0f}%",
    ]
    return {
        "label": label.strip() or "Scenario",
        "assumptions": assumptions,
        "pl_rows": rows,
        "chart_series": {"labels": [r[0] for r in rows[1:]], "revenue": chart_revenue, "net_income": chart_net},
        "warnings": warnings,
    }


def parse_accounting_upload(filename: str, raw: bytes) -> dict[str, Any]:
    """Parse CSV/TSV/plain lines into buckets + a quarterly tax stub (illustrative)."""
    text = raw.decode("utf-8", errors="replace")
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    rows_iter: list[list[str]] = []
    warnings: list[str] = []

    fname = (filename or "upload").lower()
    try:
        if fname.endswith(".csv") or "," in (lines[0] if lines else ""):
            reader = csv.reader(io.StringIO(text))
            rows_iter = [r for r in reader if any((c or "").strip() for c in r)]
        elif "\t" in (lines[0] if lines else ""):
            reader = csv.reader(io.StringIO(text), delimiter="\t")
            rows_iter = [r for r in reader if any((c or "").strip() for c in r)]
    except Exception as exc:
        logger.warning("accounting csv parse: %s", str(exc)[:120])
        rows_iter = []

    if not rows_iter:
        for ln in lines:
            parts = re.split(r"[,\t;]", ln)
            rows_iter.append([p.strip() for p in parts if p.strip()])

    total = 0.0
    parsed = 0
    for r in rows_iter[1:] if len(rows_iter) > 1 and not rows_iter[0][0].lower().startswith("total") else rows_iter:
        if not r:
            continue
        amt_raw = r[-1].replace(",", "").replace("$", "").strip()
        try:
            total += float(amt_raw)
            parsed += 1
        except ValueError:
            continue

    est_tax = max(total, 0) * 0.25
    quarterly = {
        "Q1": f"Est. taxable base (partial): ${total * 0.22:,.0f} · alloc tax ~${est_tax * 0.22:,.0f}",
        "Q2": f"Est. taxable base (partial): ${total * 0.24:,.0f} · alloc tax ~${est_tax * 0.24:,.0f}",
        "Q3": f"Est. taxable base (partial): ${total * 0.26:,.0f} · alloc tax ~${est_tax * 0.26:,.0f}",
        "Q4": f"Est. taxable base (partial): ${total * 0.28:,.0f} · alloc tax ~${est_tax * 0.28:,.0f}",
    }
    if parsed == 0:
        warnings.append("No numeric amounts detected — upload CSV with an amount column.")

    return {
        "parsed_lines": parsed,
        "total_expense_signal": total,
        "quarterly_summary": [{"quarter": k, "line": v} for k, v in quarterly.items()],
        "tax_projection_notes": (
            "Illustrative quarterly allocation only — consult a qualified accountant / tax authority."
        ),
        "warnings": warnings,
    }


async def run_business_research(
    query: str,
    *,
    session_id: uuid.UUID | None,
    include_live_search: bool,
) -> dict[str, Any]:
    q = (query or "").strip()
    if not q:
        raise ValueError("query must be non-empty")

    sid = session_id or uuid.uuid4()
    search_status = "unavailable"
    web_block = ""

    if include_live_search:
        try:
            r1 = await search_web(f"{q} market size TAM trends", max_results=5)
            r2 = await search_web(f"{q} competitors reviews comparison", max_results=5)
            s1 = format_research_for_llm(r1)
            s2 = format_research_for_llm(r2)
            if r1.provider == "error" and r2.provider == "error":
                search_status = "unavailable"
            elif "No live web results" in s1 and "No live web results" in s2:
                search_status = "unavailable"
            else:
                search_status = "ok" if r1.sources or r2.sources else "partial"
            web_block = "\n\n".join([s1, s2])
        except Exception as exc:
            logger.warning("business search aggregate failed: %s", str(exc)[:200])
            search_status = "unavailable"
            web_block = "(Live search failed — continuing with model knowledge only.)"
    else:
        search_status = "skipped"

    user_prompt = f"QUERY:\n{q}\n\nLIVE WEB NOTES:\n{web_block or '(none)'}"

    settings = get_settings()
    client = resolve_llm_client(settings, TaskKind.STRUCTURED_JSON)
    base = _default_response(q, session_id=sid, search_status=search_status)

    try:
        raw = await asyncio.to_thread(client.complete, BUSINESS_JSON_SYSTEM, user_prompt)
    except LLMError:
        raise
    except Exception as exc:
        logger.exception("Business agent LLM failed")
        raise LLMError(str(exc)) from exc

    try:
        data = json.loads(_strip_json_fence(raw))
        if isinstance(data, dict):
            base = _merge_llm_into_base(base, data)
    except (json.JSONDecodeError, TypeError) as exc:
        logger.warning("Business agent JSON parse failed: %s", str(exc)[:160])

    base["session_id"] = str(sid)
    base["query"] = q
    return base
