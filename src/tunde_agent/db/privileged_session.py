"""
Privileged SQLAlchemy sessions (DB owner / superuser) for operations that cannot run
under ``tunde_app`` RLS — e.g. inserting a new ``users`` row during OAuth registration.
"""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from tunde_agent.config.database_url import engine_connect_args
from tunde_agent.config.settings import get_settings


@contextmanager
def privileged_db_session() -> Iterator[Session]:
    """
    Commit-on-success session using ``ALEMBIC_DATABASE_URL`` (or equivalent owner URL).

    Required for OAuth ``find-or-create`` when no ``app.current_user_id`` exists yet.
    """
    settings = get_settings()
    url = (settings.alembic_database_url or "").strip()
    if not url:
        msg = "ALEMBIC_DATABASE_URL must be set for OAuth user provisioning (privileged DB URL)."
        raise RuntimeError(msg)
    engine = create_engine(url, pool_pre_ping=True, connect_args=engine_connect_args(url))
    SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
        engine.dispose()
