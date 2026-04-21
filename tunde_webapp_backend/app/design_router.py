"""HTTP API for Design Agent — brand identity generation."""

from __future__ import annotations

import json
import logging
import uuid

from fastapi import APIRouter, HTTPException

from tunde_webapp_backend.app.db import db_session
from tunde_webapp_backend.app.models.brand_identity import BrandIdentity
from tunde_webapp_backend.app.task_models import BrandIdentityRequest, BrandIdentityResponse, utc_iso
from tunde_webapp_backend.app.tools.design_agent import generate_brand_identity

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/tools/design", tags=["Design Agent"])


@router.post("/brand-identity", response_model=BrandIdentityResponse)
async def design_brand_identity(body: BrandIdentityRequest) -> BrandIdentityResponse:
    try:
        raw = await generate_brand_identity(body.model_dump())
        bid = uuid.uuid4()
        resp = BrandIdentityResponse(
            brand_id=str(bid),
            brand_name=body.brand_name,
            tagline=raw.get("tagline", ""),
            palette=raw.get("palette", []),
            typography=raw.get("typography", {}),
            logo_svg=raw.get("logo_svg", ""),
            logo_icon_svg=raw.get("logo_icon_svg", ""),
            guidelines=raw.get("guidelines", {}),
            css_variables=raw.get("css_variables", ""),
            provider=raw.get("provider", "gemini"),
            created_at=utc_iso(),
        )
        payload_s = json.dumps(resp.model_dump(), ensure_ascii=False)
        try:
            with db_session() as session:
                row = BrandIdentity(
                    brand_id=bid,
                    user_id=(body.user_id or "anonymous")[:128],
                    session_id=body.session_id,
                    conv_id=None,
                    message_id=None,
                    brand_name=body.brand_name[:256],
                    industry=(body.industry or "")[:256],
                    description=body.description or "",
                    audience=(body.audience or "")[:512],
                    tone=(body.tone or "")[:128],
                    color_mood=(body.color_mood or "")[:128],
                    logo_style=(body.logo_style or "")[:128],
                    payload_json=payload_s,
                    provider=(resp.provider or "gemini")[:64],
                )
                session.add(row)
        except Exception as exc:
            logger.warning("brand identity persist skipped: %s", str(exc)[:200])
        return resp
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("design brand-identity failed: %s", str(exc)[:200])
        raise HTTPException(status_code=503, detail="Design Agent temporarily unavailable.") from exc
