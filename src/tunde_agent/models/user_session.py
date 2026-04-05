"""Authenticated session record (distinct from SQLAlchemy Session)."""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, ForeignKey, String, Uuid, func, true
from sqlalchemy.orm import Mapped, mapped_column, relationship

from tunde_agent.models.base import Base

if TYPE_CHECKING:
    from tunde_agent.models.user import User


class AuthSession(Base):
    """Maps to table ``sessions``; class name avoids clashing with ``sqlalchemy.orm.Session``."""

    __tablename__ = "sessions"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=func.gen_random_uuid(),
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    session_token: Mapped[str] = mapped_column(String(512), unique=True, nullable=False, index=True)
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default=true(),
    )

    user: Mapped[User] = relationship("User", back_populates="sessions")
