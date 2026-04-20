from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from tunde_webapp_backend.app.models.base import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class GeneratedImage(Base):
    """Persisted dashboard-generated images (base64 data URL)."""

    __tablename__ = "generated_images"

    image_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    conv_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("conversations.conv_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    message_id: Mapped[str] = mapped_column(String(256), nullable=False)
    user_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    prompt: Mapped[str] = mapped_column(Text, nullable=False)
    style_id: Mapped[str] = mapped_column(String(128), nullable=False)
    style_label: Mapped[str] = mapped_column(String(256), nullable=False)
    ratio_id: Mapped[str] = mapped_column(String(64), nullable=False)
    ratio_label: Mapped[str] = mapped_column(String(256), nullable=False)
    provider: Mapped[str] = mapped_column(String(64), nullable=False, default="gemini")
    image_data: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utcnow)
