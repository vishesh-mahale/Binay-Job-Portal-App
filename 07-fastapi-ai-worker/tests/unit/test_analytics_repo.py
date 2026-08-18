"""Unit tests for AnalyticsRepository."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import DatabaseManager
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
async def test_emit_success(mock_db):
    db, session = mock_db
    repo = AnalyticsRepository(db)

    mock_result = MagicMock()
    mock_result.rowcount = 1
    session.execute = AsyncMock(return_value=mock_result)

    inserted = await repo.emit(
        event_name="resume_parsed",
        event_category="recruitment",
        source="fastapi",
        entity_type="candidate",
        entity_id="c1",
        event_data={"trace_id": "t1"},
        trace_id="t1",
    )
    assert inserted is True


@pytest.mark.asyncio
async def test_emit_duplicate(mock_db):
    db, session = mock_db
    repo = AnalyticsRepository(db)

    mock_result = MagicMock()
    mock_result.rowcount = 0
    session.execute = AsyncMock(return_value=mock_result)

    inserted = await repo.emit(
        event_name="resume_parsed",
        event_category="recruitment",
        source="fastapi",
        entity_type="candidate",
        entity_id="c1",
    )
    assert inserted is False


@pytest.mark.asyncio
async def test_emit_with_existing_session(mock_db):
    db, session = mock_db
    repo = AnalyticsRepository(db)

    mock_result = MagicMock()
    mock_result.rowcount = 1
    session.execute = AsyncMock(return_value=mock_result)

    inserted = await repo.emit(
        event_name="job_enriched",
        event_category="recruitment",
        source="fastapi",
        entity_type="job",
        entity_id="j1",
        session=session,
    )
    assert inserted is True
    session.execute.await_count == 1
