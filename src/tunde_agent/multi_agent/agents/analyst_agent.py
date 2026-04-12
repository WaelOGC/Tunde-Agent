"""
Analyst agent — structured reasoning over evidence (feasibility, markets, trends).

Owns: master plan JSON, analyst synthesis JSON, verifier audit, master gate, extractor JSON,
designer LLM JSON. Routed LLM calls prefer DeepSeek for strict JSON where keys exist.
Code: ``tunde_agent.services.research_orchestration.sub_agents`` + ``orchestrator``.
"""

from __future__ import annotations

from dataclasses import dataclass

from tunde_agent.config.settings import Settings


@dataclass(frozen=True)
class AnalystAgent:
    """Namespace marker for documentation and future explicit APIs."""

    settings: Settings
