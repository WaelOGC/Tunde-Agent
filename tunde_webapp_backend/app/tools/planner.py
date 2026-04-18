from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass

from tunde_webapp_backend.app.tools.data_analysis_tool import _looks_like_tabular

logger = logging.getLogger(__name__)

_ALLOWED = frozenset({"web_research", "data_analysis", "image_generation"})
_TOOL_ORDER = ("web_research", "data_analysis", "image_generation")

# Hard guards: if the user clearly asked for web or image work, union these tools regardless of router LLM output.
_FORCE_WEB_RX = re.compile(
    r"\b(search|research|compare|comparison|lookup)\b|look\s+up|\s+vs\.?\s+|\bversus\b",
    re.IGNORECASE,
)
_FORCE_IMAGE_RX = re.compile(
    r"\b(image|images|infographic|diagram|illustration|chart|visual)\b",
    re.IGNORECASE,
)


@dataclass(slots=True)
class ToolPlan:
    """Ordered tool pipeline decided by LLM JSON routing + heuristics (function-calling style)."""

    tools: list[str]
    search_query: str
    image_prompt: str
    data_text: str
    tool_use: bool = False


def _normalize_order(tools: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for t in _TOOL_ORDER:
        if t in tools and t not in seen:
            out.append(t)
            seen.add(t)
    return out


_IMAGE_HINTS = (
    "infographic",
    "include an infographic",
    "with an infographic",
    "generate an infographic",
    "image",
    "diagram",
    "picture",
    "illustration",
    "draw ",
    "generate an image",
    "generate a picture",
    "visual",
    "banner",
    "poster",
    "with an image",
    "include an image",
)

_REPORT_HINTS = (
    "comprehensive",
    "research report",
    "perform a comprehensive",
    "write a report",
    "deep dive",
    "whitepaper",
)

_COMPARISON_HINTS = (
    "comparison",
    "compare ",
    " vs ",
    " versus ",
    "side by side",
    "stack up",
    "head to head",
)

_TRENDS_VISUAL_HINTS = (
    "trends",
    "trend analysis",
    "market trends",
    "executive summary",
    "key takeaways",
    "at a glance",
    "overview of the market",
)

_HEURISTIC_HINTS = (
    "search",
    "look up",
    "lookup",
    "latest",
    "news",
    "current events",
    "what happened",
    "who is",
    "find ",
    "compare ",
    "price of",
    "trends",
)


def _apply_keyword_tool_guards(user_text: str, tools: list[str]) -> list[str]:
    """Force planner tools when user language clearly requires web research or image generation."""
    ut = user_text or ""
    merged = list(dict.fromkeys([*tools]))
    if _FORCE_WEB_RX.search(ut) and "web_research" not in merged:
        merged.append("web_research")
    if _FORCE_IMAGE_RX.search(ut) and "image_generation" not in merged:
        merged.append("image_generation")
    return _normalize_order(merged)


def _heuristic_plan(user_text: str) -> ToolPlan:
    t = (user_text or "").lower().strip()
    tools: list[str] = []
    if any(h in t for h in _HEURISTIC_HINTS) or any(h in t for h in _REPORT_HINTS):
        tools.append("web_research")
    if any(h in t for h in _COMPARISON_HINTS):
        if "web_research" not in tools:
            tools.append("web_research")
    if any(h in t for h in _TRENDS_VISUAL_HINTS) or (
        "summary" in t and any(k in t for k in ("report", "market", "trend", "outlook", "overview"))
    ):
        if "image_generation" not in tools:
            tools.append("image_generation")
    if any(h in t for h in _IMAGE_HINTS):
        tools.append("image_generation")
    if ("image" in t or "infographic" in t) and ("report" in t or "summary" in t):
        if "image_generation" not in tools:
            tools.append("image_generation")
    if _looks_like_tabular(user_text or ""):
        tools.append("data_analysis")
    tools = _apply_keyword_tool_guards(user_text or "", tools)
    ut = (user_text or "").strip()
    return ToolPlan(
        tools=tools,
        search_query=ut[:500] if "web_research" in tools else "",
        image_prompt=ut[:800] if "image_generation" in tools else "",
        data_text=ut if "data_analysis" in tools else "",
        tool_use=bool(tools),
    )


def merge_plan_with_heuristic(plan: ToolPlan, user_text: str) -> ToolPlan:
    """Union LLM plan with keyword heuristics so image/research steps are not dropped."""
    h = _heuristic_plan(user_text)
    combined = list(dict.fromkeys([*plan.tools, *h.tools]))
    merged_tools = [t for t in _TOOL_ORDER if t in combined]
    ut = (user_text or "").strip()
    sq = (plan.search_query or "").strip() or h.search_query
    ip = (plan.image_prompt or "").strip() or h.image_prompt
    dt = (plan.data_text or "").strip() or h.data_text
    if "web_research" in merged_tools and not sq:
        sq = ut[:500]
    if "image_generation" in merged_tools and not ip:
        ip = ut[:800]
    if "data_analysis" in merged_tools and not dt and _looks_like_tabular(ut):
        dt = ut
    guarded = _apply_keyword_tool_guards(ut, merged_tools)
    if "web_research" in guarded and not sq.strip():
        sq = ut[:500]
    if "image_generation" in guarded and not ip.strip():
        ip = ut[:800]
    if "data_analysis" in guarded and not dt.strip() and _looks_like_tabular(ut):
        dt = ut
    return ToolPlan(
        tools=guarded,
        search_query=sq[:500],
        image_prompt=ip[:800],
        data_text=dt,
        tool_use=bool(guarded),
    )


def _strip_json_fence(text: str) -> str:
    s = (text or "").strip()
    m = re.match(r"^```(?:json)?\s*([\s\S]*?)\s*```$", s, re.IGNORECASE)
    if m:
        return m.group(1).strip()
    return s


async def plan_tools(user_text: str) -> ToolPlan:
    """
    Decide tool usage (LLM JSON “function routing” + heuristic fallback).
    """
    cleaned = (user_text or "").strip()
    if not cleaned:
        return ToolPlan(tools=[], search_query="", image_prompt="", data_text="", tool_use=False)

    system = (
        "You are a tool router for an autonomous AI agent. Output ONLY valid JSON, no markdown, no prose.\n"
        "Schema:\n"
        '{"tool_use":true,"tools":["web_research","image_generation"],"search_query":"string","image_prompt":"string",'
        '"data_text":"string"}\n'
        "Valid tool ids: web_research, data_analysis, image_generation.\n"
        "Set tool_use to true whenever tools is non-empty.\n"
        "Rules:\n"
        '- Include "web_research" when the user mentions search, research, compare, versus, or needs live web facts.\n'
        '- Include "web_research" for multi-item comparisons that need up-to-date facts (the assistant will '
        "answer with a markdown table in the web UI).\n"
        '- Include "image_generation" when the user mentions image, infographic, diagram, chart, or illustration.\n'
        '- Include "image_generation" for trend summaries, executive summaries, or “at a glance” overviews when '
        "a recap graphic would help.\n"
        '- Include "data_analysis" when the user pasted CSV/TSV or asks for summaries of tabular data.\n'
        "- search_query: concise web search string (<=120 chars).\n"
        "- image_prompt: short art direction for the image (<=200 chars) OR empty string.\n"
        "- data_text: paste of tabular data to analyze OR empty string if none.\n"
        '- If no tools apply: {"tool_use":false,"tools":[],"search_query":"","image_prompt":"","data_text":""}\n'
        "The server runs web_research and data_analysis first, then runs image_generation using tool output.\n"
        "If the user asks for an infographic, diagram, or generated image, you MUST include image_generation.\n"
        "If the user asks for a comprehensive research report or current facts, include web_research.\n"
    )
    try:
        from tunde_agent.config.settings import get_settings
        from tunde_agent.services.llm_service import build_llm_client

        settings = get_settings()
        provider = (settings.default_llm_provider or "gemini").strip().lower()
        client = build_llm_client(settings, provider)
        raw = client.complete(system, cleaned)
        data = json.loads(_strip_json_fence(raw))
        if not isinstance(data, dict):
            raise ValueError("not an object")
        tools_raw = data.get("tools")
        tools: list[str] = []
        if isinstance(tools_raw, list):
            for x in tools_raw:
                if isinstance(x, str) and x.strip() in _ALLOWED:
                    tools.append(x.strip())
        tools = _normalize_order(tools)

        def _s(key: str) -> str:
            v = data.get(key)
            return str(v).strip()[:2000] if isinstance(v, str) else ""

        sq = _s("search_query")[:500]
        ip = _s("image_prompt")[:800]
        dt = _s("data_text")
        if "web_research" in tools and not sq:
            sq = cleaned[:500]
        if "image_generation" in tools and not ip:
            ip = cleaned[:800]
        if "data_analysis" in tools and not dt and _looks_like_tabular(cleaned):
            dt = cleaned
        if not tools:
            return _heuristic_plan(cleaned)
        tu_raw = data.get("tool_use")
        tool_use = bool(tu_raw) if isinstance(tu_raw, bool) else bool(tools)
        plan = ToolPlan(
            tools=tools,
            search_query=sq,
            image_prompt=ip,
            data_text=dt,
            tool_use=tool_use,
        )
        merged = merge_plan_with_heuristic(plan, cleaned)
        return merged
    except Exception as exc:
        logger.debug("LLM tool plan failed, using heuristic: %s", str(exc)[:120])
        return _heuristic_plan(cleaned)
