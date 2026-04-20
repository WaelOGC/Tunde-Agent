"""HTTP API for the Business Agent (research, scenario simulation, accounting uploads)."""

from __future__ import annotations

import json
import logging
import uuid

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from tunde_agent.services.llm_service import LLMError

from sqlalchemy import select

from tunde_webapp_backend.app.db import db_session
from tunde_webapp_backend.app.models.business_research import BusinessResearch
from tunde_webapp_backend.app.task_models import (
    BusinessAgentFullResponse,
    BusinessResearchRunRequest,
    BusinessScenarioSimulateRequest,
    BusinessScenarioSimulateResponse,
)
from tunde_webapp_backend.app.tools.business_agent import parse_accounting_upload, run_business_research, run_scenario_simulation

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/tools/business", tags=["business"])


def _persist_snapshot(user_id: str, niche_query: str, payload: dict, session_id: uuid.UUID | None) -> uuid.UUID:
    payload_s = json.dumps(payload, ensure_ascii=False)
    with db_session() as session:
        if session_id:
            existing = session.scalars(
                select(BusinessResearch).where(BusinessResearch.session_id == session_id).limit(1)
            ).first()
            if existing:
                existing.niche_query = niche_query[:8000]
                existing.payload_json = payload_s
                existing.user_id = user_id[:128]
                session.flush()
                return existing.research_id
        row = BusinessResearch(
            user_id=user_id[:128],
            session_id=session_id or uuid.uuid4(),
            niche_query=niche_query[:8000],
            payload_json=payload_s,
        )
        session.add(row)
        session.flush()
        return row.research_id


@router.post("/research", response_model=BusinessAgentFullResponse)
async def business_research(body: BusinessResearchRunRequest) -> BusinessAgentFullResponse:
    try:
        raw = await run_business_research(
            body.query,
            session_id=body.session_id,
            include_live_search=body.include_live_search,
        )
        sid = uuid.UUID(str(raw["session_id"])) if raw.get("session_id") else None
        rid = _persist_snapshot(body.user_id, body.query, raw, sid)
        raw["research_id"] = str(rid)
        return BusinessAgentFullResponse.model_validate(raw)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except LLMError as exc:
        logger.warning("business research LLM error: %s", str(exc)[:200])
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("business research failed")
        raise HTTPException(status_code=500, detail="Business research failed.") from exc


@router.post("/simulate", response_model=BusinessScenarioSimulateResponse)
async def business_simulate(body: BusinessScenarioSimulateRequest) -> BusinessScenarioSimulateResponse:
    try:
        out = run_scenario_simulation(
            label=body.label,
            base_revenue=body.base_revenue,
            revenue_growth_yoy=body.revenue_growth_yoy,
            cogs_ratio=body.cogs_ratio,
            opex_ratio=body.opex_ratio,
            tax_rate=body.tax_rate,
            periods=body.periods,
        )
        return BusinessScenarioSimulateResponse.model_validate(out)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/accounting/upload")
async def business_accounting_upload(
    user_id: str = Form("anonymous"),
    file: UploadFile = File(...),
) -> dict:
    try:
        raw = await file.read()
    except Exception as exc:
        logger.warning("accounting upload read failed: %s", exc)
        raise HTTPException(status_code=400, detail="Could not read upload.") from exc
    if not raw or len(raw) > 2_000_000:
        raise HTTPException(status_code=400, detail="File empty or too large (max 2MB).")
    try:
        parsed = parse_accounting_upload(file.filename or "upload.csv", raw)
    except Exception as exc:
        logger.exception("accounting parse failed")
        raise HTTPException(status_code=400, detail=f"Parse failed: {exc}") from exc

    snap = {"user_id": user_id, "filename": file.filename, **parsed}
    with db_session() as session:
        row = BusinessResearch(
            user_id=str(user_id or "anonymous")[:128],
            session_id=uuid.uuid4(),
            niche_query=f"accounting_upload:{file.filename}",
            payload_json=json.dumps({"kind": "accounting_only", "parsed": parsed}, ensure_ascii=False),
            accounting_snapshot_json=json.dumps(snap, ensure_ascii=False),
        )
        session.add(row)
        session.flush()
        rid = row.research_id
    return {"ok": True, "research_id": str(rid), **parsed}
