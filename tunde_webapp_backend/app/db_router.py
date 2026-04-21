"""
HTTP persistence helpers for conversations, messages, tool results, and canvas pages.

These routes back the dashboard’s need to store chat state and tool JSON without going
through the legacy task pipeline.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import desc, select

from tunde_webapp_backend.app.db import db_session
from .models.brand_identity import BrandIdentity
from .models.web_page_design import WebPageDesign
from .models.uiux_prototype import UIUXPrototype
from .models.architecture_project import ArchitectureProject
from tunde_webapp_backend.app.models.business_research import BusinessResearch
from tunde_webapp_backend.app.models.canvas_page import CanvasPage
from tunde_webapp_backend.app.models.conversation import Conversation
from tunde_webapp_backend.app.models.generated_image import GeneratedImage
from tunde_webapp_backend.app.models.message import Message
from tunde_webapp_backend.app.models.tool_result import ToolResult

router = APIRouter(prefix="/db", tags=["database"])


def _conv_out(row: Conversation) -> dict:
    return {
        "conv_id": str(row.conv_id),
        "user_id": row.user_id,
        "started_at": row.started_at.isoformat() if row.started_at else None,
        "title": row.title,
        "tool_used": row.tool_used,
        "ended_at": row.ended_at.isoformat() if row.ended_at else None,
    }


def _msg_out(row: Message) -> dict:
    return {
        "message_id": str(row.message_id),
        "conv_id": str(row.conv_id),
        "role": row.role,
        "content": row.content,
        "timestamp": row.timestamp.isoformat() if row.timestamp else None,
        "blocks_json": row.blocks_json,
        "tool_type": row.tool_type,
    }


class ConversationCreateBody(BaseModel):
    user_id: str = Field(..., max_length=128)
    conv_id: uuid.UUID | None = None
    title: str | None = Field(default=None, max_length=512)
    tool_used: str | None = Field(default=None, max_length=64)
    ended_at: datetime | None = None


@router.get("/conversations")
def list_conversations(user_id: str = Query(..., min_length=1, max_length=128)) -> dict:
    """List conversations for a user, newest first (sidebar history)."""
    with db_session() as session:
        rows = session.scalars(
            select(Conversation).where(Conversation.user_id == user_id).order_by(desc(Conversation.started_at))
        ).all()
        return {"ok": True, "conversations": [_conv_out(r) for r in rows]}


@router.get("/conversations/{conv_id}/messages")
def list_conversation_messages(conv_id: uuid.UUID) -> dict:
    """All messages for a conversation, oldest first."""
    with db_session() as session:
        conv = session.get(Conversation, conv_id)
        if conv is None:
            raise HTTPException(status_code=404, detail="Conversation not found.")

        rows = session.scalars(
            select(Message).where(Message.conv_id == conv_id).order_by(Message.timestamp.asc())
        ).all()
        return {"ok": True, "conv_id": str(conv_id), "messages": [_msg_out(r) for r in rows]}


@router.post("/conversations")
def create_or_get_conversation(body: ConversationCreateBody) -> dict:
    with db_session() as session:
        if body.conv_id is not None:
            existing = session.get(Conversation, body.conv_id)
            if existing is not None:
                return {"ok": True, "conversation": _conv_out(existing), "created": False}
            row = Conversation(
                conv_id=body.conv_id,
                user_id=body.user_id,
                title=body.title,
                tool_used=body.tool_used,
                ended_at=body.ended_at,
            )
            session.add(row)
            session.flush()
            return {"ok": True, "conversation": _conv_out(row), "created": True}

        row = Conversation(
            user_id=body.user_id,
            title=body.title,
            tool_used=body.tool_used,
            ended_at=body.ended_at,
        )
        session.add(row)
        session.flush()
        return {"ok": True, "conversation": _conv_out(row), "created": True}


class ConversationUpdateTitleBody(BaseModel):
    title: str = Field(..., max_length=512)


@router.patch("/conversations/{conv_id}")
def patch_conversation_title(conv_id: uuid.UUID, body: ConversationUpdateTitleBody) -> dict:
    with db_session() as session:
        row = session.get(Conversation, conv_id)
        if row is None:
            raise HTTPException(status_code=404, detail="Conversation not found.")
        new_title = body.title.strip()
        row.title = new_title or None
        session.add(row)
        session.flush()
        session.commit()
        return {"ok": True, "conv_id": str(conv_id), "title": row.title}


@router.delete("/conversations/{conv_id}")
def delete_conversation(conv_id: uuid.UUID) -> dict:
    with db_session() as session:
        row = session.get(Conversation, conv_id)
        if row is None:
            raise HTTPException(status_code=404, detail="Conversation not found.")
        session.delete(row)
        session.flush()
        session.commit()
        return {"ok": True, "conv_id": str(conv_id)}


class MessageCreateBody(BaseModel):
    conv_id: uuid.UUID
    role: str = Field(..., max_length=16)
    content: str = Field(..., max_length=2_000_000)
    message_id: uuid.UUID | None = None
    blocks_json: str | None = Field(default=None, max_length=10_000_000)
    tool_type: str | None = Field(default=None, max_length=64)


@router.post("/messages")
def save_message(body: MessageCreateBody) -> dict:
    with db_session() as session:
        conv = session.get(Conversation, body.conv_id)
        if conv is None:
            raise HTTPException(status_code=404, detail="Conversation not found.")

        mid = body.message_id or uuid.uuid4()
        if body.message_id is not None and session.get(Message, mid) is not None:
            raise HTTPException(status_code=409, detail="message_id already exists.")

        row = Message(
            message_id=mid,
            conv_id=body.conv_id,
            role=body.role,
            content=body.content,
            blocks_json=body.blocks_json,
            tool_type=body.tool_type,
        )
        session.add(row)
        session.flush()
        return {"ok": True, "message": _msg_out(row)}


class ToolResultCreateBody(BaseModel):
    conv_id: uuid.UUID
    message_id: uuid.UUID
    tool_type: str = Field(..., max_length=64)
    input_data: str = Field(default="", max_length=2_000_000)
    result_json: str = Field(..., max_length=20_000_000)


@router.post("/tool-results")
def save_tool_result(body: ToolResultCreateBody) -> dict:
    with db_session() as session:
        conv = session.get(Conversation, body.conv_id)
        if conv is None:
            raise HTTPException(status_code=404, detail="Conversation not found.")
        msg = session.get(Message, body.message_id)
        if msg is None:
            raise HTTPException(status_code=404, detail="Message not found.")
        if msg.conv_id != body.conv_id:
            raise HTTPException(status_code=400, detail="message_id does not belong to conv_id.")

        row = ToolResult(
            conv_id=body.conv_id,
            message_id=body.message_id,
            tool_type=body.tool_type,
            input_data=body.input_data,
            result_json=body.result_json,
        )
        session.add(row)
        session.flush()
        return {
            "ok": True,
            "tool_result": {
                "result_id": str(row.result_id),
                "conv_id": str(row.conv_id),
                "message_id": str(row.message_id),
                "tool_type": row.tool_type,
                "input_data": row.input_data,
                "result_json": row.result_json,
                "created_at": row.created_at.isoformat() if row.created_at else None,
            },
        }


@router.get("/tool-results/{conv_id}")
def list_tool_results(conv_id: uuid.UUID) -> dict:
    with db_session() as session:
        conv = session.get(Conversation, conv_id)
        if conv is None:
            raise HTTPException(status_code=404, detail="Conversation not found.")

        rows = session.scalars(
            select(ToolResult).where(ToolResult.conv_id == conv_id).order_by(ToolResult.created_at.asc())
        ).all()
        return {
            "ok": True,
            "conv_id": str(conv_id),
            "tool_results": [
                {
                    "result_id": str(r.result_id),
                    "conv_id": str(r.conv_id),
                    "message_id": str(r.message_id),
                    "tool_type": r.tool_type,
                    "input_data": r.input_data,
                    "result_json": r.result_json,
                    "created_at": r.created_at.isoformat() if r.created_at else None,
                }
                for r in rows
            ],
        }


class CanvasPageCreateBody(BaseModel):
    conv_id: uuid.UUID
    message_id: str = Field(..., max_length=256)
    kind: str = Field(..., max_length=64)
    title: str = Field(..., max_length=512)
    html_content: str = Field(..., max_length=5_000_000)
    tool_type: str = Field(..., max_length=64)


def _canvas_out(row: CanvasPage) -> dict:
    return {
        "canvas_id": str(row.canvas_id),
        "conv_id": str(row.conv_id),
        "message_id": row.message_id,
        "kind": row.kind,
        "title": row.title,
        "html_content": row.html_content,
        "tool_type": row.tool_type,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


@router.post("/canvas-pages")
def save_canvas_page(body: CanvasPageCreateBody) -> dict:
    with db_session() as session:
        conv = session.get(Conversation, body.conv_id)
        if conv is None:
            raise HTTPException(status_code=404, detail="Conversation not found.")

        row = CanvasPage(
            conv_id=body.conv_id,
            message_id=body.message_id,
            kind=body.kind,
            title=body.title,
            html_content=body.html_content,
            tool_type=body.tool_type,
        )
        session.add(row)
        session.flush()
        return {"ok": True, "canvas_page": _canvas_out(row)}


@router.get("/canvas-pages/{message_id}")
def get_canvas_page_by_message_id(message_id: str) -> dict:
    with db_session() as session:
        row = session.scalars(
            select(CanvasPage).where(CanvasPage.message_id == message_id).order_by(desc(CanvasPage.updated_at))
        ).first()
        if row is None:
            raise HTTPException(status_code=404, detail="Canvas page not found.")
        return {"ok": True, "canvas_page": _canvas_out(row)}


class CanvasPageUpdateBody(BaseModel):
    title: str | None = Field(default=None, max_length=512)
    html_content: str | None = Field(default=None, max_length=5_000_000)
    kind: str | None = Field(default=None, max_length=64)
    tool_type: str | None = Field(default=None, max_length=64)


@router.put("/canvas-pages/{canvas_id}")
def update_canvas_page(canvas_id: uuid.UUID, body: CanvasPageUpdateBody) -> dict:
    with db_session() as session:
        row = session.get(CanvasPage, canvas_id)
        if row is None:
            raise HTTPException(status_code=404, detail="Canvas page not found.")

        if body.title is None and body.html_content is None and body.kind is None and body.tool_type is None:
            raise HTTPException(status_code=400, detail="At least one field must be provided to update.")

        if body.title is not None:
            row.title = body.title
        if body.html_content is not None:
            row.html_content = body.html_content
        if body.kind is not None:
            row.kind = body.kind
        if body.tool_type is not None:
            row.tool_type = body.tool_type

        row.updated_at = datetime.now(timezone.utc)
        session.add(row)
        session.flush()
        return {"ok": True, "canvas_page": _canvas_out(row)}


def _business_research_out(row: BusinessResearch) -> dict:
    payload: dict = {}
    try:
        payload = json.loads(row.payload_json or "{}")
    except json.JSONDecodeError:
        payload = {}
    acct = None
    if row.accounting_snapshot_json:
        try:
            acct = json.loads(row.accounting_snapshot_json)
        except json.JSONDecodeError:
            acct = None
    return {
        "research_id": str(row.research_id),
        "user_id": row.user_id,
        "session_id": str(row.session_id) if row.session_id else None,
        "niche_query": row.niche_query,
        "payload": payload,
        "accounting_snapshot": acct,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


@router.get("/business-research")
def list_business_research(
    user_id: str = Query(..., min_length=1, max_length=128),
    session_id: uuid.UUID | None = None,
    limit: int = Query(24, ge=1, le=200),
) -> dict:
    """List persisted Business Agent snapshots for a user (newest first)."""
    with db_session() as session:
        q = select(BusinessResearch).where(BusinessResearch.user_id == user_id)
        if session_id is not None:
            q = q.where(BusinessResearch.session_id == session_id)
        q = q.order_by(desc(BusinessResearch.updated_at)).limit(limit)
        rows = session.scalars(q).all()
        return {"ok": True, "items": [_business_research_out(r) for r in rows]}


@router.get("/business-research/{research_id}")
def get_business_research(research_id: uuid.UUID) -> dict:
    with db_session() as session:
        row = session.get(BusinessResearch, research_id)
        if row is None:
            raise HTTPException(status_code=404, detail="Business research record not found.")
        return {"ok": True, "item": _business_research_out(row)}


def _design_brand_list_item(row: BrandIdentity) -> dict:
    return {
        "brand_id": str(row.brand_id),
        "brand_name": row.brand_name,
        "industry": row.industry,
        "tone": row.tone,
        "provider": row.provider,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


@router.get("/design-brands")
def list_design_brands(
    user_id: str = Query(..., min_length=1, max_length=128),
    limit: int = Query(20, ge=1, le=100),
) -> dict:
    """List persisted Design Agent brand identities for a user (newest first)."""
    with db_session() as session:
        rows = session.scalars(
            select(BrandIdentity)
            .where(BrandIdentity.user_id == user_id)
            .order_by(desc(BrandIdentity.created_at))
            .limit(limit)
        ).all()
        return {"ok": True, "items": [_design_brand_list_item(r) for r in rows]}


@router.get("/design-brands/{brand_id}")
def get_design_brand(brand_id: uuid.UUID) -> dict:
    with db_session() as session:
        row = session.get(BrandIdentity, brand_id)
        if row is None:
            raise HTTPException(status_code=404, detail="Brand identity record not found.")
        payload: dict = {}
        try:
            payload = json.loads(row.payload_json or "{}")
        except json.JSONDecodeError:
            payload = {}
        merged = {**payload, "brand_id": str(row.brand_id)}
        return {"ok": True, "item": merged}


def _web_page_list_item(row: WebPageDesign) -> dict:
    return {
        "page_id": row.page_id,
        "business_name": row.business_name,
        "industry": row.industry,
        "page_style": row.page_style,
        "provider": row.provider,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


@router.get("/web-pages")
def list_web_pages(
    user_id: str = Query(..., min_length=1, max_length=128),
    limit: int = Query(20, ge=1, le=100),
) -> dict:
    """List persisted Web Page Designer records for a user (newest first)."""
    with db_session() as session:
        rows = session.scalars(
            select(WebPageDesign)
            .where(WebPageDesign.user_id == user_id)
            .order_by(desc(WebPageDesign.created_at))
            .limit(limit)
        ).all()
        return {"ok": True, "items": [_web_page_list_item(r) for r in rows]}


@router.get("/web-pages/{page_id}")
def get_web_page(page_id: str) -> dict:
    with db_session() as session:
        row = session.get(WebPageDesign, page_id)
        if row is None:
            raise HTTPException(status_code=404, detail="Web page record not found.")
        sections_val: object = row.sections_json or "[]"
        try:
            sections_val = json.loads(row.sections_json or "[]")
        except json.JSONDecodeError:
            sections_val = row.sections_json or "[]"
        return {
            "ok": True,
            "item": {
                "page_id": row.page_id,
                "business_name": row.business_name,
                "industry": row.industry,
                "page_style": row.page_style,
                "color_scheme": row.color_scheme,
                "sections_json": sections_val,
                "html_content": row.html_content,
                "provider": row.provider,
                "created_at": row.created_at.isoformat() if row.created_at else None,
            },
        }


def _uiux_prototype_list_item(row: UIUXPrototype) -> dict:
    return {
        "proto_id": row.proto_id,
        "product_name": row.product_name,
        "product_type": row.product_type,
        "platform": row.platform,
        "ui_style": row.ui_style,
        "provider": row.provider,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


@router.get("/uiux-prototypes")
def list_uiux_prototypes(
    user_id: str = Query(..., min_length=1, max_length=128),
    limit: int = Query(20, ge=1, le=100),
) -> dict:
    """List persisted UI/UX Prototype records for a user (newest first)."""
    with db_session() as session:
        rows = session.scalars(
            select(UIUXPrototype)
            .where(UIUXPrototype.user_id == user_id)
            .order_by(desc(UIUXPrototype.created_at))
            .limit(limit)
        ).all()
        return {"ok": True, "items": [_uiux_prototype_list_item(r) for r in rows]}


@router.get("/uiux-prototypes/{proto_id}")
def get_uiux_prototype(proto_id: str) -> dict:
    with db_session() as session:
        row = session.get(UIUXPrototype, proto_id)
        if row is None:
            raise HTTPException(status_code=404, detail="UI/UX prototype record not found.")
        screens_val: object = row.screens_json or "[]"
        try:
            screens_val = json.loads(row.screens_json or "[]")
        except json.JSONDecodeError:
            screens_val = row.screens_json or "[]"
        components_val: object = row.components_json or "[]"
        try:
            components_val = json.loads(row.components_json or "[]")
        except json.JSONDecodeError:
            components_val = row.components_json or "[]"
        return {
            "ok": True,
            "item": {
                "proto_id": row.proto_id,
                "product_name": row.product_name,
                "product_type": row.product_type,
                "platform": row.platform,
                "ui_style": row.ui_style,
                "color_theme": row.color_theme,
                "screens_json": screens_val,
                "components_json": components_val,
                "html_content": row.html_content,
                "provider": row.provider,
                "created_at": row.created_at.isoformat() if row.created_at else None,
            },
        }


def _architecture_project_list_item(row: ArchitectureProject) -> dict:
    return {
        "project_id": row.project_id,
        "project_name": row.project_name,
        "building_type": row.building_type,
        "style": row.style,
        "total_area": row.total_area,
        "floors": row.floors,
        "provider": row.provider,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


@router.get("/architecture-projects")
def list_architecture_projects(
    user_id: str = Query(..., min_length=1, max_length=128),
    limit: int = Query(20, ge=1, le=100),
) -> dict:
    """List persisted Architecture Visualizer records for a user (newest first)."""
    with db_session() as session:
        rows = session.scalars(
            select(ArchitectureProject)
            .where(ArchitectureProject.user_id == user_id)
            .order_by(desc(ArchitectureProject.created_at))
            .limit(limit)
        ).all()
        return {"ok": True, "items": [_architecture_project_list_item(r) for r in rows]}


@router.get("/architecture-projects/{project_id}")
def get_architecture_project(project_id: str) -> dict:
    with db_session() as session:
        row = session.get(ArchitectureProject, project_id)
        if row is None:
            raise HTTPException(status_code=404, detail="Architecture project record not found.")

        def _parse_json(text: str | None, fallback: dict) -> object:
            raw = text if isinstance(text, str) else "{}"
            try:
                out = json.loads(raw or "{}")
                return out if isinstance(out, dict) else fallback
            except json.JSONDecodeError:
                return fallback

        sustainability = _parse_json(row.sustainability_json, {})
        materials_report = _parse_json(row.materials_json, {})
        disaster_assessment = _parse_json(row.disaster_json, {})

        return {
            "ok": True,
            "item": {
                "project_id": row.project_id,
                "project_name": row.project_name,
                "building_type": row.building_type,
                "style": row.style,
                "structure_type": row.structure_type,
                "facade_material": row.facade_material,
                "roof_type": row.roof_type,
                "total_area": row.total_area,
                "floors": row.floors,
                "location_climate": row.location_climate,
                "threejs_code": row.threejs_code,
                "sustainability": sustainability,
                "materials_report": materials_report,
                "disaster_assessment": disaster_assessment,
                "provider": row.provider,
                "created_at": row.created_at.isoformat() if row.created_at else None,
            },
        }


def _generated_image_out(row: GeneratedImage) -> dict:
    return {
        "image_id": str(row.image_id),
        "conv_id": str(row.conv_id),
        "message_id": row.message_id,
        "user_id": row.user_id,
        "prompt": row.prompt,
        "style_id": row.style_id,
        "style_label": row.style_label,
        "ratio_id": row.ratio_id,
        "ratio_label": row.ratio_label,
        "provider": row.provider,
        "image_data": row.image_data,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


class GeneratedImageCreateBody(BaseModel):
    conv_id: uuid.UUID
    message_id: str = Field(..., max_length=256)
    user_id: str = Field(..., max_length=128)
    prompt: str = Field(..., max_length=2_000_000)
    style_id: str = Field(..., max_length=128)
    style_label: str = Field(..., max_length=256)
    ratio_id: str = Field(..., max_length=64)
    ratio_label: str = Field(..., max_length=256)
    provider: str = Field(default="gemini", max_length=64)
    image_data: str = Field(..., max_length=50_000_000)


@router.post("/generated-images")
def save_generated_image(body: GeneratedImageCreateBody) -> dict:
    with db_session() as session:
        conv = session.get(Conversation, body.conv_id)
        if conv is None:
            raise HTTPException(status_code=404, detail="Conversation not found.")

        row = GeneratedImage(
            conv_id=body.conv_id,
            message_id=body.message_id,
            user_id=body.user_id,
            prompt=body.prompt,
            style_id=body.style_id,
            style_label=body.style_label,
            ratio_id=body.ratio_id,
            ratio_label=body.ratio_label,
            provider=body.provider,
            image_data=body.image_data,
        )
        session.add(row)
        session.flush()
        return {"ok": True, "generated_image": _generated_image_out(row)}


@router.get("/generated-images/{conv_id}")
def list_generated_images(conv_id: uuid.UUID) -> dict:
    with db_session() as session:
        conv = session.get(Conversation, conv_id)
        if conv is None:
            raise HTTPException(status_code=404, detail="Conversation not found.")

        rows = session.scalars(
            select(GeneratedImage).where(GeneratedImage.conv_id == conv_id).order_by(GeneratedImage.created_at.asc())
        ).all()
        return {
            "ok": True,
            "conv_id": str(conv_id),
            "generated_images": [_generated_image_out(r) for r in rows],
        }
