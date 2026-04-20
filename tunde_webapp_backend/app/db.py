"""
Database setup (Phase 2.2: Agents table only).

- Default: local SQLite for dev
- Goal: SQLAlchemy-compatible so we can switch to PostgreSQL later
"""

from __future__ import annotations

import os
from contextlib import contextmanager
from typing import Iterator

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

DEFAULT_SQLITE_URL = "sqlite:///./tunde_dev.db"


def database_url() -> str:
    # Intentionally separate from the legacy repo DATABASE_URL.
    return (os.getenv("TUNDE_DATABASE_URL") or os.getenv("TONDA_DATABASE_URL") or "").strip() or DEFAULT_SQLITE_URL


def build_engine() -> Engine:
    url = database_url()
    # SQLite needs `check_same_thread=False` when used from background tasks.
    connect_args = {"check_same_thread": False} if url.startswith("sqlite:") else {}
    return create_engine(url, future=True, echo=False, connect_args=connect_args)


engine = build_engine()
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False, class_=Session)


@contextmanager
def db_session() -> Iterator[Session]:
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def init_db() -> None:
    # Import models so metadata is populated.
    from tunde_webapp_backend.app.models.base import Base
    # Explicit imports keep create_all deterministic (Phase 2.3: conversations + execution logs).
    from tunde_webapp_backend.app.models.agent import Agent  # noqa: F401
    from tunde_webapp_backend.app.models.conversation import Conversation  # noqa: F401
    from tunde_webapp_backend.app.models.message import Message  # noqa: F401
    from tunde_webapp_backend.app.models.task_execution import TaskExecution, TaskStatusEvent  # noqa: F401
    from tunde_webapp_backend.app.models.qc_audit_log import QCAuditLog  # noqa: F401
    from tunde_webapp_backend.app.models.published_page import PublishedPage  # noqa: F401
    from tunde_webapp_backend.app.models.user_integration import UserIntegration  # noqa: F401
    from tunde_webapp_backend.app.models.tool_result import ToolResult  # noqa: F401
    from tunde_webapp_backend.app.models.canvas_page import CanvasPage  # noqa: F401

    Base.metadata.create_all(bind=engine)

