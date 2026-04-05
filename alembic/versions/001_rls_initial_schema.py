"""Initial tables, tunde_app role, RLS policies (FORCE), grants.

Revision ID: 001_rls
Revises:
Create Date: 2026-04-04

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "001_rls"
down_revision = None
branch_labels = None
depends_on = None

# Dev-only password for ``tunde_app`` (non-superuser, RLS enforced). Override in production via role + secrets.
_APP_ROLE = "tunde_app"
_APP_PASSWORD = "tunde_app_dev"


def upgrade() -> None:
    # Identifier and password are fixed literals (dev only). Escape password for SQL if extended later.
    _pwd_escaped = _APP_PASSWORD.replace("'", "''")
    op.execute(
        sa.text(
            f"""
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '{_APP_ROLE}') THEN
        CREATE ROLE {_APP_ROLE} LOGIN PASSWORD '{_pwd_escaped}'
          NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;
      END IF;
    END
    $$;
    """
        )
    )

    op.execute(
        sa.text(
            f"""
    DO $$
    DECLARE db text := current_database();
    BEGIN
      EXECUTE format('GRANT CONNECT ON DATABASE %I TO {_APP_ROLE}', db);
    END
    $$;
    """
        )
    )
    op.execute(sa.text(f"GRANT USAGE ON SCHEMA public TO {_APP_ROLE}"))

    op.create_table(
        "users",
        sa.Column("id", UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email", name="uq_users_email"),
    )

    op.create_table(
        "sessions",
        sa.Column("id", UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), nullable=False),
        sa.Column("session_token", sa.String(512), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_sessions_user_id", "sessions", ["user_id"])
    op.create_index("ix_sessions_session_token", "sessions", ["session_token"], unique=True)

    op.create_table(
        "audit_logs",
        sa.Column("id", UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), nullable=False),
        sa.Column("action_type", sa.String(128), nullable=False),
        sa.Column("details", sa.Text(), nullable=True),
        sa.Column("timestamp", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_audit_logs_user_id", "audit_logs", ["user_id"])
    op.create_index("ix_audit_logs_action_type", "audit_logs", ["action_type"])
    op.create_index("ix_audit_logs_timestamp", "audit_logs", ["timestamp"])

    op.create_table(
        "encrypted_data",
        sa.Column("id", UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), nullable=False),
        sa.Column("key_name", sa.String(128), nullable=False),
        sa.Column("encrypted_value", sa.LargeBinary(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "key_name", name="uq_encrypted_data_user_key"),
    )
    op.create_index("ix_encrypted_data_user_id", "encrypted_data", ["user_id"])
    op.create_index("ix_encrypted_data_key_name", "encrypted_data", ["key_name"])

    op.execute(
        sa.text(
            """
        INSERT INTO users (id, email, hashed_password)
        VALUES ('11111111-1111-1111-1111-111111111111', 'smoke@test.local', '!not-a-real-hash')
        ON CONFLICT (email) DO NOTHING
    """
        )
    )

    op.execute(sa.text(f"GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO {_APP_ROLE}"))
    op.execute(
        sa.text(
            f"""
    DO $$
    DECLARE r name := session_user;
    BEGIN
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO {_APP_ROLE}',
        r
      );
    END
    $$;
    """
        )
    )

    _rls_tables_user_pk = "users"
    _rls_tables_user_fk = ("sessions", "audit_logs", "encrypted_data")

    op.execute(sa.text(f"ALTER TABLE {_rls_tables_user_pk} ENABLE ROW LEVEL SECURITY"))
    op.execute(sa.text(f"ALTER TABLE {_rls_tables_user_pk} FORCE ROW LEVEL SECURITY"))
    for t in _rls_tables_user_fk:
        op.execute(sa.text(f"ALTER TABLE {t} ENABLE ROW LEVEL SECURITY"))
        op.execute(sa.text(f"ALTER TABLE {t} FORCE ROW LEVEL SECURITY"))

    expr_pk = "(id = (current_setting('app.current_user_id', true))::uuid)"
    expr_fk = "(user_id = (current_setting('app.current_user_id', true))::uuid)"

    op.execute(
        sa.text(
            f"""
        CREATE POLICY p_isolation_users ON users
          FOR ALL
          TO {_APP_ROLE}
          USING {expr_pk}
          WITH CHECK {expr_pk}
    """
        )
    )
    for t in _rls_tables_user_fk:
        op.execute(
            sa.text(
                f"""
            CREATE POLICY p_isolation_{t} ON {t}
              FOR ALL
              TO {_APP_ROLE}
              USING {expr_fk}
              WITH CHECK {expr_fk}
        """
            )
        )


def downgrade() -> None:
    policies = [
        ("p_isolation_users", "users"),
        ("p_isolation_sessions", "sessions"),
        ("p_isolation_audit_logs", "audit_logs"),
        ("p_isolation_encrypted_data", "encrypted_data"),
    ]
    for policy, table in policies:
        op.execute(sa.text(f'DROP POLICY IF EXISTS "{policy}" ON {table}'))

    op.execute(sa.text(f"REVOKE ALL ON ALL TABLES IN SCHEMA public FROM {_APP_ROLE}"))
    op.drop_table("encrypted_data")
    op.drop_table("audit_logs")
    op.drop_table("sessions")
    op.drop_table("users")
    op.execute(sa.text(f"REVOKE USAGE ON SCHEMA public FROM {_APP_ROLE}"))
