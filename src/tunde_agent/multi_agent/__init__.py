"""
Multi-agent coordination layer (MAS).

The **orchestrator** is the research pipeline plus Telegram/FastAPI surfaces; specialized
**agents** map to concrete modules (search/extraction, analyst/verifier, UI formatting, custom HTML).

See ``model_router`` for routing and ``docs/02_web_app_backend/multi_agent.md`` for the full map.
"""

from __future__ import annotations

from tunde_agent.multi_agent.coordinator import MultiAgentCoordinator
from tunde_agent.multi_agent.model_router import TaskKind, resolve_llm_client

__all__ = ["MultiAgentCoordinator", "TaskKind", "resolve_llm_client"]
