"""Integration test for Interview AI Summary Cloud Task workflow."""

from contextlib import asynccontextmanager
import pytest
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient


@pytest.mark.asyncio
async def test_interview_summary_task_flow(test_app):
    """Verify end-to-end task execution for /internal/tasks/interview/summary."""
    client = TestClient(test_app)

    payload = {
        "schema_version": 1,
        "event_id": "e8888888-8888-8888-8888-888888888888",
        "aggregate_id": "i8888888-8888-8888-8888-888888888888",
        "trace_id": "t8888888-8888-8888-8888-888888888888",
    }

    mock_context = {
        "interview_id": "i8888888-8888-8888-8888-888888888888",
        "job_title": "Senior Frontend Dev",
        "interview_title": "Technical Round",
        "feedback_list": [
            {
                "participant_id": "p1111111-1111-1111-1111-111111111111",
                "participant_role": "lead",
                "technical_skill": 5,
                "communication": 4,
                "problem_solving": 5,
                "cultural_fit": 4,
                "overall_rating": 5,
                "decision": "pass",
                "strengths": "React, TypeScript architecture",
                "weaknesses": "None",
            }
        ],
    }

    @asynccontextmanager
    async def _mock_tx():
        yield AsyncMock()

    with (
        patch("app.core.database.DatabaseManager.initialize", new_callable=AsyncMock),
        patch("app.repositories.processed_events_repo.ProcessedEventsRepository.is_processed", new_callable=AsyncMock) as mock_is_processed,
        patch("app.core.database.DatabaseManager.acquire_processing_lease", new_callable=AsyncMock) as mock_acquire_lease,
        patch("app.core.database.DatabaseManager.release_processing_lease", new_callable=AsyncMock) as mock_release_lease,
        patch("app.repositories.interview_repo.InterviewRepository.load_interview_context", new_callable=AsyncMock) as mock_load,
        patch("app.repositories.interview_repo.InterviewRepository.update_interview_ai_summary", new_callable=AsyncMock) as mock_update,
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

        response = client.post("/internal/tasks/interview/summary", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert data["interview_id"] == payload["aggregate_id"]

        mock_update.assert_awaited_once()
        mock_record.assert_awaited_once()
        mock_outbox.assert_awaited_once()
        mock_release_lease.assert_awaited_once()
