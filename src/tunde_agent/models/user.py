"""User account model."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, String, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from tunde_agent.models.base import Base

if TYPE_CHECKING:
    from tunde_agent.models.approval_request import ApprovalRequest
    from tunde_agent.models.audit_log import AuditLog
    from tunde_agent.models.encrypted_data import EncryptedData
    from tunde_agent.models.user_session import AuthSession


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=func.gen_random_uuid(),
    )
    email: Mapped[str] = mapped_column(String(320), unique=True, nullable=False, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    sessions: Mapped[list[AuthSession]] = relationship(
        "AuthSession",
        back_populates="user",
        cascade="all, delete-orphan",
    )
    audit_logs: Mapped[list[AuditLog]] = relationship(
        "AuditLog",
        back_populates="user",
        cascade="all, delete-orphan",
    )
    encrypted_entries: Mapped[list[EncryptedData]] = relationship(
        "EncryptedData",
        back_populates="user",
        cascade="all, delete-orphan",
    )
    approval_requests: Mapped[list[ApprovalRequest]] = relationship(
        "ApprovalRequest",
        back_populates="user",
        cascade="all, delete-orphan",
    )
