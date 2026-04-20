from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from tunde_webapp_backend.app.models.base import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class ToolResult(Base):
    """Permanent store for every tool invocation result (JSON payload)."""

    __tablename__ = "tool_results"

    result_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    conv_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("conversations.conv_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    message_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("messages.message_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    tool_type: Mapped[str] = mapped_column(String(64), nullable=False)
    input_data: Mapped[str] = mapped_column(Text, nullable=False)
    result_json: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utcnow)
