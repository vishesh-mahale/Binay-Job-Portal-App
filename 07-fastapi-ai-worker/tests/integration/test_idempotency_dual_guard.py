"""Integration tests for Dual Idempotency & Lease Guard across pipelines (processed_events + event_processing_leases)."""

from datetime import datetime, timezone
import pytest
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient


@pytest.mark.asyncio
async def test_dual_guard_processed_events_skip(test_app):
    """Guard 1: If event is already in processed_events, immediately return HTTP 200 skipped=True."""
    client = TestClient(test_app)

    payload = {
        "schema_version": 1,
        "event_id": "e9999999-9999-9999-9999-999999999999",
        "aggregate_id": "c9999999-9999-9999-9999-999999999999",
        "trace_id": "t9999999-9999-9999-9999-999999999999",
    }

    with (
        patch("app.core.database.DatabaseManager.initialize", new_callable=AsyncMock),
        patch("app.repositories.processed_events_repo.ProcessedEventsRepository.is_processed", new_callable=AsyncMock) as mock_is_processed,
    ):
        mock_is_processed.return_value = True

        response = client.post("/internal/tasks/candidate/projection", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert data["skipped"] is True


@pytest.mark.asyncio
async def test_dual_guard_lease_collision_skip(test_app):
    """Guard 2: If event is new but lease is already acquired by another worker, skip with lease_held."""
    client = TestClient(test_app)

    payload = {
        "schema_version": 1,
        "event_id": "e8888888-8888-8888-8888-888888888888",
        "aggregate_id": "j8888888-8888-8888-8888-888888888888",
        "trace_id": "t8888888-8888-8888-8888-888888888888",
    }

    with (
        patch("app.core.database.DatabaseManager.initialize", new_callable=AsyncMock),
        patch("app.repositories.processed_events_repo.ProcessedEventsRepository.is_processed", new_callable=AsyncMock) as mock_is_processed,
        patch("app.core.database.DatabaseManager.acquire_processing_lease", new_callable=AsyncMock) as mock_acquire_lease,
    ):
        mock_is_processed.return_value = False
        mock_acquire_lease.return_value = False  # Another worker holds lease

        response = client.post("/internal/tasks/job/enrich", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert data["skipped"] is True
        assert data["reason"] == "lease_held"
