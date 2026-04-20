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
from tunde_webapp_backend.app.models.business_research import BusinessResearch
from tunde_webapp_backend.app.models.canvas_page import CanvasPage
from tunde_webapp_backend.app.models.conversation import Conversation
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
