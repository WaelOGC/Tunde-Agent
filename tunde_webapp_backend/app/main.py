"""
Tunde Web App Backend (Phase 1.1 baseline).

- FastAPI application init
- /health endpoint
- structured JSON logging
"""

from __future__ import annotations

from pathlib import Path

from dotenv import load_dotenv

# Repo root `.env` (not cwd) so `uvicorn` picks up OAuth keys from any working directory.
# `override=True`: otherwise an empty `GOOGLE_CLIENT_ID` in the process env blocks values from `.env`.
load_dotenv(Path(__file__).resolve().parents[2] / ".env", override=True)

import os

import sys
import logging

# Allow `py app/main.py` from within `tunde_webapp_backend/` on Windows
# without requiring the user to set PYTHONPATH or install the package.
if __name__ == "__main__" and "tunde_webapp_backend" not in sys.modules:
    repo_root = Path(__file__).resolve().parents[2]
    if str(repo_root) not in sys.path:
        sys.path.insert(0, str(repo_root))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from tunde_webapp_backend.app.custom_logging import configure_structured_logging
from tunde_webapp_backend.app.ws_router import router as ws_router
from tunde_webapp_backend.app.task_router import router as task_router, tools_router as tools_http_router
from tunde_webapp_backend.app.file_router import router as file_router
from tunde_webapp_backend.app.pages_router import api_router as pages_api_router
from tunde_webapp_backend.app.pages_router import share_router as pages_share_router
from tunde_webapp_backend.app.auth_router import router as auth_router
from tunde_webapp_backend.app.db_router import router as db_router
from tunde_webapp_backend.app.business_router import router as business_router
from tunde_webapp_backend.app.db import init_db
from tunde_webapp_backend.app.seed_agents import seed_default_agents

logger = logging.getLogger(__name__)


def create_app() -> FastAPI:
    # Structured logs first so startup logs are JSON.
    configure_structured_logging(
        level=(os.getenv("TUNDE_LOG_LEVEL") or os.getenv("TONDA_LOG_LEVEL") or "INFO"),
        service=(os.getenv("TUNDE_SERVICE_NAME") or os.getenv("TONDA_SERVICE_NAME") or "tunde_webapp_backend"),
    )

    app = FastAPI(title="Tunde Agent Web Backend", version="0.0.1")

    # Local dev CORS for the dashboard UI (Vite default: http://localhost:5173).
    # Note: WebSockets are not governed by CORS, but the dashboard also calls HTTP endpoints (/tasks/submit).
    origins_env = (os.getenv("TUNDE_CORS_ORIGINS") or "").strip()
    allow_origins = [o.strip() for o in origins_env.split(",") if o.strip()] if origins_env else [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allow_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.on_event("startup")
    def _startup() -> None:
        # Phase 2.2: ensure Agents table exists and seed the first domains.
        init_db()
        seed_default_agents()

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    app.include_router(ws_router)
    app.include_router(task_router)
    app.include_router(tools_http_router)
    app.include_router(file_router)
    app.include_router(pages_api_router)
    app.include_router(pages_share_router)
    app.include_router(auth_router)
    app.include_router(db_router)
    app.include_router(business_router)

    logger.info("tunde backend initialized")
    return app


app = create_app()


if __name__ == "__main__":
    # Developer convenience: allow `py app/main.py` to start a server on Windows.
    # Use `TUNDE_WEBAPP_PORT` to avoid clashing with the primary API on 8000.
    import uvicorn

    port = int((os.getenv("TUNDE_WEBAPP_PORT") or "8001").strip())
    uvicorn.run(
        "tunde_webapp_backend.app.main:app",
        host=os.getenv("TUNDE_WEBAPP_HOST") or "127.0.0.1",
        port=port,
        reload=True,
        ws_max_size=int((os.getenv("TUNDE_WS_MAX_SIZE") or str(32 * 1024 * 1024)).strip()),
        # Avoid infinite reload loops: our dev SQLite writes (*.db) would otherwise trigger watchfiles reload.
        reload_excludes=[
            "*.db",
            "*.sqlite",
            "*.sqlite3",
            "tunde_dev.db",
        ],
        log_level=(os.getenv("TUNDE_LOG_LEVEL") or "info").lower(),
    )
