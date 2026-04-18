"""FastAPI application entrypoint."""

from __future__ import annotations

import json
import logging
import uuid
from contextlib import asynccontextmanager

import threading
import os

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from tunde_agent import __version__
from tunde_agent.api.mission import router as mission_router
from tunde_agent.api.report import router as report_router
from tunde_agent.config.settings import TUNDE_PERSONA, get_settings

logger = logging.getLogger(__name__)

# Fail fast if required environment (e.g. DATABASE_URL) is missing
get_settings()


@asynccontextmanager
async def _lifespan(app: FastAPI):
    """Startup: log routes, clear Telegram webhook, start long-polling thread for approvals."""
    print("DEBUG: Checking Telegram Configuration...", flush=True)
    settings = get_settings()
    token = (settings.telegram_token or "").strip()
    if not token:
        print(
            "ERROR: Telegram Token is MISSING or EMPTY. Poller will not start!",
            flush=True,
        )
        logger.critical(
            "Telegram Token is MISSING or EMPTY. Poller will not start! "
            "Set TELEGRAM_TOKEN in .env (and ensure Docker passes it — see docker-compose env_file)."
        )
        poller_stop = None
        poller_thread = None
    else:
        print("DEBUG: Token found. Starting Poller thread...", flush=True)
        poller_stop = threading.Event()
        from telegram_agent_core.services.telegram_poller import start_telegram_poller_thread

        poller_thread = start_telegram_poller_thread(poller_stop)

    paths = sorted(
        {p for r in app.routes if (p := getattr(r, "path", None)) and isinstance(p, str)}
    )
    print(f"Registered routes: {paths}", flush=True)

    yield

    if poller_stop is not None:
        poller_stop.set()
        if poller_thread is not None and poller_thread.is_alive():
            poller_thread.join(timeout=8)
        print("Telegram polling thread stop requested.", flush=True)


app = FastAPI(
    title="Tunde Agent",
    version=__version__,
    summary=TUNDE_PERSONA.role_summary,
    lifespan=_lifespan,
)

# --- Web / Dashboard integrations (Vite SPA + WebSocket) ---
# The web UI lives in `tunde_webapp_frontend/` (Vite dev server default: http://localhost:5173).
# Allow local dev origins; configure via TUNDE_CORS_ORIGINS when needed.
cors_env = (os.getenv("TUNDE_CORS_ORIGINS") or "").strip()
default_origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]
allow_origins = [o.strip() for o in cors_env.split(",") if o.strip()] if cors_env else default_origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount the webapp transport endpoints on the primary API app so the dashboard can connect
# even when running `uvicorn tunde_agent.main:app --reload`.
try:
    from tunde_webapp_backend.app.ws_router import router as tunde_ws_router
    from tunde_webapp_backend.app.task_router import router as tunde_task_router

    app.include_router(tunde_ws_router)
    app.include_router(tunde_task_router)
except Exception as exc:  # pragma: no cover
    # Keep core API functional if optional webapp module deps are missing.
    logger.warning("Webapp routers not mounted: %s", str(exc)[:200])

app.include_router(mission_router)
app.include_router(report_router)


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
