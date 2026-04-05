"""FastAPI application entrypoint."""

from __future__ import annotations

import json
import logging
import uuid

from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel, Field

from tunde_agent import __version__
from tunde_agent.config.settings import TUNDE_PERSONA, get_settings

logger = logging.getLogger(__name__)

# Fail fast if required environment (e.g. DATABASE_URL) is missing
get_settings()

app = FastAPI(
    title="Tunde Agent",
    version=__version__,
    summary=TUNDE_PERSONA.role_summary,
)


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=32000)
    """User turn; not stored verbatim in audit logs."""
    user_id: uuid.UUID | None = Field(
        default=None,
        description="RLS principal; defaults to seeded smoke user in development.",
    )


class ChatResponse(BaseModel):
    reply: str


@app.get("/health")
def health_check() -> dict[str, str]:
    """Liveness probe; does not verify database connectivity."""
    return {"status": "ok"}


@app.get("/health/db-rls-smoke")
def db_rls_smoke() -> dict[str, str | bool]:
    """
    Writes a row to ``audit_logs`` under the seeded smoke user with RLS context set.

    Requires migrations applied and ``DATABASE_URL`` as ``tunde_app`` (non-superuser).
    """
    from tunde_agent.constants import SMOKE_TEST_USER_ID
    from tunde_agent.db.session import db_session
    from tunde_agent.models.audit_log import AuditLog

    try:
        with db_session(SMOKE_TEST_USER_ID) as session:
            row = AuditLog(
                user_id=SMOKE_TEST_USER_ID,
                action_type="db_rls_smoke",
                details="RLS session variable + audit insert check",
            )
            session.add(row)
            session.flush()
            audit_id = str(row.id)
        return {"ok": True, "audit_log_id": audit_id}
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail=f"Database or RLS check failed: {exc!s}",
        ) from exc


@app.post("/chat", response_model=ChatResponse)
def chat(body: ChatRequest) -> ChatResponse:
    """
    Send a message to Tunde (Gemini or DeepSeek per ``DEFAULT_LLM_PROVIDER``).
    Logs a minimal audit row (provider + event type only—no message content).
    """
    from tunde_agent.constants import SMOKE_TEST_USER_ID
    from tunde_agent.db.session import db_session
    from tunde_agent.models.audit_log import AuditLog
    from tunde_agent.services.llm_service import LLMError, LLMService
    from tunde_agent.services.prompt_manager import PromptManager

    uid = body.user_id or SMOKE_TEST_USER_ID
    try:
        service = LLMService(get_settings(), PromptManager())
        reply = service.chat(body.message)
    except LLMError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    audit_meta = json.dumps(
        {"provider": service.provider_label, "event": "llm_chat"},
        separators=(",", ":"),
    )
    try:
        with db_session(uid) as session:
            session.add(
                AuditLog(
                    user_id=uid,
                    action_type="llm_chat",
                    details=audit_meta,
                )
            )
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail=f"Reply generated but audit logging failed: {exc!s}",
        ) from exc

    return ChatResponse(reply=reply)


@app.get("/test-browse")
def test_browse(
    url: str = Query(..., min_length=12, max_length=2048, description="http(s) URL to open."),
    user_id: uuid.UUID | None = Query(
        default=None,
        description="RLS principal; defaults to seeded smoke user in development.",
    ),
    headed: bool = Query(
        False,
        description="If true, run a visible browser window (headed) for debugging.",
    ),
) -> dict:
    """
    Smoke-test Playwright: navigate, apply CAPTCHA policy, return page title.

    Requires Chromium available (``playwright install chromium`` locally; Docker image installs it).
    """
    from tunde_agent.constants import SMOKE_TEST_USER_ID
    from tunde_agent.tools.browser.research_tool import run_test_browse

    uid = user_id or SMOKE_TEST_USER_ID
    try:
        return run_test_browse(url, uid, headless=not headed)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("test-browse failed for url=%s", url[:80])
        raise HTTPException(
            status_code=503,
            detail=f"Browser automation failed: {exc!s}",
        ) from exc
