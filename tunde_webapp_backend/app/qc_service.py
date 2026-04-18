"""
QC gateway (Phase 1.4): mock decision service.

This does NOT implement AI checking prompts yet; it only simulates pass/fail and returns feedback.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from tunde_webapp_backend.app.task_models import Task

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class QCResult:
    approved: bool
    feedback: str


class QCService:
    """
    Mock QC rules:
    - If payload contains {"force_reject": true} → always reject
    - Else approve
    """

    async def review(self, task: Task, *, attempt: int) -> QCResult:
        # Attempt is included for future use (escalation rules, stricter checks, etc.).
        payload = task.payload or {}
        force_reject = bool(payload.get("force_reject"))
        if force_reject:
            fb = "Mock QC rejection (force_reject=true). Please revise the output and try again."
            logger.info("[cid=%s task_id=%s] qc=reject attempt=%s", task.correlation_id, task.task_id, attempt)
            return QCResult(approved=False, feedback=fb)

        fb = "Mock QC approval."
        logger.info("[cid=%s task_id=%s] qc=approve attempt=%s", task.correlation_id, task.task_id, attempt)
        return QCResult(approved=True, feedback=fb)


qc_service = QCService()

