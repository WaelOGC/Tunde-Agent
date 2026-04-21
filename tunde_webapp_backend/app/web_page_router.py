"""
Web Page Router
Registers under /tools/web-page/ in main.py.

Endpoints:
    POST /tools/web-page/generate      → generate & persist web page
    GET  /db/web-pages?user_id=...     → list (in db_router.py)
    GET  /db/web-pages/{page_id}       → single record (in db_router.py)
"""

import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .db import get_db
from .models.web_page_design import WebPageDesign
from .task_models import WebPageDesignRequest, WebPageDesignResponse
from .tools.web_page_designer import generate_web_page

router = APIRouter(prefix="/tools/web-page", tags=["Web Page Designer"])


@router.post("/generate", response_model=WebPageDesignResponse)
async def create_web_page(
    request: WebPageDesignRequest,
    db: Session = Depends(get_db),
):
    """
    Generate a complete landing page HTML and persist it to the DB.
    Returns a WebPageDesignResponse with page_id and html_content.
    """
    # ── Call AI tool ─────────────────────────────────────────────────────────
    try:
        ai_data = await generate_web_page(request.model_dump())
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail=f"Web Page Designer error: {exc}"
        ) from exc

    # ── Build response ────────────────────────────────────────────────────────
    page_id = str(uuid.uuid4())
    now     = datetime.now(timezone.utc)

    response = WebPageDesignResponse(
        page_id=page_id,
        business_name=request.business_name,
        page_title=ai_data.get("page_title", request.business_name),
        html_content=ai_data.get("html_content", ""),
        industry=request.industry,
        page_style=request.page_style,
        color_scheme=request.color_scheme,
        sections=request.sections,
        provider=ai_data.get("provider", "gemini"),
        created_at=now.isoformat(),
    )

    # ── Persist to DB ─────────────────────────────────────────────────────────
    try:
        record = WebPageDesign(
            page_id=page_id,
            user_id=request.user_id or "dev_user",
            session_id=str(request.session_id) if request.session_id else None,
            business_name=request.business_name,
            industry=request.industry,
            description=request.description,
            audience=request.audience,
            page_style=request.page_style,
            color_scheme=request.color_scheme,
            sections_json=json.dumps(request.sections),
            cta_text=request.cta_text,
            html_content=ai_data.get("html_content", ""),
            provider=response.provider,
            created_at=now,
            updated_at=now,
        )
        db.add(record)
        db.commit()
    except Exception as exc:
        db.rollback()
        print(f"[web_page_router] DB write failed (non-fatal): {exc}")

    return response