"""
Orchestrator (Tunde) — intent routing and delegation to specialized agents.

**Infrastructure (core):** FastAPI lifespan, DB, browser tools, ``run_post_approval_pipeline``,
Telegram poller, approval rows — unchanged by agent labels.

**Agent mapping (conceptual → modules):**

- **Research agent** — URL discovery, page extraction, vision reads:
  ``research_orchestration.search_agent``, ``extraction_agent``, ``vision_agent``.
- **Analyst agent** — Planning, synthesis, verification, quality gate JSON:
  ``research_orchestration.sub_agents`` (master / analyst / verifier) + ``orchestrator``.
- **UI/UX agent** — Telegram presentation, saved report HTML, custom landing generation:
  ``telegram_markdown_v2``, ``report_html``, ``generation_service``, ``agents.uiux_agent``.

Use ``resolve_llm_client`` + ``task_kind_for_research_role`` for model choice per sub-call.
"""

from __future__ import annotations

from dataclasses import dataclass

from tunde_agent.config.settings import Settings


@dataclass(frozen=True)
class MultiAgentCoordinator:
    """
    Stable façade for “orchestrator delegates to sub-agents”.

    Heavy work remains in ``mission_service`` + ``research_orchestration.orchestrator``; this type
    documents boundaries and can grow with explicit methods (e.g. ``plan_research``, ``render_ui``).
    """

    settings: Settings

    def describe_stack(self) -> str:
        return (
            "Tunde MAS: Research (fetch+vision) → Analyst (plan/synthesize/verify) → "
            "UI/UX (Telegram + HTML + optional LLM landing)."
        )
