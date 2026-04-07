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

from tunde_agent.config.settings import get_settings

_engine = None
_SessionLocal: sessionmaker[Session] | None = None


def get_engine():
    global _engine, _SessionLocal
    if _engine is None:
        _engine = create_engine(get_settings().database_url, pool_pre_ping=True)
        _SessionLocal = sessionmaker(bind=_engine, autocommit=False, autoflush=False)
    return _engine


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
        session.execute(
            text("SELECT set_config('app.current_user_id', CAST(:uid AS text), true)"),
            {"uid": str(user_id)},
        )
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
    with get_engine().begin() as conn:
        row = conn.execute(
            text("SELECT resolve_approval_from_telegram(CAST(:rid AS uuid), :ap)"),
            {"rid": str(request_id), "ap": approve},
        ).scalar_one()
        return bool(row)
