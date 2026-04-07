"""approval_requests table, RLS, webhook resolution function (SECURITY DEFINER).

Revision ID: 002_approval
Revises: 001_rls
Create Date: 2026-04-04

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "002_approval"
down_revision = "001_rls"
branch_labels = None
depends_on = None

_APP_ROLE = "tunde_app"


def upgrade() -> None:
    op.create_table(
        "approval_requests",
        sa.Column("id", UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), nullable=False),
        sa.Column("action_type", sa.String(128), nullable=False),
        sa.Column("payload", JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column("status", sa.String(32), server_default=sa.text("'pending'"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("responded_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "status IN ('pending', 'approved', 'denied')",
            name="ck_approval_requests_status",
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_approval_requests_user_id", "approval_requests", ["user_id"])
    op.create_index("ix_approval_requests_status", "approval_requests", ["status"])
    op.create_index("ix_approval_requests_created_at", "approval_requests", ["created_at"])

    op.execute(sa.text(f"GRANT SELECT, INSERT, UPDATE, DELETE ON approval_requests TO {_APP_ROLE}"))

    op.execute(sa.text("ALTER TABLE approval_requests ENABLE ROW LEVEL SECURITY"))
    op.execute(sa.text("ALTER TABLE approval_requests FORCE ROW LEVEL SECURITY"))

    expr_fk = "(user_id = (current_setting('app.current_user_id', true))::uuid)"
    op.execute(
        sa.text(
            f"""
        CREATE POLICY p_isolation_approval_requests ON approval_requests
          FOR ALL
          TO {_APP_ROLE}
          USING {expr_fk}
          WITH CHECK {expr_fk}
    """
        )
    )

    op.execute(
        sa.text(
            """
        CREATE OR REPLACE FUNCTION resolve_approval_from_telegram(p_request_id uuid, p_approve boolean)
        RETURNS boolean
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = public
        AS $fn$
        DECLARE
          updated int;
        BEGIN
          UPDATE approval_requests
          SET
            status = CASE WHEN p_approve THEN 'approved' ELSE 'denied' END,
            responded_at = now()
          WHERE id = p_request_id AND status = 'pending';
          GET DIAGNOSTICS updated = ROW_COUNT;
          RETURN updated = 1;
        END;
        $fn$;
    """
        )
    )
    op.execute(
        sa.text(
            "REVOKE ALL ON FUNCTION resolve_approval_from_telegram(uuid, boolean) FROM PUBLIC"
        )
    )
    op.execute(
        sa.text(
            f"GRANT EXECUTE ON FUNCTION resolve_approval_from_telegram(uuid, boolean) TO {_APP_ROLE}"
        )
    )


def downgrade() -> None:
    op.execute(
        sa.text("DROP FUNCTION IF EXISTS resolve_approval_from_telegram(uuid, boolean)")
    )
    op.execute(sa.text('DROP POLICY IF EXISTS "p_isolation_approval_requests" ON approval_requests'))
    op.drop_table("approval_requests")
