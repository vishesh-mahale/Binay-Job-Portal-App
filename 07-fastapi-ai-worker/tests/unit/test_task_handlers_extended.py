"""Unit tests for extended task handler branches (Section 6 workloads)."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.api.v1.task_handlers import (
    handle_match_analyze_task,
    handle_interview_summary_task,
    handle_job_screening_questions_task,
)
from app.schemas.tasks import (
    MatchAnalyzeTaskPayload,
    InterviewSummaryTaskPayload,
    JobScreeningQuestionsTaskPayload,
)


def _settings_with_oidc() -> Settings:
    return Settings(
        DATABASE_URL="postgresql+asyncpg://test:test@localhost:5432/test_db",
        GOOGLE_CLOUD_PROJECT_ID="test-project",
        GOOGLE_OIDC_ALLOWED_SERVICE_ACCOUNTS="test@test-project.iam.gserviceaccount.com",
        OIDC_AUTH_ENABLED=True,
        SUPABASE_PROJECT_URL="https://test.supabase.co",
        SUPABASE_STORAGE_KEY="test-key",
        SECRET_KEY="test-secret-key-minimum-32-characters-required-here",
        AI_PROVIDER="mock",
        MOCK_AI_PROVIDER=True,
    )


@pytest.mark.asyncio
async def test_match_analyze_oidc_failure():
    """Verify 401 when OIDC fails on match analyze endpoint."""
    mock_req = MagicMock()
    with (
        patch("app.api.v1.task_handlers.get_settings", return_value=_settings_with_oidc()),
        patch("app.core.security.OIDCTokenValidator.validate_bearer_token", side_effect=ValueError("Invalid token")),
    ):
        with pytest.raises(HTTPException) as exc_info:
            await handle_match_analyze_task(
                payload=MatchAnalyzeTaskPayload(schema_version=1, event_id="e1", aggregate_id="a1"),
                request=mock_req,
                authorization="Bearer badtoken",
            )
        assert exc_info.value.status_code == 401
        assert exc_info.value.detail["code"] == "OIDC_UNAUTHORIZED"


@pytest.mark.asyncio
async def test_match_analyze_lease_held(test_app):
    """Verify lease held skips match analyze task."""
    client = TestClient(test_app)
    payload = {"schema_version": 1, "event_id": "e1", "aggregate_id": "a1"}

    with (
        patch("app.repositories.processed_events_repo.ProcessedEventsRepository.is_processed", new_callable=AsyncMock) as mock_is_proc,
        patch("app.core.database.DatabaseManager.acquire_processing_lease", new_callable=AsyncMock) as mock_lease,
    ):
        mock_is_proc.return_value = False
        mock_lease.return_value = False

        response = client.post("/internal/tasks/match/analyze", json=payload)
        assert response.status_code == 200
        assert response.json()["reason"] == "lease_held"


@pytest.mark.asyncio
async def test_match_analyze_not_found(test_app):
    """Verify application not found skips match analyze task."""
    client = TestClient(test_app)
    payload = {"schema_version": 1, "event_id": "e1", "aggregate_id": "a1"}

    with (
        patch("app.repositories.processed_events_repo.ProcessedEventsRepository.is_processed", new_callable=AsyncMock) as mock_is_proc,
        patch("app.core.database.DatabaseManager.acquire_processing_lease", new_callable=AsyncMock) as mock_lease,
        patch("app.repositories.match_repo.MatchRepository.load_application_match_context", new_callable=AsyncMock) as mock_load,
        patch("app.core.database.DatabaseManager.release_processing_lease", new_callable=AsyncMock),
    ):
        mock_is_proc.return_value = False
        mock_lease.return_value = True
        mock_load.return_value = None

        response = client.post("/internal/tasks/match/analyze", json=payload)
        assert response.status_code == 200
        assert response.json()["reason"] == "application_not_found"


@pytest.mark.asyncio
async def test_interview_summary_oidc_failure():
    """Verify 401 when OIDC fails on interview summary endpoint."""
    mock_req = MagicMock()
    with (
        patch("app.api.v1.task_handlers.get_settings", return_value=_settings_with_oidc()),
        patch("app.core.security.OIDCTokenValidator.validate_bearer_token", side_effect=ValueError("Invalid token")),
    ):
        with pytest.raises(HTTPException) as exc_info:
            await handle_interview_summary_task(
                payload=InterviewSummaryTaskPayload(schema_version=1, event_id="e2", aggregate_id="i2"),
                request=mock_req,
                authorization="Bearer badtoken",
            )
        assert exc_info.value.status_code == 401
        assert exc_info.value.detail["code"] == "OIDC_UNAUTHORIZED"


@pytest.mark.asyncio
async def test_interview_summary_lease_held(test_app):
    """Verify lease held skips interview summary task."""
    client = TestClient(test_app)
    payload = {"schema_version": 1, "event_id": "e2", "aggregate_id": "i2"}

    with (
        patch("app.repositories.processed_events_repo.ProcessedEventsRepository.is_processed", new_callable=AsyncMock) as mock_is_proc,
        patch("app.core.database.DatabaseManager.acquire_processing_lease", new_callable=AsyncMock) as mock_lease,
    ):
        mock_is_proc.return_value = False
        mock_lease.return_value = False

        response = client.post("/internal/tasks/interview/summary", json=payload)
        assert response.status_code == 200
        assert response.json()["reason"] == "lease_held"


@pytest.mark.asyncio
async def test_interview_summary_not_found(test_app):
    """Verify interview not found skips task."""
    client = TestClient(test_app)
    payload = {"schema_version": 1, "event_id": "e2", "aggregate_id": "i2"}

    with (
        patch("app.repositories.processed_events_repo.ProcessedEventsRepository.is_processed", new_callable=AsyncMock) as mock_is_proc,
        patch("app.core.database.DatabaseManager.acquire_processing_lease", new_callable=AsyncMock) as mock_lease,
        patch("app.repositories.interview_repo.InterviewRepository.load_interview_context", new_callable=AsyncMock) as mock_load,
        patch("app.core.database.DatabaseManager.release_processing_lease", new_callable=AsyncMock),
    ):
        mock_is_proc.return_value = False
        mock_lease.return_value = True
        mock_load.return_value = None

        response = client.post("/internal/tasks/interview/summary", json=payload)
        assert response.status_code == 200
        assert response.json()["reason"] == "interview_not_found"


@pytest.mark.asyncio
async def test_screening_questions_oidc_failure():
    """Verify 401 when OIDC fails on screening questions endpoint."""
    mock_req = MagicMock()
    with (
        patch("app.api.v1.task_handlers.get_settings", return_value=_settings_with_oidc()),
        patch("app.core.security.OIDCTokenValidator.validate_bearer_token", side_effect=ValueError("Invalid token")),
    ):
        with pytest.raises(HTTPException) as exc_info:
            await handle_job_screening_questions_task(
                payload=JobScreeningQuestionsTaskPayload(schema_version=1, event_id="e3", aggregate_id="j3"),
                request=mock_req,
                authorization="Bearer badtoken",
            )
        assert exc_info.value.status_code == 401
        assert exc_info.value.detail["code"] == "OIDC_UNAUTHORIZED"


@pytest.mark.asyncio
async def test_screening_questions_lease_held(test_app):
    """Verify lease held skips screening questions task."""
    client = TestClient(test_app)
    payload = {"schema_version": 1, "event_id": "e3", "aggregate_id": "j3"}

    with (
        patch("app.repositories.processed_events_repo.ProcessedEventsRepository.is_processed", new_callable=AsyncMock) as mock_is_proc,
        patch("app.core.database.DatabaseManager.acquire_processing_lease", new_callable=AsyncMock) as mock_lease,
    ):
        mock_is_proc.return_value = False
        mock_lease.return_value = False

        response = client.post("/internal/tasks/job/screening-questions", json=payload)
        assert response.status_code == 200
        assert response.json()["reason"] == "lease_held"


@pytest.mark.asyncio
async def test_screening_questions_not_found(test_app):
    """Verify job not found skips screening questions task."""
    client = TestClient(test_app)
    payload = {"schema_version": 1, "event_id": "e3", "aggregate_id": "j3"}

    with (
        patch("app.repositories.processed_events_repo.ProcessedEventsRepository.is_processed", new_callable=AsyncMock) as mock_is_proc,
        patch("app.core.database.DatabaseManager.acquire_processing_lease", new_callable=AsyncMock) as mock_lease,
        patch("app.repositories.screening_questions_repo.ScreeningQuestionsRepository.load_job_for_screening", new_callable=AsyncMock) as mock_load,
        patch("app.core.database.DatabaseManager.release_processing_lease", new_callable=AsyncMock),
    ):
        mock_is_proc.return_value = False
        mock_lease.return_value = True
        mock_load.return_value = None

        response = client.post("/internal/tasks/job/screening-questions", json=payload)
        assert response.status_code == 200
        assert response.json()["reason"] == "job_not_found"
