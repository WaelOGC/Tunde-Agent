"""Pytest hooks and default environment for imports."""

import os

# App must use ``tunde_app`` so RLS is enforced; migrations use superuser URL separately.
os.environ.setdefault(
    "DATABASE_URL",
    "postgresql://tunde_app:tunde_app_dev@localhost:5433/tunde",
)
os.environ.setdefault(
    "ALEMBIC_DATABASE_URL",
    "postgresql://tunde:tunde@localhost:5433/tunde",
)
