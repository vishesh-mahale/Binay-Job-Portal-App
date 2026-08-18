"""Unit tests for task handler idempotency and lease branches."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.schemas.tasks import CandidateProjectionTaskPayload, JobEnrichTaskPayload


class _AsyncContextManager:
    def __init__(self, session):
        self._session = session

    async def __aenter__(self):
        return self._session

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        return False


@pytest.fixture
def test_app():
    from app.main import create_app
    app = create_app()
    return app


def test_candidate_projection_duplicate_event_skips(test_app):
    client = TestClient(test_app)
    candidate_id = "c1111111-1111-1111-1111-111111111111"
    payload = CandidateProjectionTaskPayload(
        schema_version=1,
        event_id="e2222222-2222-2222-2222-222222222222",
        aggregate_id=candidate_id,
        trace_id="t2222222-2222-2222-2222-222222222222",
    ).model_dump()

    with (
        patch("app.core.database.DatabaseManager.initialize", new_callable=AsyncMock),
        patch("app.repositories.processed_events_repo.ProcessedEventsRepository.is_processed", new_callable=AsyncMock) as mock_is_processed,
        patch("app.core.database.DatabaseManager.acquire_processing_lease", new_callable=AsyncMock) as mock_acquire_lease,
        patch("app.core.database.DatabaseManager.release_processing_lease", new_callable=AsyncMock) as mock_release_lease,
    ):
        mock_is_processed.return_value = True
        mock_acquire_lease.return_value = True

        response = client.post("/internal/tasks/candidate/projection", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert data["skipped"] is True

        mock_acquire_lease.assert_not_awaited()
        mock_release_lease.assert_not_awaited()


def test_candidate_projection_lease_held_skips(test_app):
    client = TestClient(test_app)
    candidate_id = "c1111111-1111-1111-1111-111111111111"
    payload = CandidateProjectionTaskPayload(
        schema_version=1,
        event_id="e3333333-3333-3333-3333-333333333333",
        aggregate_id=candidate_id,
        trace_id="t3333333-3333-3333-3333-333333333333",
    ).model_dump()

    with (
        patch("app.core.database.DatabaseManager.initialize", new_callable=AsyncMock),
        patch("app.repositories.processed_events_repo.ProcessedEventsRepository.is_processed", new_callable=AsyncMock) as mock_is_processed,
        patch("app.core.database.DatabaseManager.acquire_processing_lease", new_callable=AsyncMock) as mock_acquire_lease,
        patch("app.core.database.DatabaseManager.release_processing_lease", new_callable=AsyncMock) as mock_release_lease,
    ):
        mock_is_processed.return_value = False
        mock_acquire_lease.return_value = False

        response = client.post("/internal/tasks/candidate/projection", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert data["skipped"] is True
        assert data["reason"] == "lease_held"

        mock_release_lease.assert_not_awaited()


def test_job_enrich_duplicate_event_skips(test_app):
    client = TestClient(test_app)
    job_id = "j4444444-4444-4444-4444-444444444444"
    payload = JobEnrichTaskPayload(
        schema_version=1,
        event_id="e5555555-5555-5555-5555-555555555555",
        aggregate_id=job_id,
        trace_id="t5555555-5555-5555-5555-555555555555",
    ).model_dump()

    with (
        patch("app.core.database.DatabaseManager.initialize", new_callable=AsyncMock),
        patch("app.repositories.processed_events_repo.ProcessedEventsRepository.is_processed", new_callable=AsyncMock) as mock_is_processed,
        patch("app.core.database.DatabaseManager.acquire_processing_lease", new_callable=AsyncMock) as mock_acquire_lease,
        patch("app.core.database.DatabaseManager.release_processing_lease", new_callable=AsyncMock) as mock_release_lease,
    ):
        mock_is_processed.return_value = True
        mock_acquire_lease.return_value = True

        response = client.post("/internal/tasks/job/enrich", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert data["skipped"] is True

        mock_acquire_lease.assert_not_awaited()
        mock_release_lease.assert_not_awaited()
