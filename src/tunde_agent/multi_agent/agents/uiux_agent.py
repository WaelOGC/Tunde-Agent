"""
UI/UX agent — presentation layer for Telegram HTML, default report shells, and custom landing pages.

Owns: ``format_telegram_mission_teaser_html`` (rich briefing), future export styling hooks,
``generation_service`` (LLM-built multi-section HTML from operator briefs).
"""

from __future__ import annotations

from typing import Any, Sequence

from telegram_agent_core.services.telegram_markdown_v2 import format_telegram_mission_teaser_html


class UIUXAgent:
    """Delivery formatting entrypoint for the MAS."""

    @staticmethod
    def format_mission_teaser_html(
        topic: str,
        *,
        tagline: str | None,
        executive_summary: str,
        insights: Sequence[str],
        report_url: str | None,
        chart_metrics: dict[str, Any] | None = None,
    ) -> str:
        """Telegram HTML teaser with optional numeric micro-chart."""
        return format_telegram_mission_teaser_html(
            topic,
            tagline=tagline,
            executive_summary=executive_summary,
            insights=insights,
            report_url=report_url,
            chart_metrics=chart_metrics,
        )
