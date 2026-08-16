"""Unit tests for all database repository classes and transaction helpers."""

from contextlib import asynccontextmanager
from datetime import datetime, timezone
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.core.database import DatabaseManager
from app.repositories.processed_events_repo import ProcessedEventsRepository
from app.repositories.outbox_repo import OutboxRepository
from app.repositories.parsing_job_repo import ResumeParsingJobRepository


@pytest.mark.asyncio
async def test_processed_events_repo_flow():
    """Verify is_processed check and record_processed insert."""
    mock_db = MagicMock(spec=DatabaseManager)
    session = AsyncMock()

    mock_res = MagicMock()
    mock_res.first.return_value = (1,)
    mock_res.rowcount = 1
    session.execute.return_value = mock_res

    @asynccontextmanager
    async def _mock_maker():
        yield session

    mock_db.session_maker = _mock_maker

    repo = ProcessedEventsRepository(mock_db)
    is_proc = await repo.is_processed("resume_parser", "event-123")
    assert is_proc is True

    recorded = await repo.record_processed(
        consumer_name="resume_parser",
        event_id="event-123",
        result_metadata={"status": "ok"},
        session=session,
    )
    assert recorded is True
    session.execute.assert_awaited()


@pytest.mark.asyncio
async def test_outbox_repo_emit_event():
    """Verify outbox event emission."""
    mock_db = MagicMock(spec=DatabaseManager)
    session = AsyncMock()

    mock_row = {"id": "outbox-uuid-123"}
    mock_res = MagicMock()
    mock_mapping = MagicMock()
    mock_mapping.first.return_value = mock_row
    mock_res.mappings.return_value = mock_mapping
    session.execute.return_value = mock_res

    repo = OutboxRepository(mock_db)
    event_id = await repo.emit_event(
        aggregate_type="job",
        aggregate_id="job-123",
        event_type="job.enriched",
        payload={"job_id": "job-123"},
        session=session,
    )
    assert event_id == "outbox-uuid-123"


@pytest.mark.asyncio
async def test_resume_parsing_job_repo_claim_and_mark():
    """Verify resume parsing job claiming and completion."""
    mock_db = MagicMock(spec=DatabaseManager)
    session = AsyncMock()

    mock_mapping = MagicMock()
    mock_mapping.first.return_value = {"id": "job-123", "document_id": "doc-123"}
    mock_res = MagicMock()
    mock_res.mappings.return_value = mock_mapping
    session.execute.return_value = mock_res

    @asynccontextmanager
    async def _mock_maker():
        yield session

    mock_db.session_maker = _mock_maker

    repo = ResumeParsingJobRepository(mock_db)
    claimed = await repo.claim_job("job-123", worker_id="worker-1")
    assert claimed["id"] == "job-123"

    await repo.mark_completed("job-123", session=session)
    await repo.mark_failed("job-123", {"error": "test error"}, session=session)
    assert session.execute.await_count >= 3
