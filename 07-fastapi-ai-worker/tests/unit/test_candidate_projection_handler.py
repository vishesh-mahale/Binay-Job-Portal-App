"""Unit tests for candidate projection task handler success path."""

from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.schemas.tasks import CandidateProjectionTaskPayload
from app.schemas.candidate_search import (
    CandidateCanonicalAggregate,
    CandidateSearchProfileUpsert,
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


def test_candidate_projection_success_returns_200(test_app):
    client = TestClient(test_app)
    candidate_id = "c1111111-1111-1111-1111-111111111111"
    payload = CandidateProjectionTaskPayload(
        schema_version=1,
        event_id="e2222222-2222-2222-2222-222222222222",
        aggregate_id=candidate_id,
        trace_id="t2222222-2222-2222-2222-222222222222",
    ).model_dump()

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
                "primary_source_type": "candidate_manual",
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

    upsert_data = CandidateSearchProfileUpsert(
        candidate_id=candidate_id,
        source_profile_revision=2,
        projection_revision=2,
        active_resume_document_id="d1111111-1111-1111-1111-111111111111",
        active_resume_parsing_result_id="p1111111-1111-1111-1111-111111111111",
        professional_title="Lead Backend Engineer",
        normalized_titles=["Backend Engineer", "Lead Backend Engineer"],
        skill_ids=["s1111111-1111-1111-1111-111111111111"],
        skill_names=["Python", "PostgreSQL", "Redis"],
        locations=["Bengaluru, Karnataka, India"],
        fact_sources={},
        total_experience_years=3.0,
        highest_education_level=None,
        searchable_text="Lead Backend Engineer Python PostgreSQL Redis Bengaluru Karnataka India",
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
        patch("app.repositories.projection_repo.CandidateProjectionRepository.load_candidate_aggregate", new_callable=AsyncMock) as mock_load,
        patch("app.repositories.projection_repo.CandidateProjectionRepository.check_stale_source_state", new_callable=AsyncMock) as mock_stale,
        patch("app.repositories.projection_repo.CandidateProjectionRepository.upsert_search_profile", new_callable=AsyncMock) as mock_upsert,
        patch("app.repositories.processed_events_repo.ProcessedEventsRepository.record_processed", new_callable=AsyncMock) as mock_record,
        patch("app.repositories.outbox_repo.OutboxRepository.emit_event", new_callable=AsyncMock) as mock_emit,
        patch("app.repositories.analytics_repo.AnalyticsRepository.emit", new_callable=AsyncMock) as mock_analytics,
        patch("app.core.database.DatabaseManager.transaction", side_effect=mock_tx),
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

        mock_upsert.assert_awaited_once()
        mock_record.assert_awaited_once()
        mock_emit.assert_awaited_once()
        mock_analytics.assert_awaited_once()


def test_candidate_projection_ai_provider_error_returns_503(test_app):
    client = TestClient(test_app)
    candidate_id = "c1111111-1111-1111-1111-111111111111"
    payload = CandidateProjectionTaskPayload(
        schema_version=1,
        event_id="e3333333-3333-3333-3333-333333333333",
        aggregate_id=candidate_id,
        trace_id="t3333333-3333-3333-3333-333333333333",
    ).model_dump()

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
                "primary_source_type": "candidate_manual",
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

    with (
        patch("app.core.database.DatabaseManager.initialize", new_callable=AsyncMock),
        patch("app.repositories.processed_events_repo.ProcessedEventsRepository.is_processed", new_callable=AsyncMock) as mock_is_processed,
        patch("app.core.database.DatabaseManager.acquire_processing_lease", new_callable=AsyncMock) as mock_acquire_lease,
        patch("app.core.database.DatabaseManager.release_processing_lease", new_callable=AsyncMock) as mock_release_lease,
        patch("app.repositories.projection_repo.CandidateProjectionRepository.load_candidate_aggregate", new_callable=AsyncMock) as mock_load,
        patch("app.repositories.projection_repo.CandidateProjectionRepository.check_stale_source_state", new_callable=AsyncMock) as mock_stale,
        patch("app.services.projection_service.CandidateProjectionService.generate_projection", new_callable=AsyncMock) as mock_generate,
    ):
        mock_is_processed.return_value = False
        mock_acquire_lease.return_value = True
        mock_load.return_value = mock_aggregate
        mock_stale.return_value = False
        mock_generate.side_effect = AIProviderError("gemini", "rate limit", retryable=True)

        response = client.post("/internal/tasks/candidate/projection", json=payload)
        assert response.status_code == 503
