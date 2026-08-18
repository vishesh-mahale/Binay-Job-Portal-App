"""Unit tests for ProcessedEventsRepository branches."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.repositories.processed_events_repo import ProcessedEventsRepository


class _AsyncContextManager:
    def __init__(self, session):
        self._session = session

    async def __aenter__(self):
        return self._session

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        return False


@pytest.fixture
def mock_db():
    db = MagicMock()
    session = AsyncMock()
    db.session_maker = MagicMock(return_value=_AsyncContextManager(session))
    return db, session


@pytest.mark.asyncio
async def test_is_processed_returns_false(mock_db):
    db, session = mock_db
    repo = ProcessedEventsRepository(db)

    mock_result = MagicMock()
    mock_result.first.return_value = None
    session.execute = AsyncMock(return_value=mock_result)

    result = await repo.is_processed("consumer-1", "event-1")
    assert result is False


@pytest.mark.asyncio
async def test_record_processed_with_session(mock_db):
    db, session = mock_db
    repo = ProcessedEventsRepository(db)

    mock_result = MagicMock()
    mock_result.rowcount = 1
    session.execute = AsyncMock(return_value=mock_result)

    inserted = await repo.record_processed(
        consumer_name="consumer-1",
        event_id="event-1",
        result_metadata={"status": "ok"},
        session=session,
    )
    assert inserted is True
