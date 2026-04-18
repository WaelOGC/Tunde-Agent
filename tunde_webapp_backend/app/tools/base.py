from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable, Coroutine

ToolEmitFn = Callable[..., Coroutine[Any, Any, None]]


@dataclass(slots=True)
class ToolRunOutcome:
    """Result of pre-LLM tool phases (research + data). Image is appended later in the orchestrator."""

    context_text: str
    blocks: list[dict[str, Any]]
    plan: Any  # ToolPlan (avoid import cycle)


@dataclass(slots=True)
class ToolSource:
    title: str
    url: str
    snippet: str = ""


@dataclass(slots=True)
class ResearchResult:
    """Normalized output from a search provider."""

    query: str
    answer: str = ""
    sources: list[ToolSource] = field(default_factory=list)
    provider: str = ""
