"""Integration test for Match & Gap Analysis Cloud Task workflow."""

from contextlib import asynccontextmanager
import pytest
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient


@pytest.mark.asyncio
async def test_match_analysis_task_flow(test_app):
    """Verify end-to-end task execution for /internal/tasks/match/analyze."""
    client = TestClient(test_app)

    payload = {
        "schema_version": 1,
        "event_id": "e9999999-9999-9999-9999-999999999999",
        "aggregate_id": "a9999999-9999-9999-9999-999999999999",
        "trace_id": "t9999999-9999-9999-9999-999999999999",
    }

    mock_context = {
        "application_id": "a9999999-9999-9999-9999-999999999999",
        "job_id": "j9999999-9999-9999-9999-999999999999",
        "candidate_id": "c9999999-9999-9999-9999-999999999999",
        "job_title": "Full Stack Dev",
        "required_skills": ["TypeScript", "Python"],
        "optional_skills": ["Docker"],
        "candidate_title": "Software Engineer",
        "candidate_skills": ["Python", "FastAPI"],
    }

    @asynccontextmanager
    async def _mock_tx():
        yield AsyncMock()

    with (
        patch("app.core.database.DatabaseManager.initialize", new_callable=AsyncMock),
        patch("app.repositories.processed_events_repo.ProcessedEventsRepository.is_processed", new_callable=AsyncMock) as mock_is_processed,
        patch("app.core.database.DatabaseManager.acquire_processing_lease", new_callable=AsyncMock) as mock_acquire_lease,
        patch("app.core.database.DatabaseManager.release_processing_lease", new_callable=AsyncMock) as mock_release_lease,
        patch("app.repositories.match_repo.MatchRepository.load_application_match_context", new_callable=AsyncMock) as mock_load,
        patch("app.repositories.match_repo.MatchRepository.update_application_match_result", new_callable=AsyncMock) as mock_update,
        patch("app.repositories.processed_events_repo.ProcessedEventsRepository.record_processed", new_callable=AsyncMock) as mock_record,
        patch("app.repositories.outbox_repo.OutboxRepository.emit_event", new_callable=AsyncMock) as mock_outbox,
        patch("app.repositories.analytics_repo.AnalyticsRepository.emit", new_callable=AsyncMock) as mock_analytics,
        patch("app.core.database.DatabaseManager.transaction", side_effect=_mock_tx),
    ):
        mock_is_processed.return_value = False
        mock_acquire_lease.return_value = True
        mock_load.return_value = mock_context
        mock_update.return_value = True
        mock_record.return_value = True
        mock_outbox.return_value = "outbox-uuid"
        mock_analytics.return_value = True

        response = client.post("/internal/tasks/match/analyze", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert "match_score" in data
        assert "ranking_score" in data

        mock_update.assert_awaited_once()
        mock_record.assert_awaited_once()
        mock_outbox.assert_awaited_once()
        mock_analytics.assert_awaited_once()
        mock_release_lease.assert_awaited_once()


@pytest.mark.asyncio
async def test_match_analysis_duplicate_skip(test_app):
    """Verify duplicate task skips execution."""
    client = TestClient(test_app)
    payload = {
        "schema_version": 1,
        "event_id": "e9999999-9999-9999-9999-999999999999",
        "aggregate_id": "a9999999-9999-9999-9999-999999999999",
    }

    with (
        patch("app.core.database.DatabaseManager.initialize", new_callable=AsyncMock),
        patch("app.repositories.processed_events_repo.ProcessedEventsRepository.is_processed", new_callable=AsyncMock) as mock_is_processed,
    ):
        mock_is_processed.return_value = True
        response = client.post("/internal/tasks/match/analyze", json=payload)
        assert response.status_code == 200
        assert response.json()["skipped"] is True
