"""Unit tests for job enrich task handler success path."""

from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.schemas.tasks import JobEnrichTaskPayload
from app.schemas.job_enrichment import (
    JobCanonicalAggregate,
    JobEnrichmentResult,
    JobAIProfileV1,
    JobExtractedProfile,
    JobInferredProfile,
    JobProfileMetadata,
)
from app.core.exceptions import AIProviderError


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


def test_job_enrich_success_returns_200(test_app):
    client = TestClient(test_app)
    job_id = "j4444444-4444-4444-4444-444444444444"
    payload = JobEnrichTaskPayload(
        schema_version=1,
        event_id="e5555555-5555-5555-5555-555555555555",
        aggregate_id=job_id,
        trace_id="t5555555-5555-5555-5555-555555555555",
    ).model_dump()

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
        description="Lead backend architecture and high-throughput microservices.",
        responsibilities="Design scalable systems and mentor engineers.",
        requirements="Python, FastAPI, PostgreSQL, Redis, Kubernetes.",
        skills=["Python", "FastAPI", "PostgreSQL", "Redis", "Kubernetes"],
        locations=["Bengaluru, Karnataka, India"],
        updated_at=datetime.now(timezone.utc),
    )

    profile = JobAIProfileV1(
        schema_version=1,
        extracted=JobExtractedProfile(must_have_skills=["Python", "FastAPI"]),
        inferred=JobInferredProfile(role_family="Backend"),
        metadata=JobProfileMetadata(
            model="gemini-2.0-flash",
            model_version="v1",
            prompt_version="v1",
            generated_at=datetime.now(timezone.utc).isoformat(),
            processing_time_ms=120,
        ),
    )
    enrichment_result = JobEnrichmentResult(
        job_id=job_id,
        ai_profile=profile,
        embedding=[0.1] * 768,
        embedding_model="text-embedding-004",
        embedding_version=1,
        stored_updated_at=datetime.now(timezone.utc),
    )

    mock_session = AsyncMock()
    mock_tx = MagicMock(return_value=_AsyncContextManager(mock_session))

    with (
        patch("app.core.database.DatabaseManager.initialize", new_callable=AsyncMock),
        patch("app.repositories.processed_events_repo.ProcessedEventsRepository.is_processed", new_callable=AsyncMock) as mock_is_processed,
        patch("app.core.database.DatabaseManager.acquire_processing_lease", new_callable=AsyncMock) as mock_acquire_lease,
        patch("app.core.database.DatabaseManager.release_processing_lease", new_callable=AsyncMock) as mock_release_lease,
        patch("app.repositories.job_repo.JobRepository.load_job_aggregate", new_callable=AsyncMock) as mock_load,
        patch("app.repositories.job_repo.JobRepository.check_stale_job", new_callable=AsyncMock) as mock_stale,
        patch("app.repositories.job_repo.JobRepository.update_job_ai_enrichment", new_callable=AsyncMock) as mock_update,
        patch("app.repositories.processed_events_repo.ProcessedEventsRepository.record_processed", new_callable=AsyncMock) as mock_record,
        patch("app.repositories.outbox_repo.OutboxRepository.emit_event", new_callable=AsyncMock) as mock_emit,
        patch("app.repositories.analytics_repo.AnalyticsRepository.emit", new_callable=AsyncMock) as mock_analytics,
        patch("app.services.job_ai_service.JobAIService.enrich_job", new_callable=AsyncMock) as mock_enrich,
        patch("app.core.database.DatabaseManager.transaction", side_effect=mock_tx),
    ):
        mock_is_processed.return_value = False
        mock_acquire_lease.return_value = True
        mock_load.return_value = mock_job
        mock_stale.return_value = False
        mock_update.return_value = True
        mock_record.return_value = True
        mock_emit.return_value = "outbox-job-enriched-123"
        mock_analytics.return_value = True
        mock_enrich.return_value = enrichment_result

        response = client.post("/internal/tasks/job/enrich", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert data["job_id"] == job_id

        mock_update.assert_awaited_once()
        mock_record.assert_awaited_once()
        mock_emit.assert_awaited_once()
        mock_analytics.assert_awaited_once()


def test_job_enrich_stale_concurrency_returns_200(test_app):
    client = TestClient(test_app)
    job_id = "j4444444-4444-4444-4444-444444444444"
    payload = JobEnrichTaskPayload(
        schema_version=1,
        event_id="e6666666-6666-6666-6666-666666666666",
        aggregate_id=job_id,
        trace_id="t6666666-6666-6666-6666-666666666666",
    ).model_dump()

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
        updated_at=datetime.now(timezone.utc),
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
