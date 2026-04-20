"""
HTTP endpoints to create tasks for orchestration simulation.

Phase 1.3: minimal POST to enqueue a task and return IDs. UI will listen on WebSocket for progress.

Also exposes tool HTTP APIs (Math Solver, Science Agent, etc.) under ``/tools``.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Response

from tunde_agent.services.llm_service import LLMError

from tunde_webapp_backend.app.orchestrator import task_orchestrator
from tunde_webapp_backend.app.task_models import (
    ChemistryAnswerResponse,
    ChemistryQuestionRequest,
    CodeAnswerResponse,
    CodeQuestionRequest,
    DataAnalysisRequest,
    DataAnalysisResponse,
    DataFollowUpRequest,
    DataFollowUpResponse,
    DocumentAnswerResponse,
    DocumentWriterRequest,
    HealthAnswerResponse,
    HealthQuestionRequest,
    MathProblemRequest,
    MathSolutionResponse,
    ScienceAnswerResponse,
    ScienceQuestionRequest,
    SpaceAnswerResponse,
    SpaceQuestionRequest,
    TaskSubmitRequest,
    TaskSubmitResponse,
    ResearchAnswerResponse,
    ResearchQuestionRequest,
    StudyAnswerResponse,
    StudyQuestionRequest,
    TranslationAnswerResponse,
    TranslationQuestionRequest,
)
from tunde_webapp_backend.app.tools.chemistry_agent import explain_chemistry_question
from tunde_webapp_backend.app.tools.code_assistant import assist_code_question
from tunde_webapp_backend.app.tools.health_agent import explain_health_question
from tunde_webapp_backend.app.tools.math_solver import solve_math_problem
from tunde_webapp_backend.app.tools.science_agent import explain_science_question
from tunde_webapp_backend.app.tools.space_agent import explain_space_question
from tunde_webapp_backend.app.tools.data_analyst import run_data_analysis, run_data_follow_up
from tunde_webapp_backend.app.tools.document_writer import write_document
from tunde_webapp_backend.app.tools.research_agent import research_question
from tunde_webapp_backend.app.tools.study_assistant import study_topic
from tunde_webapp_backend.app.tools.translation_agent import translate_text

router = APIRouter(prefix="/tasks", tags=["tasks"])
tools_router = APIRouter(prefix="/tools", tags=["tools"])


@router.post("/submit", response_model=TaskSubmitResponse)
async def submit_task(body: TaskSubmitRequest) -> TaskSubmitResponse:
    task = await task_orchestrator.submit(payload=body.payload)
    return TaskSubmitResponse(task_id=task.task_id, correlation_id=task.correlation_id, status=task.status)


@tools_router.post("/math", response_model=MathSolutionResponse)
async def math_solve(body: MathProblemRequest) -> MathSolutionResponse:
    """
    Solve a math problem via the Math Agent (LLM JSON contract).
    """
    try:
        result = await solve_math_problem(body.problem)
        return MathSolutionResponse(**result)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except LLMError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@tools_router.post("/science", response_model=ScienceAnswerResponse)
async def science_explain(body: ScienceQuestionRequest) -> ScienceAnswerResponse:
    """
    Structured science explanation via the Science Agent (LLM JSON contract).
    """
    try:
        result = await explain_science_question(body.question)
        return ScienceAnswerResponse(**result)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except LLMError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@tools_router.post("/chemistry", response_model=ChemistryAnswerResponse)
async def chemistry_explain(body: ChemistryQuestionRequest) -> ChemistryAnswerResponse:
    """
    Structured chemistry answer + molecular geometry for the Chemistry Agent (LLM JSON contract).
    """
    try:
        result = await explain_chemistry_question(body.question)
        return ChemistryAnswerResponse.model_validate(result)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except LLMError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@tools_router.post("/space", response_model=SpaceAnswerResponse)
async def space_explain(body: SpaceQuestionRequest) -> SpaceAnswerResponse:
    """
    Structured astronomy answer + visualization payload for the Space Agent (LLM JSON contract).
    """
    try:
        result = await explain_space_question(body.question)
        return SpaceAnswerResponse.model_validate(result)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except LLMError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@tools_router.post("/health", response_model=HealthAnswerResponse)
async def health_explain(body: HealthQuestionRequest, response: Response) -> HealthAnswerResponse:
    """
    Structured health education via the Health Agent (LLM JSON contract).
    Sets ``X-Emergency: true`` when emergency_warning is true.
    """
    try:
        result = await explain_health_question(body.question)
        out = HealthAnswerResponse(**result)
        if out.emergency_warning:
            response.headers["X-Emergency"] = "true"
        return out
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except LLMError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@tools_router.post("/code", response_model=CodeAnswerResponse)
async def code_assist(body: CodeQuestionRequest) -> CodeAnswerResponse:
    """
    Structured code assistance via the Code Assistant (LLM JSON contract).
    """
    try:
        result = await assist_code_question(body.question)
        return CodeAnswerResponse(**result)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except LLMError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@tools_router.post("/translation", response_model=TranslationAnswerResponse)
async def translation_translate(body: TranslationQuestionRequest) -> TranslationAnswerResponse:
    """
    Structured translation via the Translation Agent (LLM JSON contract).
    """
    try:
        result = await translate_text(body.text, body.target_language)
        return TranslationAnswerResponse(**result)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except LLMError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@tools_router.post("/research", response_model=ResearchAnswerResponse)
async def research_run(body: ResearchQuestionRequest) -> ResearchAnswerResponse:
    """
    Structured research synthesis via the Research Agent (LLM JSON contract).
    """
    try:
        result = await research_question(body.question)
        return ResearchAnswerResponse.model_validate(result)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except LLMError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@tools_router.post("/document", response_model=DocumentAnswerResponse)
async def document_writer_run(body: DocumentWriterRequest) -> DocumentAnswerResponse:
    """
    Structured professional documents via the Document Writer (LLM JSON contract).
    """
    try:
        result = await write_document(body.request)
        return DocumentAnswerResponse.model_validate(result)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except LLMError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@tools_router.post("/study", response_model=StudyAnswerResponse)
async def study_run(body: StudyQuestionRequest) -> StudyAnswerResponse:
    """
    Structured study plan and practice via the Study Assistant (LLM JSON contract).
    """
    try:
        result = await study_topic(body.question)
        return StudyAnswerResponse.model_validate(result)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except LLMError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@tools_router.post("/data-analysis", response_model=DataAnalysisResponse)
async def data_analysis_run(body: DataAnalysisRequest) -> DataAnalysisResponse:
    """
    Structured tabular analysis via the Data Analyst (parse + stats + LLM JSON contract).
    """
    try:
        result = await run_data_analysis(body.data, body.dataset_name)
        return DataAnalysisResponse.model_validate(result)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except LLMError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@tools_router.post("/data-follow-up", response_model=DataFollowUpResponse)
async def data_follow_up_run(body: DataFollowUpRequest) -> DataFollowUpResponse:
    """
    Focused answer to a follow-up question about a prior data analysis (uses snapshot + optional raw data).
    """
    try:
        result = await run_data_follow_up(
            body.question,
            body.original_data,
            body.previous_analysis,
        )
        return DataFollowUpResponse.model_validate(result)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except LLMError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
