"""
tunde_webapp_backend/app/models/web_page_design.py
SQLAlchemy model for the web_page_designs table.
Import in db.py init_db() so create_all() builds the table.
"""

from datetime import datetime, timezone
from sqlalchemy import Column, DateTime, Index, String, Text
from .base import Base


class WebPageDesign(Base):
    __tablename__ = "web_page_designs"

    page_id       = Column(String,   primary_key=True, index=True)
    user_id       = Column(String,   nullable=False, index=True)
    session_id    = Column(String,   nullable=True,  index=True)

    # Wizard inputs
    business_name = Column(String,   nullable=False)
    industry      = Column(String,   nullable=False)
    description   = Column(Text,     nullable=False)
    audience      = Column(String,   nullable=False)
    page_style    = Column(String,   nullable=False)
    color_scheme  = Column(String,   nullable=False)
    sections_json = Column(Text,     nullable=False, default="[]")
    cta_text      = Column(String,   nullable=True)

    # Generated output
    html_content  = Column(Text,     nullable=False)
    provider      = Column(String,   nullable=False, default="gemini")

    created_at    = Column(DateTime, nullable=False,
                           default=lambda: datetime.now(timezone.utc))
    updated_at    = Column(DateTime, nullable=False,
                           default=lambda: datetime.now(timezone.utc),
                           onupdate=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        Index("ix_web_page_designs_user_session", "user_id", "session_id"),
    )

    def __repr__(self) -> str:
        return f"<WebPageDesign page_id={self.page_id} name={self.business_name}>"