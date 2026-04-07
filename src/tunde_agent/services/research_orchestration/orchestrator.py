"""
Async orchestrator: parallel extraction + sequential analyst → verifier → master gate (with revisions).

Entry point is sync-friendly: called via asyncio.run from the mission thread.
"""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from typing import Any

from tunde_agent.config.settings import Settings
from tunde_agent.services.llm_service import LLMError
from tunde_agent.services.research_orchestration.designer_agent import (
    generate_charts_from_analyst_with_fallback,
    has_chartable_metrics,
)
from tunde_agent.services.research_orchestration.extraction_agent import fetch_page_text
from tunde_agent.services.research_orchestration.payload import (
    aggregate_visual_data_urls,
    host_label,
    image_analysis_summary_from_vision,
    normalize_multilingual_sources,
    pack_sources_for_llm,
    prepend_vision_block,
)
from tunde_agent.services.research_orchestration.state import ResearchOrchestrationPhase
from tunde_agent.services.research_orchestration.sub_agents import (
    analyst_run,
    master_plan,
    master_quality_gate,
    verifier_run,
)
from tunde_agent.services.research_orchestration.vision_agent import run_vision_on_collected

logger = logging.getLogger(__name__)

_MAX_REVISION_ATTEMPTS = 3
_EXTRACTION_CONCURRENCY = 4
_EXTRACTION_TIMEOUT_S = 120.0


def _audit(user_id: uuid.UUID, stage: str, **details: object) -> None:
    from tunde_agent.services.mission_service import _mission_audit

    _mission_audit(user_id, stage, **details)


async def run_post_approval_pipeline(
    user_id: uuid.UUID,
    topic_clean: str,
    source_urls: list[str],
    browse_first: dict[str, Any],
    settings: Settings,
    *,
    headless: bool,
    output_language: str | None = None,
    multilingual_sources: list[dict[str, str]] | None = None,
) -> dict[str, Any]:
    """
    After human approval: parallel fetch of remaining URLs, master plan (parallel with fetch),
    analyst ↔ verifier ↔ master gate with bounded revisions.

    Returns a dict suitable for building the Telegram report: tagline, executive_summary, insights, sources tuples, technical_ids.
    """
    _audit(
        user_id,
        "orchestration",
        phase=ResearchOrchestrationPhase.ORCH_START.value,
        source_count=len(source_urls),
    )

    extras = source_urls[1:]
    sem = asyncio.Semaphore(_EXTRACTION_CONCURRENCY)

    async def _extract_one(url: str) -> dict[str, Any] | None:
        async with sem:
            try:
                return await asyncio.wait_for(
                    asyncio.to_thread(
                        fetch_page_text,
                        url,
                        user_id,
                        headless=headless,
                        include_screenshot=False,
                    ),
                    timeout=_EXTRACTION_TIMEOUT_S,
                )
            except asyncio.TimeoutError:
                _audit(
                    user_id,
                    "orchestration",
                    agent="extraction",
                    outcome="timeout",
                    url=url[:500],
                    phase=ResearchOrchestrationPhase.EXTRACTION_PARALLEL.value,
                )
                logger.warning("Extraction timeout url=%s", url[:120])
                return None
            except Exception as exc:
                _audit(
                    user_id,
                    "orchestration",
                    agent="extraction",
                    outcome="error",
                    error_type=type(exc).__name__,
                    detail=str(exc)[:500],
                    url=url[:500],
                    phase=ResearchOrchestrationPhase.EXTRACTION_PARALLEL.value,
                )
                logger.warning("Extraction error url=%s: %s", url[:120], exc)
                return None

    plan_task = asyncio.create_task(
        asyncio.to_thread(master_plan, settings, topic_clean, source_urls)
    )
    if extras:
        raw_results = await asyncio.gather(*[_extract_one(u) for u in extras], return_exceptions=True)
    else:
        raw_results = []

    collected: list[dict[str, Any]] = [browse_first]
    for b in collected:
        b.setdefault("visual_data_urls", [])
    for u, r in zip(extras, raw_results):
        if isinstance(r, BaseException):
            _audit(
                user_id,
                "orchestration",
                agent="extraction",
                outcome="exception",
                error_type=type(r).__name__,
                detail=str(r)[:500],
                url=u[:500],
                phase=ResearchOrchestrationPhase.EXTRACTION_PARALLEL.value,
            )
            logger.warning("Extraction gather exception url=%s: %s", u[:120], r)
            continue
        if isinstance(r, dict) and r.get("url"):
            r.setdefault("visual_data_urls", [])
            collected.append(r)

    _audit(
        user_id,
        "orchestration",
        phase=ResearchOrchestrationPhase.EXTRACTION_PARALLEL.value,
        sources_fetched=len(collected),
        extras_attempted=len(extras),
        extras_ok=len(collected) - 1,
    )

    effective_lang = (output_language or settings.research_output_language or "en").strip().lower()

    try:
        plan = await plan_task
    except (LLMError, ValueError, TypeError, json.JSONDecodeError) as exc:
        _audit(
            user_id,
            "orchestration",
            agent="master_plan",
            outcome="failed",
            detail=str(exc)[:500],
        )
        logger.warning("Master plan LLM failed, using minimal plan: %s", exc)
        plan = {"information_goals": [], "angles_to_cover": [], "quality_checks": []}

    if not isinstance(plan, dict):
        plan = {"information_goals": [], "angles_to_cover": [], "quality_checks": []}

    _audit(
        user_id,
        "orchestration",
        phase=ResearchOrchestrationPhase.MASTER_PLAN.value,
        plan_keys=list(plan.keys())[:20],
    )

    rows_for_llm = [
        {
            "url": (b.get("url") or "").strip(),
            "title": (b.get("title") or "").strip(),
            "text": b.get("text") or "",
            "visual_data_urls": list(b.get("visual_data_urls") or []),
        }
        for b in collected
    ]
    packed_base = pack_sources_for_llm(rows_for_llm)

    _audit(
        user_id,
        "orchestration",
        phase=ResearchOrchestrationPhase.VISION.value,
        subphase="start",
        visual_url_count=len(aggregate_visual_data_urls(collected)),
    )
    vision_text = await asyncio.to_thread(run_vision_on_collected, settings, collected, topic_clean)
    _audit(
        user_id,
        "orchestration",
        phase=ResearchOrchestrationPhase.VISION.value,
        subphase="complete",
        vision_chars=len(vision_text or ""),
    )
    packed = prepend_vision_block(packed_base, vision_text)

    source_index = [
        ((r["title"] or host_label(r["url"]))[:200], r["url"])
        for r in rows_for_llm
        if r["url"]
    ]
    index_lines = "\n".join(f"{i + 1}. {title!r} — {url}" for i, (title, url) in enumerate(source_index))

    revision_focus: str | None = None
    analyst_out: dict[str, Any] = {}
    verifier_out: dict[str, Any] = {}
    gate_out: dict[str, Any] = {}
    gate_approved = False
    last_attempt = 0
    last_charts: list[tuple[bytes, str, str]] = []

    for attempt in range(_MAX_REVISION_ATTEMPTS):
        last_attempt = attempt
        _audit(
            user_id,
            "orchestration",
            phase=ResearchOrchestrationPhase.ANALYST.value,
            attempt=attempt,
        )
        try:
            analyst_out = await asyncio.to_thread(
                analyst_run,
                settings,
                topic_clean,
                plan,
                packed,
                index_lines,
                revision_focus,
                vision_appendix=vision_text,
                output_language=effective_lang,
            )
        except LLMError as exc:
            _audit(
                user_id,
                "orchestration",
                agent="analyst",
                outcome="llm_error",
                detail=str(exc)[:500],
                attempt=attempt,
            )
            analyst_out = {
                "executive_summary": "Analysis step failed (LLM error). See sources manually.",
                "insights": [str(exc)[:400]],
                "open_questions": [],
                "source_usage_notes": [],
            }
        if not isinstance(analyst_out, dict):
            analyst_out = {}

        _audit(
            user_id,
            "orchestration",
            phase=ResearchOrchestrationPhase.VERIFIER.value,
            attempt=attempt,
        )
        try:
            verifier_out = await asyncio.to_thread(
                verifier_run,
                settings,
                topic_clean,
                packed,
                analyst_out,
            )
        except LLMError as exc:
            _audit(
                user_id,
                "orchestration",
                agent="verifier",
                outcome="llm_error",
                detail=str(exc)[:500],
                attempt=attempt,
            )
            verifier_out = {
                "contradictions": [],
                "unsupported_or_overstated": [],
                "multi_source_agreements": [],
                "confidence": "low",
                "suggested_actions": [f"Verifier LLM error: {str(exc)[:200]}"],
            }
        if not isinstance(verifier_out, dict):
            verifier_out = {}

        _audit(
            user_id,
            "orchestration",
            phase=ResearchOrchestrationPhase.DESIGNER.value,
            attempt=attempt,
        )
        cd = verifier_out.get("chart_data_reliable")
        if cd is False:
            chart_reliable = False
        elif cd is True:
            chart_reliable = True
        else:
            chart_reliable = str(verifier_out.get("confidence") or "").lower() in ("high", "medium")

        last_charts: list[tuple[bytes, str, str]] = []
        if has_chartable_metrics(analyst_out):
            try:
                last_charts = await asyncio.to_thread(
                    generate_charts_from_analyst_with_fallback,
                    analyst_out,
                    theme_topic=topic_clean,
                )
            except Exception as exc:
                logger.warning("Designer agent failed: %s", exc)
                last_charts = []
        designer_note = ""
        if not has_chartable_metrics(analyst_out):
            designer_note = "No summary chart: analyst did not return usable chart_metrics (labels + values)."
        elif not chart_reliable and last_charts:
            designer_note = (
                "Summary chart generated from analyst metrics; verifier flagged numeric/caveats — interpret with care."
            )
        elif chart_reliable and last_charts:
            designer_note = "Summary chart(s) were generated from analyst chart_metrics after verifier sign-off."
        elif chart_reliable and not last_charts:
            designer_note = "Verifier approved numeric framing, but QuickChart fetch failed or returned empty."
        elif not chart_reliable and not last_charts:
            designer_note = (
                "Verifier did not certify chart data; chart_metrics present but QuickChart did not return an image."
            )

        _audit(
            user_id,
            "orchestration",
            phase=ResearchOrchestrationPhase.MASTER_GATE.value,
            attempt=attempt,
        )
        try:
            gate_out = await asyncio.to_thread(
                master_quality_gate,
                settings,
                topic_clean,
                analyst_out,
                verifier_out,
                designer_context=designer_note,
            )
        except LLMError as exc:
            _audit(
                user_id,
                "orchestration",
                agent="master_gate",
                outcome="llm_error",
                detail=str(exc)[:500],
                attempt=attempt,
            )
            gate_out = {
                "approve_for_delivery": attempt >= _MAX_REVISION_ATTEMPTS - 1,
                "revision_focus": "",
                "tagline": None,
                "executive_summary": str(analyst_out.get("executive_summary") or ""),
                "insights": analyst_out.get("insights") if isinstance(analyst_out.get("insights"), list) else [],
                "sources": [],
                "technical_ids": [f"Master gate LLM error: {str(exc)[:160]}"],
            }
        if not isinstance(gate_out, dict):
            gate_out = {}

        gate_approved = bool(gate_out.get("approve_for_delivery"))
        if gate_approved:
            break

        revision_focus = (gate_out.get("revision_focus") or "").strip()
        if not revision_focus:
            revision_focus = (
                "Tighten evidence attribution, resolve or explicitly surface disagreements between sources, "
                "and remove or qualify any claims not clearly supported by the extracts."
            )
        _audit(
            user_id,
            "orchestration",
            phase=ResearchOrchestrationPhase.REVISION.value,
            attempt=attempt,
            revision_focus=revision_focus[:800],
        )

    forced_final = (not gate_approved) and (last_attempt >= _MAX_REVISION_ATTEMPTS - 1)

    delivery = _build_delivery_payload(
        gate_out,
        analyst_out,
        source_index,
        collected,
        forced_final_delivery=forced_final,
        telegram_charts=last_charts,
        multilingual_sources=multilingual_sources,
        vision_text=vision_text,
    )

    _audit(
        user_id,
        "orchestration",
        phase=ResearchOrchestrationPhase.ORCH_COMPLETE.value,
        delivery_approved=gate_approved,
        forced_final_delivery=forced_final,
        last_attempt=last_attempt,
    )

    return delivery


def _parse_gate_sources(raw_sources: object) -> list[tuple[str, str]]:
    sources_list: list[tuple[str, str]] = []
    if isinstance(raw_sources, list):
        for item in raw_sources:
            if isinstance(item, dict) and item.get("url"):
                sources_list.append(
                    (
                        str(item.get("title") or "Source").strip() or "Source",
                        str(item["url"]).strip(),
                    )
                )
    return sources_list


def _merge_global_perspective_prefix(analyst_out: dict[str, Any]) -> list[str]:
    gp = analyst_out.get("global_perspective")
    if not isinstance(gp, list):
        return []
    out: list[str] = []
    for x in gp:
        t = str(x).strip()
        if not t:
            continue
        if t.startswith("🌍"):
            out.append(t)
        else:
            out.append(f"🌍 {t}")
    return out


def _merge_insights(gate_ins: list[str], analyst_ins: list[str], *, cap: int = 12) -> list[str]:
    out: list[str] = []
    for src in (gate_ins, analyst_ins):
        for x in src:
            t = str(x).strip()
            if t and t not in out:
                out.append(t)
            if len(out) >= cap:
                return out
    return out


def _build_delivery_payload(
    gate_out: dict[str, Any],
    analyst_out: dict[str, Any],
    source_index: list[tuple[str, str]],
    collected: list[dict[str, Any]],
    *,
    forced_final_delivery: bool = False,
    telegram_charts: list[tuple[bytes, str, str]] | None = None,
    multilingual_sources: list[dict[str, str]] | None = None,
    vision_text: str = "",
) -> dict[str, Any]:
    """Normalize to keys consumed by mission_service / format_telegram_report."""
    gate_ok = bool(gate_out.get("approve_for_delivery"))
    deliver = gate_ok or forced_final_delivery

    gi = gate_out.get("insights") if isinstance(gate_out.get("insights"), list) else []
    ai = analyst_out.get("insights") if isinstance(analyst_out.get("insights"), list) else []
    gate_insights = [str(x).strip() for x in gi if x and str(x).strip()]
    analyst_insights = [str(x).strip() for x in ai if x and str(x).strip()]

    g_exec = str(gate_out.get("executive_summary") or "").strip()
    a_exec = str(analyst_out.get("executive_summary") or "").strip()

    if deliver:
        tagline = gate_out.get("tagline")
        if tagline is not None:
            tagline = str(tagline).strip() or None
        exec_sum = g_exec or a_exec
        if gate_insights:
            insights_list = _merge_insights(gate_insights, analyst_insights)
        else:
            insights_list = analyst_insights or gate_insights or [
                "See executive summary and listed sources for detail."
            ]
        gp_pre = _merge_global_perspective_prefix(analyst_out)
        if gp_pre:
            insights_list = gp_pre + [x for x in insights_list if x not in gp_pre]

        sources_list = _parse_gate_sources(gate_out.get("sources"))
        if not sources_list:
            sources_list = [(t, u) for t, u in source_index]

        tech = gate_out.get("technical_ids")
        if isinstance(tech, list):
            tech_ids = [str(x).strip() for x in tech if x and str(x).strip()]
        else:
            tech_ids = []
        if forced_final_delivery and not gate_ok:
            tech_ids.insert(
                0,
                "Final report delivered after maximum review rounds (merged analyst + gate output).",
            )
        if gate_out.get("_parse_fallback"):
            tech_ids.append("Master gate JSON was repaired or defaulted; verify critical facts against sources.")
    else:
        tagline = None
        exec_sum = a_exec
        insights_list = analyst_insights or [
            "See executive summary and listed sources for detail.",
        ]
        gp_pre = _merge_global_perspective_prefix(analyst_out)
        if gp_pre:
            insights_list = gp_pre + [x for x in insights_list if x not in gp_pre]
        sources_list = [(t, u) for t, u in source_index]
        tech_ids = [
            "Quality gate did not approve a final polish; showing analyst synthesis. "
            "Verify critical claims against sources."
        ]

    if not exec_sum.strip():
        exec_sum = a_exec or g_exec or "No executive summary returned."

    for b in collected[:5]:
        tt = (b.get("title") or "").strip()[:220]
        if tt and tt not in (tech_ids or []):
            tech_ids.append(tt)

    primary_media = collected[0].get("url") if collected else ""

    charts = telegram_charts or []
    visual_urls = aggregate_visual_data_urls(collected, max_urls=24)
    gen_paths = [f"generated_chart_{i}.png" for i in range(len(charts))]
    gen_visual_url: str | None = None
    if charts and len(charts[0]) >= 3:
        u0 = charts[0][2]
        if isinstance(u0, str) and u0.startswith("http"):
            gen_visual_url = u0[:4096]

    ml_src = normalize_multilingual_sources(multilingual_sources)
    img_summary = image_analysis_summary_from_vision(vision_text)
    acm = analyst_out.get("chart_metrics")
    analyst_chart_metrics = acm if isinstance(acm, dict) else None
    fd = analyst_out.get("feasibility_deep_dive")
    feasibility_deep_dive = fd if isinstance(fd, dict) else None

    return {
        "tagline": tagline,
        "executive_summary": exec_sum,
        "insights": insights_list,
        "sources": sources_list,
        "technical_ids": tech_ids or None,
        "primary_media": primary_media,
        "visual_data_urls": visual_urls,
        "generated_chart_paths": gen_paths,
        "telegram_charts": charts,
        "multilingual_sources": ml_src,
        "image_analysis_summary": img_summary,
        "generated_visual_url": gen_visual_url,
        "analyst_chart_metrics": analyst_chart_metrics,
        "feasibility_deep_dive": feasibility_deep_dive,
    }
