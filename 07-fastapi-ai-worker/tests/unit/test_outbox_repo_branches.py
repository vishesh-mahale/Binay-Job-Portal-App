"""Unit tests for OutboxRepository branches."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.repositories.outbox_repo import OutboxRepository


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
async def test_emit_event_with_session(mock_db):
    db, session = mock_db
    repo = OutboxRepository(db)

    mock_result = MagicMock()
    mock_result.mappings.return_value.first.return_value = {"id": "evt-1"}
    session.execute = AsyncMock(return_value=mock_result)

    event_id = await repo.emit_event(
        aggregate_type="candidate",
        aggregate_id="c1",
        event_type="updated",
        payload={"key": "val"},
        session=session,
    )
    assert event_id == "evt-1"
