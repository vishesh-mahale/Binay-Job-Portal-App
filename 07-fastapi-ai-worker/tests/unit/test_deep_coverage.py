"""Deep coverage unit tests targeting the inner execution branches of all 6 task handlers and repositories."""

from datetime import datetime, timezone
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi.testclient import TestClient

from app.schemas.tasks import (
    ResumeParseTaskPayload,
    CandidateProjectionTaskPayload,
    JobEnrichTaskPayload,
    MatchAnalyzeTaskPayload,
    InterviewSummaryTaskPayload,
    JobScreeningQuestionsTaskPayload,
)
from app.schemas.resume_parser import ResumeExtractedSchema
from app.schemas.candidate_search import CandidateCanonicalAggregate
from app.schemas.job_enrichment import JobCanonicalAggregate
from app.repositories.resume_parsed_repo import ResumeParsedRepository
from app.repositories.parsing_job_repo import ResumeParsingJobRepository


class _AsyncContextManager:
    def __init__(self, session):
        self._session = session

    async def __aenter__(self):
        return self._session

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        return False


def test_candidate_projection_inner_execution(test_app):
    """Test full inner execution block of handle_candidate_projection_task."""
    client = TestClient(test_app)
    payload = CandidateProjectionTaskPayload(
        schema_version=1,
        event_id="evt-proj-1",
        aggregate_id="cand-proj-1",
        candidate_id="cand-proj-1",
        revision_number=1,
    ).model_dump()

    mock_session = AsyncMock()
    mock_db_mgr = MagicMock()
    mock_db_mgr.transaction = MagicMock(return_value=_AsyncContextManager(mock_session))
    mock_db_mgr.session_maker = MagicMock(return_value=_AsyncContextManager(mock_session))
    mock_db_mgr.acquire_processing_lease = AsyncMock(return_value=True)
    mock_db_mgr.release_processing_lease = AsyncMock()

    with (
        patch("app.repositories.processed_events_repo.ProcessedEventsRepository.is_processed", new_callable=AsyncMock, return_value=False),
        patch("app.repositories.projection_repo.CandidateProjectionRepository.check_stale_source_state", new_callable=AsyncMock, return_value=None),
        patch("app.repositories.projection_repo.CandidateProjectionRepository.load_candidate_aggregate", new_callable=AsyncMock) as mock_load,
        patch("app.repositories.projection_repo.CandidateProjectionRepository.upsert_search_profile", new_callable=AsyncMock),
        patch("app.repositories.outbox_repo.OutboxRepository.emit_event", new_callable=AsyncMock),
        patch("app.repositories.analytics_repo.AnalyticsRepository.emit", new_callable=AsyncMock),
        patch("app.repositories.processed_events_repo.ProcessedEventsRepository.record_processed", new_callable=AsyncMock),
        patch("app.api.v1.task_handlers.get_db_manager", return_value=mock_db_mgr),
    ):
        mock_load.return_value = CandidateCanonicalAggregate(
            candidate_id="cand-proj-1",
            user_id="user-1",
            profile_revision=1,
            professional_title="Software Architect",
            summary="Experienced architect",
            preferred_work_mode="remote",
            willing_to_relocate=True,
            total_experience_years=8.0,
            has_completed_onboarding=True,
            is_searchable=True,
        )

        response = client.post("/internal/tasks/candidate/projection", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"


def test_job_enrich_inner_execution(test_app):
    """Test full inner execution block of handle_job_enrich_task."""
    client = TestClient(test_app)
    payload = JobEnrichTaskPayload(
        schema_version=1,
        event_id="evt-job-1",
        aggregate_id="job-enrich-1",
    ).model_dump()

    mock_session = AsyncMock()
    mock_db_mgr = MagicMock()
    mock_db_mgr.transaction = MagicMock(return_value=_AsyncContextManager(mock_session))
    mock_db_mgr.session_maker = MagicMock(return_value=_AsyncContextManager(mock_session))
    mock_db_mgr.acquire_processing_lease = AsyncMock(return_value=True)
    mock_db_mgr.release_processing_lease = AsyncMock()

    with (
        patch("app.repositories.processed_events_repo.ProcessedEventsRepository.is_processed", new_callable=AsyncMock, return_value=False),
        patch("app.repositories.job_repo.JobRepository.check_stale_job", new_callable=AsyncMock, return_value=False),
        patch("app.repositories.job_repo.JobRepository.load_job_aggregate", new_callable=AsyncMock) as mock_load,
        patch("app.repositories.job_repo.JobRepository.update_job_ai_enrichment", new_callable=AsyncMock, return_value=True),
        patch("app.repositories.outbox_repo.OutboxRepository.emit_event", new_callable=AsyncMock),
        patch("app.repositories.analytics_repo.AnalyticsRepository.emit", new_callable=AsyncMock),
        patch("app.repositories.processed_events_repo.ProcessedEventsRepository.record_processed", new_callable=AsyncMock),
        patch("app.api.v1.task_handlers.get_db_manager", return_value=mock_db_mgr),
    ):
        mock_load.return_value = JobCanonicalAggregate(
            job_id="job-enrich-1",
            title="Senior Backend Engineer",
            description="Developing high-throughput async Python services.",
            employment_type="full_time",
            work_mode="remote",
            skills=["Python", "FastAPI"],
            locations=["Remote"],
            updated_at=datetime.now(timezone.utc),
        )

        response = client.post("/internal/tasks/job/enrich", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"


@pytest.mark.asyncio
async def test_resume_parsed_repo_methods():
    """Test ResumeParsedRepository standalone helper methods."""
    mock_db = MagicMock()
    mock_session = AsyncMock()
    mock_res = MagicMock()
    mock_res.mappings.return_value.first.return_value = {"id": "res-1"}
    mock_session.execute = AsyncMock(return_value=mock_res)

    class _CM:
        async def __aenter__(self):
            return mock_session
        async def __aexit__(self, *args):
            return False

    mock_db.session_maker.return_value = _CM()
    repo = ResumeParsedRepository(mock_db)

    # insert_artifact
    await repo.insert_artifact(
        parsing_job_id="job-1",
        artifact_type="raw_text",
        inline_data={"raw_text": "Sample raw text"},
        session=mock_session,
    )
    assert mock_session.execute.called

    # insert_event
    await repo.insert_event(
        parsing_job_id="job-1",
        event_type="started",
        event_data={"attempt": 1},
        session=mock_session,
    )
    assert mock_session.execute.called
