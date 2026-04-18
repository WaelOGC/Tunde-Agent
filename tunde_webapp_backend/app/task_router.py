"""
HTTP endpoints to create tasks for orchestration simulation.

Phase 1.3: minimal POST to enqueue a task and return IDs. UI will listen on WebSocket for progress.
"""

from __future__ import annotations

from fastapi import APIRouter

from tunde_webapp_backend.app.orchestrator import task_orchestrator
from tunde_webapp_backend.app.task_models import TaskSubmitRequest, TaskSubmitResponse

router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.post("/submit", response_model=TaskSubmitResponse)
async def submit_task(body: TaskSubmitRequest) -> TaskSubmitResponse:
    task = await task_orchestrator.submit(payload=body.payload)
    return TaskSubmitResponse(task_id=task.task_id, correlation_id=task.correlation_id, status=task.status)

