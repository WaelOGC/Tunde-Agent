"""OAuth (Google/GitHub): nullable password, provider ids, display name.

Revision ID: 003_oauth
Revises: 002_approval
Create Date: 2026-04-18

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "003_oauth"
down_revision = "002_approval"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("users", "hashed_password", existing_type=sa.String(255), nullable=True)
    op.add_column("users", sa.Column("display_name", sa.String(255), nullable=True))
    op.add_column("users", sa.Column("google_sub", sa.String(255), nullable=True))
    op.add_column("users", sa.Column("github_id", sa.String(64), nullable=True))
    op.create_index("ix_users_google_sub", "users", ["google_sub"], unique=True)
    op.create_index("ix_users_github_id", "users", ["github_id"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_users_github_id", table_name="users")
    op.drop_index("ix_users_google_sub", table_name="users")
    op.drop_column("users", "github_id")
    op.drop_column("users", "google_sub")
    op.drop_column("users", "display_name")
    op.alter_column("users", "hashed_password", existing_type=sa.String(255), nullable=False)
