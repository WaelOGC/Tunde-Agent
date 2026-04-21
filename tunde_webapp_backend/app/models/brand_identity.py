from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from tunde_webapp_backend.app.models.base import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class BrandIdentity(Base):
    """Persisted Design Agent brand identity snapshots (Phase 1)."""

    __tablename__ = "brand_identities"

    brand_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True, default="anonymous")
    session_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True, index=True)
    conv_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True, index=True)
    message_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    brand_name: Mapped[str] = mapped_column(String(256), nullable=False, default="")
    industry: Mapped[str] = mapped_column(String(256), nullable=False, default="")
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    audience: Mapped[str] = mapped_column(String(512), nullable=False, default="")
    tone: Mapped[str] = mapped_column(String(128), nullable=False, default="")
    color_mood: Mapped[str] = mapped_column(String(128), nullable=False, default="")
    logo_style: Mapped[str] = mapped_column(String(128), nullable=False, default="")
    payload_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    provider: Mapped[str] = mapped_column(String(64), nullable=False, default="gemini")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=_utcnow,
        onupdate=_utcnow,
    )
