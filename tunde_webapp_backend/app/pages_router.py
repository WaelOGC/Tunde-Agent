from __future__ import annotations

import logging
import os
import uuid

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field

from tunde_webapp_backend.app.db import db_session

logger = logging.getLogger(__name__)
from tunde_webapp_backend.app.landing_page_generator import generate_landing_document
from tunde_webapp_backend.app.repositories.page_repository import create_published_page, get_published_page

_MAX_HTML_BYTES = int((os.getenv("TUNDE_MAX_PUBLISH_HTML_BYTES") or str(2_500_000)).strip())

api_router = APIRouter(prefix="/api/pages", tags=["pages"])
share_router = APIRouter(tags=["share"])


def _share_url(request: Request, page_id: str) -> str:
    base = (os.getenv("TUNDE_PUBLIC_SHARE_BASE") or "").strip().rstrip("/")
    if base:
        return f"{base}/share/{page_id}"
    return f"{str(request.base_url).rstrip('/')}/share/{page_id}"


class GeneratePageBody(BaseModel):
    user_id: str = Field(default="anonymous", max_length=128)
    source: str = Field(default="workspace", max_length=64)
    context: str = Field(default="", max_length=100_000)
    title_hint: str | None = Field(default=None, max_length=512)
    existing_html: str | None = Field(default=None, max_length=500_000)
    revision_notes: str | None = Field(default=None, max_length=8000)


class PublishPageBody(BaseModel):
    user_id: str = Field(default="anonymous", max_length=128)
    title: str = Field(default="Tunde Report", max_length=512)
    html: str = Field(default="", max_length=3_000_000)


@api_router.post("/generate")
async def generate_page(body: GeneratePageBody) -> dict:
    _ = body.user_id  # reserved for quotas / audit
    has_ctx = bool((body.context or "").strip())
    has_existing = bool((body.existing_html or "").strip())
    if not has_ctx and not has_existing:
        raise HTTPException(status_code=400, detail="context or existing_html is required.")
    out = generate_landing_document(
        context=body.context,
        title_hint=body.title_hint,
        existing_html=body.existing_html,
        revision_notes=body.revision_notes,
    )
    return {
        "ok": True,
        "html": out["html"],
        "title": out["title"],
        "preview_note": "Use Canvas Preview in the workspace; publish when ready.",
    }


@api_router.post("/publish")
async def publish_page(body: PublishPageBody, request: Request) -> dict:
    raw = (body.html or "").encode("utf-8")
    if len(raw) > _MAX_HTML_BYTES:
        raise HTTPException(status_code=400, detail="HTML document too large.")
    if not body.html or not body.html.strip():
        raise HTTPException(status_code=400, detail="html is required.")

    with db_session() as session:
        row = create_published_page(
            session,
            user_id=body.user_id,
            title=body.title,
            html_document=body.html,
        )
        pid = str(row.page_id)
        title_out = row.title

    return {
        "ok": True,
        "page_id": pid,
        "share_path": f"/share/{pid}",
        "share_url": _share_url(request, pid),
        "title": title_out,
    }


@share_router.get("/share/{page_id}", response_class=HTMLResponse)
async def view_shared_page(page_id: str) -> HTMLResponse:
    """
    Public HTML for a published page. Copy ``html_document`` inside the DB session
    before the session closes — ORM instances expire after commit; lazy-load would 500.
    """
    try:
        uid = uuid.UUID(str(page_id))
    except ValueError as exc:
        raise HTTPException(status_code=404, detail="Not found.") from exc

    html_document = ""
    try:
        with db_session() as session:
            row = get_published_page(session, uid)
            if row is None:
                raise HTTPException(status_code=404, detail="Not found.")
            html_document = str(row.html_document or "")
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("share page read failed page_id=%s", page_id)
        raise HTTPException(status_code=500, detail="Could not load page.") from exc

    return HTMLResponse(
        content=html_document,
        status_code=200,
        media_type="text/html; charset=utf-8",
    )
