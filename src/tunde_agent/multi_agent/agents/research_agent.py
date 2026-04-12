"""
Research agent — deep source gathering (not the LLM analyst).

Owns: programmatic + browser discovery, parallel extraction, optional vision over figures.
Code: ``tunde_agent.services.research_orchestration.search_agent``,
``extraction_agent``, ``vision_agent``, orchestrator phases **before** analyst.
"""

from __future__ import annotations

from dataclasses import dataclass

from tunde_agent.config.settings import Settings


@dataclass(frozen=True)
class ResearchAgent:
    """Namespace marker for documentation and future explicit APIs."""

    settings: Settings
