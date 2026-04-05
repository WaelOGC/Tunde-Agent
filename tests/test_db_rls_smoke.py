"""Integration check for DB + RLS (skip if Postgres not migrated)."""

import pytest
from fastapi.testclient import TestClient

from tunde_agent.main import app

client = TestClient(app)


@pytest.mark.integration
def test_db_rls_smoke_endpoint() -> None:
    response = client.get("/health/db-rls-smoke")
    if response.status_code == 503:
        pytest.skip(f"Database not ready or migrations missing: {response.json()}")
    assert response.status_code == 200
    body = response.json()
    assert body.get("ok") is True
    assert "audit_log_id" in body
