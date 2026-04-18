from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import Boolean, DateTime, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from tunde_webapp_backend.app.models.base import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Agent(Base):
    """
    Agent registry table (Phase 2.2).

    Note: `capabilities` is stored as JSON text for SQLite compatibility; in PostgreSQL it can be JSONB.
    """

    __tablename__ = "agents"

    agent_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    domain: Mapped[str] = mapped_column(String(80), nullable=False, unique=True, index=True)
    version: Mapped[str] = mapped_column(String(64), nullable=False, default="0.0.1")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, index=True)

    # Keep as JSON-compatible string for SQLite; when we move to Postgres we can migrate to JSONB.
    capabilities: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        default="[]",
    )

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utcnow)

