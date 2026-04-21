"""
tunde_webapp_backend/app/models/architecture_project.py
SQLAlchemy model for architecture_projects table.
Import in db.py init_db() so create_all() builds the table.
"""

from datetime import datetime, timezone
from sqlalchemy import Column, DateTime, Float, Index, Integer, String, Text
from .base import Base


class ArchitectureProject(Base):
    __tablename__ = "architecture_projects"

    project_id           = Column(String,  primary_key=True, index=True)
    user_id              = Column(String,  nullable=False, index=True)
    session_id           = Column(String,  nullable=True,  index=True)

    # Wizard inputs
    project_name         = Column(String,  nullable=False)
    building_type        = Column(String,  nullable=False)
    description          = Column(Text,    nullable=False)
    location_climate     = Column(String,  nullable=False)
    total_area           = Column(Float,   nullable=False)
    floors               = Column(Integer, nullable=False)
    floor_height         = Column(Float,   nullable=True, default=3.0)
    rooms_json           = Column(Text,    nullable=False, default="[]")
    special_requirements = Column(Text,    nullable=True)
    style                = Column(String,  nullable=False)
    structure_type       = Column(String,  nullable=False)
    facade_material      = Column(String,  nullable=False)
    roof_type            = Column(String,  nullable=False)

    # Generated output
    threejs_code         = Column(Text,    nullable=False)
    sustainability_json  = Column(Text,    nullable=False, default="{}")
    materials_json       = Column(Text,    nullable=False, default="{}")
    disaster_json        = Column(Text,    nullable=False, default="{}")
    provider             = Column(String,  nullable=False, default="gemini")

    created_at           = Column(DateTime, nullable=False,
                                  default=lambda: datetime.now(timezone.utc))
    updated_at           = Column(DateTime, nullable=False,
                                  default=lambda: datetime.now(timezone.utc),
                                  onupdate=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        Index("ix_architecture_projects_user_session", "user_id", "session_id"),
    )

    def __repr__(self) -> str:
        return f"<ArchitectureProject id={self.project_id} name={self.project_name}>"