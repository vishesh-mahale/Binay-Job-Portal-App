"""Integration test for candidate projection rebuild endpoint (PD-002)."""

from contextlib import asynccontextmanager
import pytest
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient

from app.schemas.candidate_search import CandidateCanonicalAggregate


@pytest.mark.asyncio
async def test_candidate_projection_task_idempotency_skip(test_app):
    """If event was already processed, task returns 200 OK with skipped=True."""
    client = TestClient(test_app)

    payload = {
        "schema_version": 1,
        "event_id": "e1111111-1111-1111-1111-111111111111",
        "aggregate_id": "c1111111-1111-1111-1111-111111111111",
        "trace_id": "t1111111-1111-1111-1111-111111111111",
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
async def test_candidate_projection_task_end_to_end(test_app):
    """End-to-end simulation of candidate projection rebuild task."""
    client = TestClient(test_app)

    candidate_id = "c1111111-1111-1111-1111-111111111111"
    event_id = "e2222222-2222-2222-2222-222222222222"

    payload = {
        "schema_version": 1,
        "event_id": event_id,
        "aggregate_id": candidate_id,
        "trace_id": "t2222222-2222-2222-2222-222222222222",
    }

    mock_aggregate = CandidateCanonicalAggregate(
        candidate_id=candidate_id,
        profile_revision=2,
        professional_title="Lead Backend Engineer",
        city="Bengaluru",
        state="Karnataka",
        country="India",
        skills=[
            {
                "skill_id": "s1111111-1111-1111-1111-111111111111",
                "master_skill_name": "Python",
                "primary_source_type": "confirmed_profile",
            }
        ],
        experiences=[
            {
                "job_title": "Backend Engineer",
                "company_name": "Tech Corp",
                "start_date": "2021-01-01",
                "end_date": "2024-01-01",
                "description": "FastAPI systems",
            }
        ],
        active_resume_document_id="d1111111-1111-1111-1111-111111111111",
        active_resume_parsing_result_id="p1111111-1111-1111-1111-111111111111",
        active_resume_parsed_data={
            "normalized_output": {
                "ai": {
                    "skills": ["Python", "PostgreSQL", "Redis"],
                    "experience_years": 3.0,
                }
            }
        },
    )

    @asynccontextmanager
    async def _mock_tx():
        yield AsyncMock()

    with (
        patch("app.core.database.DatabaseManager.initialize", new_callable=AsyncMock),
        patch("app.repositories.processed_events_repo.ProcessedEventsRepository.is_processed", new_callable=AsyncMock) as mock_is_processed,
        patch("app.core.database.DatabaseManager.acquire_processing_lease", new_callable=AsyncMock) as mock_acquire_lease,
        patch("app.core.database.DatabaseManager.release_processing_lease", new_callable=AsyncMock) as mock_release_lease,
        patch("app.repositories.projection_repo.CandidateProjectionRepository.load_candidate_aggregate", new_callable=AsyncMock) as mock_load,
        patch("app.repositories.projection_repo.CandidateProjectionRepository.check_stale_source_state", new_callable=AsyncMock) as mock_stale,
        patch("app.repositories.projection_repo.CandidateProjectionRepository.upsert_search_profile", new_callable=AsyncMock) as mock_upsert,
        patch("app.repositories.processed_events_repo.ProcessedEventsRepository.record_processed", new_callable=AsyncMock) as mock_record,
        patch("app.repositories.outbox_repo.OutboxRepository.emit_event", new_callable=AsyncMock) as mock_emit,
        patch("app.repositories.analytics_repo.AnalyticsRepository.emit", new_callable=AsyncMock) as mock_analytics,
        patch("app.core.database.DatabaseManager.transaction", side_effect=_mock_tx),
    ):
        mock_is_processed.return_value = False
        mock_acquire_lease.return_value = True
        mock_load.return_value = mock_aggregate
        mock_stale.return_value = False
        mock_upsert.return_value = True
        mock_record.return_value = True
        mock_emit.return_value = "outbox-event-id-123"
        mock_analytics.return_value = True

        response = client.post("/internal/tasks/candidate/projection", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert data["candidate_id"] == candidate_id
        assert data["projection_revision"] == 2

        # Verify lease lifecycle
        mock_acquire_lease.assert_awaited_once()
        mock_release_lease.assert_awaited_once()

        # Verify repository actions
        mock_upsert.assert_awaited_once()
        mock_record.assert_awaited_once()
        mock_emit.assert_awaited_once()
        mock_analytics.assert_awaited_once()
