"""Integration tests for Job AI Enrichment and Embedding endpoint (JD-001)."""

from contextlib import asynccontextmanager
from datetime import datetime, timezone
import pytest
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient

from app.core.exceptions import AIProviderError
from app.schemas.job_enrichment import JobCanonicalAggregate


@pytest.mark.asyncio
async def test_job_enrichment_task_idempotency_skip(test_app):
    """If event was already processed, task returns 200 OK with skipped=True."""
    client = TestClient(test_app)

    payload = {
        "schema_version": 1,
        "event_id": "e3333333-3333-3333-3333-333333333333",
        "aggregate_id": "j3333333-3333-3333-3333-333333333333",
        "trace_id": "t3333333-3333-3333-3333-333333333333",
    }

    with (
        patch("app.core.database.DatabaseManager.initialize", new_callable=AsyncMock),
        patch("app.repositories.processed_events_repo.ProcessedEventsRepository.is_processed", new_callable=AsyncMock) as mock_is_processed,
    ):
        mock_is_processed.return_value = True

        response = client.post("/internal/tasks/job/enrich", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert data["skipped"] is True


@pytest.mark.asyncio
async def test_job_enrichment_task_end_to_end(test_app):
    """End-to-end simulation of job enrichment Cloud Task."""
    client = TestClient(test_app)

    job_id = "j4444444-4444-4444-4444-444444444444"
    event_id = "e4444444-4444-4444-4444-444444444444"
    trace_id = "t4444444-4444-4444-4444-444444444444"

    payload = {
        "schema_version": 1,
        "event_id": event_id,
        "aggregate_id": job_id,
        "trace_id": trace_id,
    }

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

    @asynccontextmanager
    async def _mock_tx():
        yield AsyncMock()

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
        patch("app.core.database.DatabaseManager.transaction", side_effect=_mock_tx),
    ):
        mock_is_processed.return_value = False
        mock_acquire_lease.return_value = True
        mock_load.return_value = mock_job
        mock_stale.return_value = False
        mock_update.return_value = True
        mock_record.return_value = True
        mock_emit.return_value = "outbox-job-enriched-123"
        mock_analytics.return_value = True

        response = client.post("/internal/tasks/job/enrich", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert data["job_id"] == job_id
        assert data["embedding_model"] is not None

        # Verify lease lifecycle
        mock_acquire_lease.assert_awaited_once()
        mock_release_lease.assert_awaited_once()

        # Verify repository updates & chained outbox event
        mock_update.assert_awaited_once()
        mock_record.assert_awaited_once()
        mock_emit.assert_awaited_once()


@pytest.mark.asyncio
async def test_job_enrichment_task_stale_concurrency_coalesce(test_app):
    """If job was modified during AI processing, task returns coalesced=True without overwrite."""
    client = TestClient(test_app)

    job_id = "j5555555-5555-5555-5555-555555555555"
    payload = {
        "schema_version": 1,
        "event_id": "e5555555-5555-5555-5555-555555555555",
        "aggregate_id": job_id,
        "trace_id": "t5555555-5555-5555-5555-555555555555",
    }

    mock_job = JobCanonicalAggregate(
        job_id=job_id,
        title="Frontend Architect",
        description="React and Next.js applications.",
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
        mock_stale.return_value = True  # Stale update detected

        response = client.post("/internal/tasks/job/enrich", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert data["coalesced"] is True

        # Ensure update was NOT called
        mock_update.assert_not_called()
        mock_release_lease.assert_awaited_once()


@pytest.mark.asyncio
async def test_job_enrichment_task_failure_persists_embedding_status_failed(test_app):
    """Verify permanent failure marks embedding_status as failed in DB."""
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
        title="DevOps Lead",
        description="Kubernetes and Cloud Infrastructure",
        updated_at=datetime.now(timezone.utc),
    )

    @asynccontextmanager
    async def _mock_tx():
        yield AsyncMock()

    with (
        patch("app.core.database.DatabaseManager.initialize", new_callable=AsyncMock),
        patch("app.repositories.processed_events_repo.ProcessedEventsRepository.is_processed", new_callable=AsyncMock) as mock_is_processed,
        patch("app.core.database.DatabaseManager.acquire_processing_lease", new_callable=AsyncMock) as mock_acquire_lease,
        patch("app.core.database.DatabaseManager.release_processing_lease", new_callable=AsyncMock) as mock_release_lease,
        patch("app.repositories.job_repo.JobRepository.load_job_aggregate", new_callable=AsyncMock) as mock_load,
        patch("app.services.job_ai_service.JobAIService.enrich_job", side_effect=ValueError("Permanent Model Error")),
        patch("app.repositories.job_repo.JobRepository.mark_embedding_failed", new_callable=AsyncMock) as mock_failed,
        patch("app.core.database.DatabaseManager.transaction", side_effect=_mock_tx),
    ):
        mock_is_processed.return_value = False
        mock_acquire_lease.return_value = True
        mock_load.return_value = mock_job
        mock_failed.return_value = True

        response = client.post("/internal/tasks/job/enrich", json=payload)
        assert response.status_code == 500
        mock_failed.assert_awaited_once()
        mock_release_lease.assert_awaited_once()


@pytest.mark.asyncio
async def test_job_enrichment_task_non_retryable_ai_provider_error_persists_failed(test_app):
    """Verify non-retryable AIProviderError marks embedding_status as failed in DB and returns 500."""
    client = TestClient(test_app)

    job_id = "j7777777-7777-7777-7777-777777777777"
    payload = {
        "schema_version": 1,
        "event_id": "e7777777-7777-7777-7777-777777777777",
        "aggregate_id": job_id,
        "trace_id": "t7777777-7777-7777-7777-777777777777",
    }

    mock_job = JobCanonicalAggregate(
        job_id=job_id,
        title="ML Engineer",
        description="PyTorch and Model Deployment",
        updated_at=datetime.now(timezone.utc),
    )

    @asynccontextmanager
    async def _mock_tx():
        yield AsyncMock()

    with (
        patch("app.core.database.DatabaseManager.initialize", new_callable=AsyncMock),
        patch("app.repositories.processed_events_repo.ProcessedEventsRepository.is_processed", new_callable=AsyncMock) as mock_is_processed,
        patch("app.core.database.DatabaseManager.acquire_processing_lease", new_callable=AsyncMock) as mock_acquire_lease,
        patch("app.core.database.DatabaseManager.release_processing_lease", new_callable=AsyncMock) as mock_release_lease,
        patch("app.repositories.job_repo.JobRepository.load_job_aggregate", new_callable=AsyncMock) as mock_load,
        patch("app.services.job_ai_service.JobAIService.enrich_job", side_effect=AIProviderError(provider="gemini", reason="Invalid API Key", retryable=False)),
        patch("app.repositories.job_repo.JobRepository.mark_embedding_failed", new_callable=AsyncMock) as mock_failed,
        patch("app.core.database.DatabaseManager.transaction", side_effect=_mock_tx),
    ):
        mock_is_processed.return_value = False
        mock_acquire_lease.return_value = True
        mock_load.return_value = mock_job
        mock_failed.return_value = True

        response = client.post("/internal/tasks/job/enrich", json=payload)
        assert response.status_code == 500
        mock_failed.assert_awaited_once()
        mock_release_lease.assert_awaited_once()


@pytest.mark.asyncio
async def test_job_enrichment_task_retryable_ai_provider_error_does_not_persist_failed(test_app):
    """Verify retryable AIProviderError returns 503 and does NOT mark embedding_status as failed in DB."""
    client = TestClient(test_app)

    job_id = "j8888888-8888-8888-8888-888888888888"
    payload = {
        "schema_version": 1,
        "event_id": "e8888888-8888-8888-8888-888888888888",
        "aggregate_id": job_id,
        "trace_id": "t8888888-8888-8888-8888-888888888888",
    }

    mock_job = JobCanonicalAggregate(
        job_id=job_id,
        title="Backend Engineer",
        description="Go and PostgreSQL",
        updated_at=datetime.now(timezone.utc),
    )

    with (
        patch("app.core.database.DatabaseManager.initialize", new_callable=AsyncMock),
        patch("app.repositories.processed_events_repo.ProcessedEventsRepository.is_processed", new_callable=AsyncMock) as mock_is_processed,
        patch("app.core.database.DatabaseManager.acquire_processing_lease", new_callable=AsyncMock) as mock_acquire_lease,
        patch("app.core.database.DatabaseManager.release_processing_lease", new_callable=AsyncMock) as mock_release_lease,
        patch("app.repositories.job_repo.JobRepository.load_job_aggregate", new_callable=AsyncMock) as mock_load,
        patch("app.services.job_ai_service.JobAIService.enrich_job", side_effect=AIProviderError(provider="gemini", reason="Rate Limit 429", retryable=True)),
        patch("app.repositories.job_repo.JobRepository.mark_embedding_failed", new_callable=AsyncMock) as mock_failed,
    ):
        mock_is_processed.return_value = False
        mock_acquire_lease.return_value = True
        mock_load.return_value = mock_job

        response = client.post("/internal/tasks/job/enrich", json=payload)
        assert response.status_code == 503
        mock_failed.assert_not_called()
        mock_release_lease.assert_awaited_once()


