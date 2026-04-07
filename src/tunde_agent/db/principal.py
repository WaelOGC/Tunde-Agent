"""
Ensure an RLS principal row exists in ``users`` (FK targets: ``audit_logs``, ``approval_requests``, etc.).

Swagger / API clients often send arbitrary UUIDs; we bootstrap a minimal account under the same
``tunde_app`` RLS rules used elsewhere (``app.current_user_id`` = that id).
"""

from __future__ import annotations

import uuid

from sqlalchemy import text

from tunde_agent.db.session import get_engine


def ensure_principal_user(user_id: uuid.UUID) -> None:
    """
    Insert ``users`` row for ``user_id`` if missing (idempotent, race-safe via ``ON CONFLICT``).

    Email is deterministic and unique per id; password is a non-login placeholder.
    """
    email = f"p-{user_id.hex}@bootstrap.tunde.local"
    uid = str(user_id)
    with get_engine().begin() as conn:
        conn.execute(
            text("SELECT set_config('app.current_user_id', CAST(:uid AS text), true)"),
            {"uid": uid},
        )
        conn.execute(
            text(
                """
                INSERT INTO users (id, email, hashed_password)
                VALUES (CAST(:id AS uuid), :email, :hp)
                ON CONFLICT (id) DO NOTHING
                """
            ),
            {"id": uid, "email": email, "hp": "!bootstrap-no-login"},
        )
