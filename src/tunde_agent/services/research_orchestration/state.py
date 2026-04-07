"""Orchestration phases for audit logs and debugging (internal; not shown to the user)."""

from __future__ import annotations

from enum import StrEnum


class ResearchOrchestrationPhase(StrEnum):
    ORCH_START = "orch_start"
    MASTER_PLAN = "master_plan"
    EXTRACTION_PARALLEL = "extraction_parallel"
    VISION = "vision"
    ANALYST = "analyst"
    VERIFIER = "verifier"
    DESIGNER = "designer"
    MASTER_GATE = "master_gate"
    REVISION = "revision"
    ORCH_COMPLETE = "orch_complete"
