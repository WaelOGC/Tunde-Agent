"""
Task schema for the server-side conveyor belt.

Phase 1.3: purely in-memory lifecycle simulation (no DB, no QC logic).
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class TaskStatus(str, Enum):
    queued = "queued"
    running = "running"
    qc_review = "qc_review"
    complete = "complete"
    needs_revision = "needs_revision"
    failed = "failed"


class TaskType(str, Enum):
    """Orchestrator / tool routing identifiers."""

    BUSINESS_AGENT = "BUSINESS_AGENT"


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


class MathProblemRequest(BaseModel):
    problem: str = Field(..., min_length=1, max_length=20000)


class MathSolutionResponse(BaseModel):
    steps: list[str] = Field(default_factory=list)
    answer: str = ""
    topic: str = "general"
    confidence: str = "medium"


class ScienceQuestionRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=20000)


class ScienceAnswerResponse(BaseModel):
    domain: str = "general"
    explanation: str = ""
    key_concepts: list[str] = Field(default_factory=list)
    real_world_example: str = ""
    further_reading: list[str] = Field(default_factory=list)
    confidence: str = "medium"
    is_debated: bool = False


class ChemistryAtom(BaseModel):
    element: str = "C"
    x: float = 0.0
    y: float = 0.0
    z: float = 0.0


class ChemistryMolecule(BaseModel):
    name: str = ""
    formula: str = ""
    atoms: list[ChemistryAtom] = Field(default_factory=list)
    bonds: list[list[int]] = Field(default_factory=list)


class ChemistryQuestionRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=20000)


class ChemistryAnswerResponse(BaseModel):
    reaction_type: str = "general"
    explanation: str = ""
    balanced_equation: str = ""
    molecules: list[ChemistryMolecule] = Field(default_factory=list)
    hazard_level: str = "none"
    hazard_warning: str = ""
    safety_tips: list[str] = Field(default_factory=list)
    confidence: str = "medium"


class SpaceQuestionRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=20000)


class SpaceAnswerResponse(BaseModel):
    topic: str = "solar_system"
    explanation: str = ""
    key_facts: list[str] = Field(default_factory=list)
    scale: str = ""
    missions: list[str] = Field(default_factory=list)
    confidence: str = "medium"
    is_theoretical: bool = False
    visualization: dict[str, Any] = Field(default_factory=dict)


class HealthQuestionRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=20000)


class HealthAnswerResponse(BaseModel):
    category: str = "general"
    explanation: str = ""
    key_facts: list[str] = Field(default_factory=list)
    when_to_see_doctor: str = ""
    emergency_warning: bool = False
    sources: list[str] = Field(default_factory=list)
    confidence: str = "medium"
    disclaimer: str = (
        "This is educational information only. Always consult a qualified healthcare professional."
    )


class CodeQuestionRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=20000)


class CodeAnswerResponse(BaseModel):
    language: str = "plaintext"
    task_type: str = "write"
    code: str = ""
    explanation: str = ""
    complexity: str = ""
    best_practices: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    confidence: str = "medium"


class TranslationQuestionRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=50000)
    target_language: str = Field(default="", max_length=120)


class TranslationAnswerResponse(BaseModel):
    source_language: str = ""
    target_language: str = ""
    original_text: str = ""
    translated_text: str = ""
    transliteration: str = ""
    tone: str = "neutral"
    confidence: str = "medium"
    alternative_translations: list[str] = Field(default_factory=list)


class ResearchSourceItem(BaseModel):
    model_config = ConfigDict(extra="ignore")

    title: str = ""
    type: str = "web"
    credibility: str = "medium"


class ResearchQuestionRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=32000)


class ResearchAnswerResponse(BaseModel):
    topic: str = ""
    summary: str = ""
    key_findings: list[str] = Field(default_factory=list)
    sources: list[ResearchSourceItem] = Field(default_factory=list)
    citations: list[str] = Field(default_factory=list)
    conflicting_views: list[str] = Field(default_factory=list)
    confidence: str = "medium"
    disclaimer: str = "Research is based on AI knowledge. Always verify with primary sources."


class StudyQuestionRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=20000)


class StudyAnswerResponse(BaseModel):
    topic: str = ""
    summary: str = ""
    key_concepts: list[str] = Field(default_factory=list)
    study_plan: list[str] = Field(default_factory=list)
    memory_tips: list[str] = Field(default_factory=list)
    practice_questions: list[str] = Field(default_factory=list)
    practice_hints: list[str] = Field(default_factory=list)
    difficulty_level: str = "intermediate"
    estimated_time: str = ""
    confidence: str = "medium"


class DataAnalysisRequest(BaseModel):
    data: str = Field(..., min_length=1, max_length=500_000)
    dataset_name: str = Field(default="", max_length=512)


class DataQualityReport(BaseModel):
    score: str = "fair"
    notes: str = ""


class DataAnalysisResponse(BaseModel):
    dataset_name: str = "Dataset"
    row_count: int = 0
    column_count: int = 0
    columns: list[str] = Field(default_factory=list)
    summary_stats: dict[str, dict[str, Any]] = Field(default_factory=dict)
    key_insights: list[str] = Field(default_factory=list)
    ai_narrative: str = ""
    smart_alerts: list[str] = Field(default_factory=list)
    data_quality: DataQualityReport = Field(default_factory=DataQualityReport)
    confidence: str = "medium"
    chart_data: dict[str, Any] = Field(default_factory=dict)
    trends: list[dict[str, Any]] = Field(default_factory=list)
    predictions: list[dict[str, Any]] = Field(default_factory=list)


class DataFollowUpRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=8000)
    original_data: str = Field(default="", max_length=500_000)
    previous_analysis: dict[str, Any] = Field(default_factory=dict)


class DataFollowUpResponse(BaseModel):
    answer: str = ""


class DocumentWriterRequest(BaseModel):
    request: str = Field(..., min_length=1, max_length=32000)


class DocumentAnswerResponse(BaseModel):
    document_type: str = "other"
    title: str = ""
    content: str = ""
    word_count: int = 0
    tone: str = "formal"
    language: str = "English"
    sections: list[str] = Field(default_factory=list)
    confidence: str = "medium"


# --- Business Agent (structured canvas + persistence) ---


class BusinessResearchRunRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=8000)
    user_id: str = Field(default="anonymous", max_length=128)
    session_id: uuid.UUID | None = None
    include_live_search: bool = True


class BusinessScenarioSimulateRequest(BaseModel):
    """What-if P/L: simple deterministic projection (basis points on revenue / margin)."""

    label: str = Field(default="Scenario", max_length=256)
    base_revenue: float = Field(default=1_000_000, ge=0)
    revenue_growth_yoy: float = Field(default=0.12, ge=-0.95, le=5.0)
    cogs_ratio: float = Field(default=0.42, ge=0, le=0.99)
    opex_ratio: float = Field(default=0.28, ge=0, le=0.99)
    tax_rate: float = Field(default=0.21, ge=0, le=0.6)
    periods: int = Field(default=4, ge=1, le=12)


class BusinessScenarioSimulateResponse(BaseModel):
    label: str = ""
    assumptions: list[str] = Field(default_factory=list)
    pl_rows: list[list[str]] = Field(default_factory=list)
    chart_series: dict[str, Any] = Field(default_factory=dict)
    warnings: list[str] = Field(default_factory=list)


class BusinessAgentFullResponse(BaseModel):
    """Single payload consumed by BusinessAnalysisCanvas + chat `business_solution` blocks."""

    model_config = ConfigDict(extra="ignore")

    research_id: uuid.UUID | None = None
    session_id: uuid.UUID = Field(default_factory=uuid.uuid4)
    query: str = ""
    confidence: str = "medium"
    search_status: str = ""  # ok | partial | unavailable
    narrative_summary: str = ""
    market_analysis: dict[str, Any] = Field(default_factory=dict)
    competitor_analysis: dict[str, Any] = Field(default_factory=dict)
    competitor_radar: dict[str, Any] = Field(default_factory=dict)
    review_sentiment: dict[str, Any] = Field(default_factory=dict)
    swot: dict[str, Any] = Field(default_factory=dict)
    scenario_simulation: dict[str, Any] = Field(default_factory=dict)
    market_cap: dict[str, Any] = Field(default_factory=dict)
    smart_accounting: dict[str, Any] = Field(default_factory=dict)
    future_outlook: dict[str, Any] = Field(default_factory=dict)
    canvas_html: str = Field(
        default="",
        description="Optional minimal HTML fragment for Landing-style embeds.",
        max_length=500_000,
    )


class BusinessResearchSaveBody(BaseModel):
    user_id: str = Field(..., max_length=128)
    session_id: uuid.UUID | None = None
    niche_query: str = Field(default="", max_length=8000)
    payload: dict[str, Any] = Field(default_factory=dict)
    accounting_snapshot: dict[str, Any] | None = None

