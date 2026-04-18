from __future__ import annotations

import json
import uuid
from dataclasses import dataclass
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from tunde_webapp_backend.app.models.conversation import Conversation
from tunde_webapp_backend.app.models.message import Message
from tunde_webapp_backend.app.models.qc_audit_log import QCAuditLog
from tunde_webapp_backend.app.models.task_execution import TaskExecution, TaskStatusEvent


@dataclass(frozen=True, slots=True)
class ConversationInput:
    user_id: str


class LogRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    # --- Conversations & messages ---
    def create_conversation(self, inp: ConversationInput) -> Conversation:
        uid = (inp.user_id or "").strip() or "anonymous"
        row = Conversation(user_id=uid)
        self._session.add(row)
        self._session.flush()
        return row

    def add_message(self, *, conv_id: uuid.UUID, role: str, content: str) -> Message:
        r = (role or "").strip().lower()
        if r not in ("user", "ceo"):
            raise ValueError("role must be user|ceo")
        c = (content or "").strip()
        if not c:
            raise ValueError("content is required")
        row = Message(conv_id=conv_id, role=r, content=c)
        self._session.add(row)
        self._session.flush()
        return row

    # --- Task execution + step events ---
    def create_task_execution(
        self,
        *,
        task_id: uuid.UUID,
        correlation_id: uuid.UUID,
        status: str,
        agent_id: uuid.UUID | None = None,
    ) -> TaskExecution:
        row = TaskExecution(
            task_id=task_id,
            correlation_id=correlation_id,
            agent_id=agent_id,
            status=status,
        )
        self._session.add(row)
        self._session.flush()
        return row

    def update_task_status(self, *, task_id: uuid.UUID, status: str) -> None:
        row = self._session.get(TaskExecution, task_id)
        if row is None:
            raise ValueError("task_execution not found")
        row.status = status

    def set_final_result(self, *, task_id: uuid.UUID, final_result: dict[str, Any] | None) -> None:
        row = self._session.get(TaskExecution, task_id)
        if row is None:
            raise ValueError("task_execution not found")
        if final_result is None:
            row.final_result = None
        else:
            row.final_result = json.dumps(final_result, ensure_ascii=False, separators=(",", ":"))

    def add_task_status_event(
        self,
        *,
        task_id: uuid.UUID,
        correlation_id: uuid.UUID,
        status: str,
        message: str,
    ) -> TaskStatusEvent:
        row = TaskStatusEvent(
            task_id=task_id,
            correlation_id=correlation_id,
            status=status,
            message=message,
        )
        self._session.add(row)
        self._session.flush()
        return row

    # --- QC audit logs ---
    def add_qc_audit(
        self,
        *,
        task_id: uuid.UUID,
        attempt_number: int,
        approved: bool,
        feedback: str,
    ) -> QCAuditLog:
        row = QCAuditLog(
            task_id=task_id,
            attempt_number=int(attempt_number),
            approved=bool(approved),
            feedback=str(feedback or ""),
        )
        self._session.add(row)
        self._session.flush()
        return row

