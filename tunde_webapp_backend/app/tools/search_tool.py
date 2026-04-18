from __future__ import annotations

import logging
import os
from typing import Any

import httpx

from tunde_webapp_backend.app.tools.base import ResearchResult, ToolSource

logger = logging.getLogger(__name__)

_TAVILY_URL = "https://api.tavily.com/search"
_SERPER_URL = "https://google.serper.dev/search"


async def search_web(query: str, *, max_results: int = 5) -> ResearchResult:
    """
    Live web research: Tavily (preferred) → Serper fallback.
    Keys: TAVILY_API_KEY or SERPER_API_KEY (+ existing tunde_agent Settings for Serper).
    """
    q = (query or "").strip()
    if not q:
        return ResearchResult(query="", provider="none")

    tavily_key = (os.getenv("TAVILY_API_KEY") or "").strip()
    if tavily_key:
        try:
            return await _tavily_search(q, tavily_key, max_results=max_results)
        except Exception as exc:
            logger.warning("Tavily search failed: %s", str(exc)[:200])

    try:
        return await _serper_search(q, max_results=max_results)
    except Exception as exc:
        logger.warning("Serper search failed: %s", str(exc)[:200])
        return ResearchResult(query=q, answer="", sources=[], provider="error")


async def _tavily_search(query: str, api_key: str, *, max_results: int) -> ResearchResult:
    payload: dict[str, Any] = {
        "api_key": api_key,
        "query": query,
        "search_depth": "basic",
        "max_results": max(1, min(max_results, 10)),
        "include_answer": True,
    }
    async with httpx.AsyncClient(timeout=60.0) as client:
        r = await client.post(_TAVILY_URL, json=payload)
        r.raise_for_status()
        data = r.json()

    answer = ""
    if isinstance(data.get("answer"), str):
        answer = data["answer"].strip()

    sources: list[ToolSource] = []
    for row in data.get("results") or []:
        if not isinstance(row, dict):
            continue
        title = str(row.get("title") or "").strip()
        url = str(row.get("url") or "").strip()
        snippet = str(row.get("content") or row.get("snippet") or "").strip()
        if url:
            sources.append(ToolSource(title=title or url, url=url, snippet=snippet))

    return ResearchResult(query=query, answer=answer, sources=sources, provider="tavily")


async def _serper_search(query: str, *, max_results: int) -> ResearchResult:
    from tunde_agent.config.settings import get_settings

    settings = get_settings()
    api_key = (settings.serper_api_key or "").strip()
    if not api_key:
        raise RuntimeError("SERPER_API_KEY not configured")

    payload: dict[str, object] = {"q": query, "num": max(1, min(max_results, 10))}
    headers = {"X-API-KEY": api_key, "Content-Type": "application/json"}
    async with httpx.AsyncClient(timeout=45.0) as client:
        r = await client.post(_SERPER_URL, json=payload, headers=headers)
        r.raise_for_status()
        data = r.json()

    sources: list[ToolSource] = []
    organic = data.get("organic")
    if isinstance(organic, list):
        for row in organic:
            if not isinstance(row, dict):
                continue
            title = str(row.get("title") or "").strip()
            link = str(row.get("link") or "").strip()
            snippet = str(row.get("snippet") or "").strip()
            if link:
                sources.append(ToolSource(title=title or link, url=link, snippet=snippet))

    return ResearchResult(query=query, answer="", sources=sources, provider="serper")


def format_research_for_llm(result: ResearchResult) -> str:
    if not result.sources and not result.answer:
        return (
            "(No live web results were retrieved. The user may need to set TAVILY_API_KEY "
            "or SERPER_API_KEY, or the query returned no hits.)"
        )
    lines: list[str] = ["[Live web research]", f"Query: {result.query}", f"Provider: {result.provider}"]
    if result.answer:
        lines.append(f"Answer (provider summary): {result.answer}")
    lines.append("Sources:")
    for i, s in enumerate(result.sources[:8], 1):
        lines.append(f"  {i}. {s.title}")
        lines.append(f"     URL: {s.url}")
        if s.snippet:
            lines.append(f"     {s.snippet[:400]}")
    return "\n".join(lines)
