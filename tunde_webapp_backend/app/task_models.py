"""
Task schema for the server-side conveyor belt.

Phase 1.3: purely in-memory lifecycle simulation (no DB, no QC logic).
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class TaskStatus(str, Enum):
    queued = "queued"
    running = "running"
    qc_review = "qc_review"
    complete = "complete"
    needs_revision = "needs_revision"
    failed = "failed"


def utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class Task(BaseModel):
    task_id: uuid.UUID = Field(default_factory=uuid.uuid4)
    correlation_id: uuid.UUID = Field(default_factory=uuid.uuid4)
    status: TaskStatus = TaskStatus.queued
    payload: dict[str, Any] = Field(default_factory=dict)
    result: dict[str, Any] | None = None
    created_at: str = Field(default_factory=utc_iso)


class TaskSubmitRequest(BaseModel):
    payload: dict[str, Any] = Field(default_factory=dict)


class TaskSubmitResponse(BaseModel):
    task_id: uuid.UUID
    correlation_id: uuid.UUID
    status: TaskStatus

