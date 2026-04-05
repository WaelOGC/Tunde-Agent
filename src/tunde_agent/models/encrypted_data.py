"""Opaque encrypted payloads (e.g. provider credentials) per user and key name."""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, LargeBinary, String, Uuid, func, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from tunde_agent.models.base import Base

if TYPE_CHECKING:
    from tunde_agent.models.user import User


class EncryptedData(Base):
    __tablename__ = "encrypted_data"
    __table_args__ = (UniqueConstraint("user_id", "key_name", name="uq_encrypted_data_user_key"),)

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
    key_name: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    encrypted_value: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)

    user: Mapped[User] = relationship("User", back_populates="encrypted_entries")
