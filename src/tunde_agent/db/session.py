"""
SQLAlchemy engine and request-scoped sessions with PostgreSQL RLS context.

``set_config('app.current_user_id', ..., true)`` sets a **transaction-local** GUC consumed by
policies in the initial migration (see ``docs/data_retrieval_protocol.md``).
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from contextlib import contextmanager

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from tunde_agent.config.database_url import engine_connect_args
from tunde_agent.config.settings import get_settings

_engine = None
_SessionLocal: sessionmaker[Session] | None = None


def get_engine():
    global _engine, _SessionLocal
    if _engine is None:
        url = get_settings().database_url
        _engine = create_engine(
            url,
            pool_pre_ping=True,
            connect_args=engine_connect_args(url),
        )
        _SessionLocal = sessionmaker(bind=_engine, autocommit=False, autoflush=False)
    return _engine


def _apply_rls_context(session: Session, user_id: uuid.UUID) -> None:
    """PostgreSQL Row-Level Security GUC; skipped for other dialects."""
    if session.get_bind().dialect.name != "postgresql":
        return
    session.execute(
        text("SELECT set_config('app.current_user_id', CAST(:uid AS text), true)"),
        {"uid": str(user_id)},
    )


def get_session_factory() -> sessionmaker[Session]:
    get_engine()
    assert _SessionLocal is not None
    return _SessionLocal


@contextmanager
def db_session(user_id: uuid.UUID) -> Iterator[Session]:
    """
    Open a transaction, set ``app.current_user_id`` for RLS, yield the ORM session.

    Commits on success, rolls back on exception. The GUC is local to the transaction.
    """
    SessionLocal = get_session_factory()
    session = SessionLocal()
    try:
        _apply_rls_context(session, user_id)
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def resolve_approval_from_telegram_callback(request_id: uuid.UUID, approve: bool) -> bool:
    """
    Apply Approve/Deny from Telegram without RLS context.

    Uses ``resolve_approval_from_telegram`` (SECURITY DEFINER) so ``tunde_app`` can update
    the row when Telegram polling has no ``app.current_user_id`` set.
    """
    engine = get_engine()
    if engine.dialect.name != "postgresql":
        msg = "resolve_approval_from_telegram_callback requires PostgreSQL (Telegram approval RPC)."
        raise RuntimeError(msg)
    with engine.begin() as conn:
        row = conn.execute(
            text("SELECT resolve_approval_from_telegram(CAST(:rid AS uuid), :ap)"),
            {"rid": str(request_id), "ap": approve},
        ).scalar_one()
        return bool(row)
