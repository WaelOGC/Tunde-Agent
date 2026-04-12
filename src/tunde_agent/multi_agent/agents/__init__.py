"""Specialized agent façades (Research, Analyst, UI/UX)."""

from __future__ import annotations

from tunde_agent.multi_agent.agents.analyst_agent import AnalystAgent
from tunde_agent.multi_agent.agents.research_agent import ResearchAgent
from tunde_agent.multi_agent.agents.uiux_agent import UIUXAgent

__all__ = ["AnalystAgent", "ResearchAgent", "UIUXAgent"]
