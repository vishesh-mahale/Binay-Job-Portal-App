"""Unit tests for task handler stale/concurrency/duplicate paths."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.schemas.tasks import CandidateProjectionTaskPayload, JobEnrichTaskPayload
from app.core.exceptions import StaleDataError
from app.core.database import DatabaseManager


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


def test_candidate_projection_stale_data_returns_200(test_app):
    client = TestClient(test_app)
    candidate_id = "c1111111-1111-1111-1111-111111111111"
    payload = CandidateProjectionTaskPayload(
        schema_version=1,
        event_id="e4444444-4444-4444-4444-444444444444",
        aggregate_id=candidate_id,
        trace_id="t4444444-4444-4444-4444-444444444444",
    ).model_dump()

    from app.schemas.candidate_search import CandidateCanonicalAggregate
    mock_aggregate = CandidateCanonicalAggregate(
        candidate_id=candidate_id,
        profile_revision=2,
        professional_title="Lead Backend Engineer",
        city="Bengaluru",
        state="Karnataka",
        country="India",
        skills=[],
        experiences=[],
        active_resume_document_id="d1",
        active_resume_parsing_result_id="p1",
        active_resume_parsed_data={},
    )

    mock_session = AsyncMock()
    mock_tx = MagicMock(return_value=_AsyncContextManager(mock_session))

    with (
        patch("app.core.database.DatabaseManager.initialize", new_callable=AsyncMock),
        patch("app.repositories.processed_events_repo.ProcessedEventsRepository.is_processed", new_callable=AsyncMock) as mock_is_processed,
        patch("app.core.database.DatabaseManager.acquire_processing_lease", new_callable=AsyncMock) as mock_acquire_lease,
        patch("app.core.database.DatabaseManager.release_processing_lease", new_callable=AsyncMock) as mock_release_lease,
        patch("app.repositories.projection_repo.CandidateProjectionRepository.load_candidate_aggregate", new_callable=AsyncMock) as mock_load,
        patch("app.repositories.projection_repo.CandidateProjectionRepository.check_stale_source_state", new_callable=AsyncMock) as mock_stale,
        patch("app.services.projection_service.CandidateProjectionService.generate_projection", new_callable=AsyncMock) as mock_generate,
        patch("app.core.database.DatabaseManager.transaction", side_effect=mock_tx),
    ):
        mock_is_processed.return_value = False
        mock_acquire_lease.return_value = True
        mock_load.return_value = mock_aggregate
        mock_stale.return_value = True
        mock_generate.return_value = MagicMock()

        response = client.post("/internal/tasks/candidate/projection", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert data["coalesced"] is True


def test_job_enrich_stale_data_returns_200(test_app):
    client = TestClient(test_app)
    job_id = "j4444444-4444-4444-4444-444444444444"
    payload = JobEnrichTaskPayload(
        schema_version=1,
        event_id="e7777777-7777-7777-7777-777777777777",
        aggregate_id=job_id,
        trace_id="t7777777-7777-7777-7777-777777777777",
    ).model_dump()

    from app.schemas.job_enrichment import JobCanonicalAggregate
    mock_job = JobCanonicalAggregate(
        job_id=job_id,
        title="Principal Backend Engineer",
        category="Engineering > Backend",
        employment_type="full_time",
        work_mode="hybrid",
        experience_level="senior",
        experience_min_years=7,
        experience_max_years=10,
        salary_min=4000000.0,
        salary_max=6000000.0,
        salary_currency="INR",
        description="Lead backend architecture.",
        responsibilities="Design scalable systems.",
        requirements="Python, FastAPI.",
        skills=["Python", "FastAPI"],
        locations=["Bengaluru, Karnataka, India"],
        updated_at="2024-01-01T00:00:00Z",
    )

    with (
        patch("app.core.database.DatabaseManager.initialize", new_callable=AsyncMock),
        patch("app.repositories.processed_events_repo.ProcessedEventsRepository.is_processed", new_callable=AsyncMock) as mock_is_processed,
        patch("app.core.database.DatabaseManager.acquire_processing_lease", new_callable=AsyncMock) as mock_acquire_lease,
        patch("app.core.database.DatabaseManager.release_processing_lease", new_callable=AsyncMock) as mock_release_lease,
        patch("app.repositories.job_repo.JobRepository.load_job_aggregate", new_callable=AsyncMock) as mock_load,
        patch("app.repositories.job_repo.JobRepository.check_stale_job", new_callable=AsyncMock) as mock_stale,
        patch("app.services.job_ai_service.JobAIService.enrich_job", new_callable=AsyncMock) as mock_enrich,
    ):
        mock_is_processed.return_value = False
        mock_acquire_lease.return_value = True
        mock_load.return_value = mock_job
        mock_stale.return_value = True

        from app.schemas.job_enrichment import JobAIProfileV1, JobExtractedProfile, JobInferredProfile, JobProfileMetadata, JobEnrichmentResult
        from datetime import datetime, timezone
        profile = JobAIProfileV1(
            schema_version=1,
            extracted=JobExtractedProfile(must_have_skills=["Python"]),
            inferred=JobInferredProfile(role_family="Backend"),
            metadata=JobProfileMetadata(
                model="gemini-2.0-flash",
                model_version="v1",
                prompt_version="v1",
                generated_at=datetime.now(timezone.utc).isoformat(),
                processing_time_ms=120,
            ),
        )
        mock_enrich.return_value = JobEnrichmentResult(
            job_id=job_id,
            ai_profile=profile,
            embedding=[0.1] * 768,
            embedding_model="text-embedding-004",
            embedding_version=1,
            stored_updated_at=datetime.now(timezone.utc),
        )

        response = client.post("/internal/tasks/job/enrich", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert data["coalesced"] is True
