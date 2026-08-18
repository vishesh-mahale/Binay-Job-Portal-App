"""Unit tests for health and readiness probe branches."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi.testclient import TestClient

from app.api.health import readiness_probe, HealthStatus
from app.core.database import DatabaseManager


@pytest.mark.asyncio
async def test_readiness_probe_database_not_initialized():
    """Readiness probe returns not_ready when db engine is None."""
    mock_db = MagicMock(spec=DatabaseManager)
    mock_db.engine = None

    status = await readiness_probe(db_manager=mock_db)
    assert isinstance(status, HealthStatus)
    assert status.status == "not_ready"
    assert status.details.get("database") == "not_initialized"


@pytest.mark.asyncio
async def test_readiness_probe_database_connected():
    """Readiness probe returns ready when SELECT 1 succeeds."""
    mock_db = MagicMock(spec=DatabaseManager)
    mock_conn = AsyncMock()
    mock_conn.execute = AsyncMock()

    class _MockEngineBegin:
        async def __aenter__(self):
            return mock_conn
        async def __aexit__(self, *args):
            return False

    mock_db.engine = MagicMock()
    mock_db.engine.begin = MagicMock(return_value=_MockEngineBegin())

    status = await readiness_probe(db_manager=mock_db)
    assert status.status == "ready"
    assert status.details.get("database") == "connected"


@pytest.mark.asyncio
async def test_readiness_probe_database_degraded():
    """Readiness probe returns degraded when query fails."""
    mock_db = MagicMock(spec=DatabaseManager)

    class _MockEngineBeginFail:
        async def __aenter__(self):
            raise RuntimeError("Connection timed out")
        async def __aexit__(self, *args):
            return False

    mock_db.engine = MagicMock()
    mock_db.engine.begin = MagicMock(return_value=_MockEngineBeginFail())

    status = await readiness_probe(db_manager=mock_db)
    assert status.status == "degraded"
    assert "error" in status.details.get("database", "")
