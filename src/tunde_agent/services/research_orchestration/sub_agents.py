"""
Sync LLM worker calls (invoked via asyncio.to_thread from the orchestrator).
"""

from __future__ import annotations

import json
import logging
from typing import Any

from tunde_agent.config.settings import Settings
from tunde_agent.services.llm_service import GeminiClient
from tunde_agent.services.research_orchestration import agent_prompts as prompts
from tunde_agent.services.research_orchestration.json_util import parse_llm_json_for_agent

logger = logging.getLogger(__name__)


def _client(settings: Settings) -> GeminiClient:
    return GeminiClient(settings.gemini_api_key, model=settings.gemini_model)


def llm_json(settings: Settings, system: str, user: str, *, role: str) -> dict[str, Any]:
    raw = _client(settings).complete(system, user)
    return parse_llm_json_for_agent(raw, role)


def master_plan(settings: Settings, topic: str, source_urls: list[str]) -> dict[str, Any]:
    user = (
        f"Research goal / question:\n{topic.strip()}\n\n"
        f"Resolved source URLs (visit order):\n"
        + "\n".join(f"- {u}" for u in source_urls[:12])
        + "\n\n"
        + prompts.MASTER_PLANNER_SUFFIX
    )
    return llm_json(settings, prompts.MASTER_ORCHESTRATOR_SYSTEM, user, role="master_plan")


def _output_lang_instruction(lang: str) -> str:
    l = (lang or "en").strip().lower()
    if l.startswith("ar"):
        return (
            "Write executive_summary, insights, global_perspective, and all other user-facing string fields "
            "in Modern Standard Arabic. Keep proper names, product names, URLs, and untranslated technical "
            "tokens where needed for accuracy."
        )
    return (
        "Write executive_summary, insights, global_perspective, and all other user-facing string fields "
        "in clear English."
    )


def analyst_run(
    settings: Settings,
    topic: str,
    plan: dict[str, Any],
    packed: str,
    index_lines: str,
    revision_focus: str | None,
    *,
    vision_appendix: str = "",
    output_language: str = "en",
) -> dict[str, Any]:
    plan_json = json.dumps(plan, ensure_ascii=False, separators=(",", ":"))[:12_000]
    rev = ""
    if revision_focus and revision_focus.strip():
        rev = (
            "\n\nRevision request from quality gate (address explicitly in insights and summary):\n"
            f"{revision_focus.strip()[:4000]}\n"
        )
    va = (vision_appendix or "").strip()
    vision_block = (
        "Vision / figure extraction (JSON):\n" + va[:14_000]
        if va
        else "(No structured vision extraction for this run — rely on text sources.)"
    )
    block = prompts.ANALYST_USER_SCHEMA.format(
        output_lang_instruction=_output_lang_instruction(output_language),
        plan_json=plan_json,
        index_lines=index_lines,
        vision_block=vision_block,
        packed=packed[:_safe_pack_limit(settings)],
        revision_block=rev,
    )
    return llm_json(settings, prompts.ANALYST_SYSTEM, block, role="analyst")


def _safe_pack_limit(settings: Settings) -> int:
    _ = settings
    return 52_000


def verifier_run(
    settings: Settings,
    topic: str,
    packed: str,
    analyst: dict[str, Any],
) -> dict[str, Any]:
    user = prompts.VERIFIER_USER_TEMPLATE.format(
        topic=topic.strip(),
        packed=packed[:_safe_pack_limit(settings)],
        analyst_json=json.dumps(analyst, ensure_ascii=False, separators=(",", ":"))[:16_000],
    )
    return llm_json(settings, prompts.VERIFIER_SYSTEM, user, role="verifier")


def master_quality_gate(
    settings: Settings,
    topic: str,
    analyst: dict[str, Any],
    verifier: dict[str, Any],
    *,
    designer_context: str = "",
) -> dict[str, Any]:
    suffix = prompts.MASTER_GATE_SUFFIX.format(
        designer_context=(designer_context.strip() or "(none)"),
    )
    user = (
        f"Topic:\n{topic.strip()}\n\n"
        f"Analyst draft:\n{json.dumps(analyst, ensure_ascii=False, indent=2)[:24_000]}\n\n"
        f"Verifier audit:\n{json.dumps(verifier, ensure_ascii=False, indent=2)[:24_000]}\n\n"
        + suffix
    )
    return llm_json(settings, prompts.MASTER_ORCHESTRATOR_SYSTEM, user, role="master_gate")


