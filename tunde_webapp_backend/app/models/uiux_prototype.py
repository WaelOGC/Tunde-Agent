"""
tunde_webapp_backend/app/models/uiux_prototype.py
SQLAlchemy model for the uiux_prototypes table.
Import in db.py init_db() so create_all() builds the table.
"""

from datetime import datetime, timezone
from sqlalchemy import Column, DateTime, Index, String, Text
from .base import Base


class UIUXPrototype(Base):
    __tablename__ = "uiux_prototypes"

    proto_id        = Column(String,   primary_key=True, index=True)
    user_id         = Column(String,   nullable=False, index=True)
    session_id      = Column(String,   nullable=True,  index=True)

    # Wizard inputs
    product_name    = Column(String,   nullable=False)
    product_type    = Column(String,   nullable=False)
    industry        = Column(String,   nullable=False)
    description     = Column(Text,     nullable=False)
    platform        = Column(String,   nullable=False)
    ui_style        = Column(String,   nullable=False)
    color_theme     = Column(String,   nullable=False)
    screens_json    = Column(Text,     nullable=False, default="[]")
    components_json = Column(Text,     nullable=False, default="[]")
    primary_action  = Column(String,   nullable=True)

    # Generated output
    html_content    = Column(Text,     nullable=False)
    provider        = Column(String,   nullable=False, default="gemini")

    created_at      = Column(DateTime, nullable=False,
                             default=lambda: datetime.now(timezone.utc))
    updated_at      = Column(DateTime, nullable=False,
                             default=lambda: datetime.now(timezone.utc),
                             onupdate=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        Index("ix_uiux_prototypes_user_session", "user_id", "session_id"),
    )

    def __repr__(self) -> str:
        return f"<UIUXPrototype proto_id={self.proto_id} product={self.product_name}>"