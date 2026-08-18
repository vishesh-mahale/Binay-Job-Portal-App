"""Unit tests for AnalyticsRepository branches."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.repositories.analytics_repo import AnalyticsRepository


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
async def test_emit_error_path_raises_exception(mock_db):
    db, session = mock_db
    repo = AnalyticsRepository(db)

    session.execute = AsyncMock(side_effect=Exception("DB error"))

    with pytest.raises(Exception, match="DB error"):
        await repo.emit(
            event_name="resume_parsed",
            event_category="recruitment",
        )


@pytest.mark.asyncio
async def test_emit_duplicate_returns_false(mock_db):
    db, session = mock_db
    repo = AnalyticsRepository(db)

    mock_result = MagicMock()
    mock_result.rowcount = 0
    session.execute = AsyncMock(return_value=mock_result)

    inserted = await repo.emit(
        event_name="resume_parsed",
        event_category="recruitment",
    )
    assert inserted is False
