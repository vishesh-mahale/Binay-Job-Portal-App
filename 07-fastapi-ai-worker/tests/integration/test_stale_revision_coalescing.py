"""Integration tests for Stale Revision Guard and Concurrency Coalescing."""

from datetime import datetime, timezone
import pytest
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient

from app.schemas.candidate_search import CandidateCanonicalAggregate
from app.schemas.job_enrichment import JobCanonicalAggregate


@pytest.mark.asyncio
async def test_candidate_projection_stale_revision_coalesce(test_app):
    """Candidate projection task detects newer source revision and returns coalesced=True."""
    client = TestClient(test_app)

    candidate_id = "c7777777-7777-7777-7777-777777777777"
    payload = {
        "schema_version": 1,
        "event_id": "e7777777-7777-7777-7777-777777777777",
        "aggregate_id": candidate_id,
        "trace_id": "t7777777-7777-7777-7777-777777777777",
    }

    mock_aggregate = CandidateCanonicalAggregate(
        candidate_id=candidate_id,
        profile_revision=2,
        professional_title="Software Engineer",
        skills=[{"name": "Python", "is_primary": True}],
        active_resume_parsed_data={"skills": ["FastAPI", "PostgreSQL"]},
    )

    with (
        patch("app.core.database.DatabaseManager.initialize", new_callable=AsyncMock),
        patch("app.repositories.processed_events_repo.ProcessedEventsRepository.is_processed", new_callable=AsyncMock) as mock_is_processed,
        patch("app.core.database.DatabaseManager.acquire_processing_lease", new_callable=AsyncMock) as mock_acquire_lease,
        patch("app.core.database.DatabaseManager.release_processing_lease", new_callable=AsyncMock) as mock_release_lease,
        patch("app.repositories.projection_repo.CandidateProjectionRepository.load_candidate_aggregate", new_callable=AsyncMock) as mock_load,
        patch("app.repositories.projection_repo.CandidateProjectionRepository.check_stale_source_state", new_callable=AsyncMock) as mock_check_stale,
        patch("app.repositories.projection_repo.CandidateProjectionRepository.upsert_search_profile", new_callable=AsyncMock) as mock_upsert,
    ):
        mock_is_processed.return_value = False
        mock_acquire_lease.return_value = True
        mock_load.return_value = mock_aggregate
        mock_check_stale.return_value = True  # Newer revision (e.g. revision 3) exists in DB

        response = client.post("/internal/tasks/candidate/projection", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert data["coalesced"] is True

        mock_upsert.assert_not_called()
        mock_release_lease.assert_awaited_once()


@pytest.mark.asyncio
async def test_job_enrichment_stale_updated_at_coalesce(test_app):
    """Job enrichment task detects modified updated_at and returns coalesced=True."""
    client = TestClient(test_app)

    job_id = "j6666666-6666-6666-6666-666666666666"
    payload = {
        "schema_version": 1,
        "event_id": "e6666666-6666-6666-6666-666666666666",
        "aggregate_id": job_id,
        "trace_id": "t6666666-6666-6666-6666-666666666666",
    }

    mock_job = JobCanonicalAggregate(
        job_id=job_id,
        title="DevOps Engineer",
        description="Kubernetes & Terraform",
        updated_at=datetime.now(timezone.utc),
    )

    with (
        patch("app.core.database.DatabaseManager.initialize", new_callable=AsyncMock),
        patch("app.repositories.processed_events_repo.ProcessedEventsRepository.is_processed", new_callable=AsyncMock) as mock_is_processed,
        patch("app.core.database.DatabaseManager.acquire_processing_lease", new_callable=AsyncMock) as mock_acquire_lease,
        patch("app.core.database.DatabaseManager.release_processing_lease", new_callable=AsyncMock) as mock_release_lease,
        patch("app.repositories.job_repo.JobRepository.load_job_aggregate", new_callable=AsyncMock) as mock_load,
        patch("app.repositories.job_repo.JobRepository.check_stale_job", new_callable=AsyncMock) as mock_stale,
        patch("app.repositories.job_repo.JobRepository.update_job_ai_enrichment", new_callable=AsyncMock) as mock_update,
    ):
        mock_is_processed.return_value = False
        mock_acquire_lease.return_value = True
        mock_load.return_value = mock_job
        mock_stale.return_value = True

        response = client.post("/internal/tasks/job/enrich", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert data["coalesced"] is True

        mock_update.assert_not_called()
        mock_release_lease.assert_awaited_once()
