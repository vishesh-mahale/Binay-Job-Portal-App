"""Unit tests for Cloud Run Healthcheck probes (/health/liveness & /health/readiness)."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi.testclient import TestClient


def test_liveness_probe(test_app):
    """Liveness probe returns HTTP 200 OK with status='alive'."""
    client = TestClient(test_app)
    response = client.get("/health/liveness")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "alive"
    assert data["service"] == "fastapi-ai-worker"


def test_readiness_probe_database_uninitialized(test_app):
    """Readiness probe returns status='not_ready' when DB engine is not initialized."""
    client = TestClient(test_app)
    mock_db = MagicMock()
    mock_db.engine = None

    with patch("app.api.health.get_db_manager", return_value=mock_db):
        response = client.get("/health/readiness")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "not_ready"
        assert data["details"]["database"] == "not_initialized"


def test_readiness_probe_database_connected(test_app):
    """Readiness probe returns status='ready' when DB query succeeds."""
    client = TestClient(test_app)
    mock_db = MagicMock()
    mock_engine = MagicMock()

    class _MockBegin:
        async def __aenter__(self):
            mock_conn = AsyncMock()
            mock_conn.execute.return_value = None
            return mock_conn

        async def __aexit__(self, exc_type, exc_val, exc_tb):
            pass

    mock_engine.begin.return_value = _MockBegin()
    mock_db.engine = mock_engine

    with patch("app.api.health.get_db_manager", return_value=mock_db):
        response = client.get("/health/readiness")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ready"
        assert data["details"]["database"] == "connected"
