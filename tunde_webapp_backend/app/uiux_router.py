"""
UI/UX Prototype Router
Registers under /tools/uiux/ in main.py.

Endpoints:
    POST /tools/uiux/generate          → generate & persist prototype
    GET  /db/uiux-prototypes           → list (in db_router.py)
    GET  /db/uiux-prototypes/{proto_id} → single record (in db_router.py)
"""

import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .db import get_db
from .models.uiux_prototype import UIUXPrototype
from .task_models import UIUXPrototypeRequest, UIUXPrototypeResponse
from .tools.uiux_prototype import generate_uiux_prototype

router = APIRouter(prefix="/tools/uiux", tags=["UI/UX Prototype"])


@router.post("/generate", response_model=UIUXPrototypeResponse)
async def create_uiux_prototype(
    request: UIUXPrototypeRequest,
    db: Session = Depends(get_db),
):
    """
    Generate a complete UI/UX prototype and persist it to the DB.
    Returns UIUXPrototypeResponse with proto_id and html_content.
    """
    try:
        ai_data = await generate_uiux_prototype(request.model_dump())
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail=f"UI/UX Prototype error: {exc}"
        ) from exc

    proto_id = str(uuid.uuid4())
    now      = datetime.now(timezone.utc)

    response = UIUXPrototypeResponse(
        proto_id=proto_id,
        product_name=request.product_name,
        product_type=request.product_type,
        platform=request.platform,
        ui_style=request.ui_style,
        color_theme=request.color_theme,
        screens=request.screens,
        components=request.components,
        html_content=ai_data.get("html_content", ""),
        provider=ai_data.get("provider", "gemini"),
        created_at=now.isoformat(),
    )

    try:
        record = UIUXPrototype(
            proto_id=proto_id,
            user_id=request.user_id or "dev_user",
            session_id=str(request.session_id) if request.session_id else None,
            product_name=request.product_name,
            product_type=request.product_type,
            industry=request.industry,
            description=request.description,
            platform=request.platform,
            ui_style=request.ui_style,
            color_theme=request.color_theme,
            screens_json=json.dumps(request.screens),
            components_json=json.dumps(request.components),
            primary_action=request.primary_action,
            html_content=ai_data.get("html_content", ""),
            provider=response.provider,
            created_at=now,
            updated_at=now,
        )
        db.add(record)
        db.commit()
    except Exception as exc:
        db.rollback()
        print(f"[uiux_router] DB write failed (non-fatal): {exc}")

    return response