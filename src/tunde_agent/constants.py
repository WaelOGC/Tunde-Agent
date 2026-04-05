"""Shared constants (non-secret)."""

import uuid

# Seeded by Alembic migration for RLS / DB smoke checks (see alembic/versions).
SMOKE_TEST_USER_ID = uuid.UUID("11111111-1111-1111-1111-111111111111")
