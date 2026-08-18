"""Integration test for Job Screening Questions Cloud Task workflow."""

from contextlib import asynccontextmanager
import pytest
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient


@pytest.mark.asyncio
async def test_screening_questions_task_flow(test_app):
    """Verify end-to-end task execution for /internal/tasks/job/screening-questions."""
    client = TestClient(test_app)

    payload = {
        "schema_version": 1,
        "event_id": "e7777777-7777-7777-7777-777777777777",
        "aggregate_id": "j7777777-7777-7777-7777-777777777777",
        "trace_id": "t7777777-7777-7777-7777-777777777777",
    }

    mock_context = {
        "job_id": "j7777777-7777-7777-7777-777777777777",
        "title": "Senior DevOps Engineer",
        "description": "Maintain Kubernetes clusters",
        "skills": ["Kubernetes", "Terraform"],
        "work_mode": "remote",
    }

    @asynccontextmanager
    async def _mock_tx():
        yield AsyncMock()

    with (
        patch("app.core.database.DatabaseManager.initialize", new_callable=AsyncMock),
        patch("app.repositories.processed_events_repo.ProcessedEventsRepository.is_processed", new_callable=AsyncMock) as mock_is_processed,
        patch("app.core.database.DatabaseManager.acquire_processing_lease", new_callable=AsyncMock) as mock_acquire_lease,
        patch("app.core.database.DatabaseManager.release_processing_lease", new_callable=AsyncMock) as mock_release_lease,
        patch("app.repositories.screening_questions_repo.ScreeningQuestionsRepository.load_job_for_screening", new_callable=AsyncMock) as mock_load,
        patch("app.repositories.screening_questions_repo.ScreeningQuestionsRepository.update_job_screening_questions", new_callable=AsyncMock) as mock_update,
        patch("app.repositories.processed_events_repo.ProcessedEventsRepository.record_processed", new_callable=AsyncMock) as mock_record,
        patch("app.repositories.outbox_repo.OutboxRepository.emit_event", new_callable=AsyncMock) as mock_outbox,
        patch("app.core.database.DatabaseManager.transaction", side_effect=_mock_tx),
    ):
        mock_is_processed.return_value = False
        mock_acquire_lease.return_value = True
        mock_load.return_value = mock_context
        mock_update.return_value = True
        mock_record.return_value = True
        mock_outbox.return_value = "outbox-uuid"

        response = client.post("/internal/tasks/job/screening-questions", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert data["job_id"] == payload["aggregate_id"]
        assert data["questions_count"] >= 1

        mock_update.assert_awaited_once()
        mock_record.assert_awaited_once()
        mock_outbox.assert_awaited_once()
        mock_release_lease.assert_awaited_once()
