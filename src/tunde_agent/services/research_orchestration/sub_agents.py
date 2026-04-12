"""
Sync LLM worker calls (invoked via asyncio.to_thread from the orchestrator).
"""

from __future__ import annotations

import json
import logging
from typing import Any

from tunde_agent.config.settings import Settings
from tunde_agent.multi_agent.model_router import resolve_llm_client, task_kind_for_research_role
from tunde_agent.services.research_orchestration import agent_prompts as prompts
from tunde_agent.services.research_orchestration.json_util import parse_llm_json_for_agent
from tunde_agent.services.research_orchestration.prompts.designer_prompt import (
    DESIGNER_SYSTEM,
    DESIGNER_USER_TEMPLATE,
)
from tunde_agent.services.research_orchestration.prompts.extractor_prompt import (
    EXTRACTOR_SYSTEM,
    EXTRACTOR_USER_TEMPLATE,
)

logger = logging.getLogger(__name__)


def llm_json(settings: Settings, system: str, user: str, *, role: str) -> dict[str, Any]:
    client = resolve_llm_client(settings, task_kind_for_research_role(role))
    raw = client.complete(system, user)
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


def _extractor_pack_limit(settings: Settings) -> int:
    _ = settings
    return 28_000


def extractor_run(
    settings: Settings,
    topic: str,
    packed: str,
    vision_appendix: str,
    output_language: str = "en",
) -> dict[str, Any]:
    vb = (vision_appendix or "").strip()[:10_000]
    vision_block = vb if vb else "(none)"
    user = EXTRACTOR_USER_TEMPLATE.format(
        output_lang_instruction=_output_lang_instruction(output_language),
        topic=topic.strip(),
        packed=packed[:_extractor_pack_limit(settings)],
        vision_block=vision_block,
    )
    return llm_json(settings, EXTRACTOR_SYSTEM, user, role="extractor")


def _designer_payload_blob(analyst_out: dict[str, Any], extractor_out: dict[str, Any] | None) -> str:
    ex = extractor_out or {}
    slim_analyst = {
        "market_share_data": analyst_out.get("market_share_data"),
        "comparison_tables": analyst_out.get("comparison_tables"),
        "chart_metrics": analyst_out.get("chart_metrics"),
        "chart_spec": analyst_out.get("chart_spec"),
        "key_insights": analyst_out.get("key_insights"),
        "markdown_report": (str(analyst_out.get("markdown_report") or ""))[:3500],
    }
    slim_ex = {
        "extractions": ex.get("extractions"),
        "charts_detected": ex.get("charts_detected"),
        "low_confidence_flags": ex.get("low_confidence_flags"),
    }
    blob = {"analyst": slim_analyst, "extractor": slim_ex}
    return json.dumps(blob, ensure_ascii=False, separators=(",", ":"))[:14_000]


def designer_llm_run(
    settings: Settings,
    topic: str,
    analyst_out: dict[str, Any],
    extractor_out: dict[str, Any] | None,
    output_language: str = "en",
) -> dict[str, Any]:
    user = DESIGNER_USER_TEMPLATE.format(
        output_lang_instruction=_output_lang_instruction(output_language),
        topic=topic.strip(),
        designer_payload=_designer_payload_blob(analyst_out, extractor_out),
    )
    return llm_json(settings, DESIGNER_SYSTEM, user, role="designer")


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
    extractor_out: dict[str, Any] | None = None,
) -> dict[str, Any]:
    plan_json = json.dumps(plan, ensure_ascii=False, separators=(",", ":"))[:12_000]
    rev = ""
    if revision_focus and revision_focus.strip():
        rev = (
            "\n\nRevision request from quality gate (address explicitly in markdown_report, "
            "structured fields, and summary):\n"
            f"{revision_focus.strip()[:4000]}\n"
        )
    va = (vision_appendix or "").strip()
    vision_block = (
        "Vision / figure extraction (JSON):\n" + va[:14_000]
        if va
        else "(No structured vision extraction for this run — rely on text sources.)"
    )
    ex_blob = json.dumps(extractor_out or {}, ensure_ascii=False, separators=(",", ":"))[:10_000]
    extractor_json_block = (
        ex_blob if ex_blob not in ("", "{}", "null") else "(none — extractor unavailable or empty)"
    )
    block = prompts.ANALYST_USER_SCHEMA.format(
        output_lang_instruction=_output_lang_instruction(output_language),
        plan_json=plan_json,
        index_lines=index_lines,
        extractor_json_block=extractor_json_block,
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


