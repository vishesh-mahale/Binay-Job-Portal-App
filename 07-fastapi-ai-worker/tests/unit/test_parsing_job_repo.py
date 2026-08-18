"""Unit tests for ResumeParsingJobRepository."""

from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import DatabaseManager
from app.repositories.parsing_job_repo import ResumeParsingJobRepository


class _AsyncContextManager:
    def __init__(self, session):
        self._session = session

    async def __aenter__(self):
        return self._session

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        return False


@pytest.fixture
def mock_db():
    db = MagicMock(spec=DatabaseManager)
    session = AsyncMock()
    db.session_maker = MagicMock(return_value=_AsyncContextManager(session))
    return db, session


@pytest.mark.asyncio
async def test_claim_job_success(mock_db):
    db, session = mock_db
    repo = ResumeParsingJobRepository(db)

    mock_result = MagicMock()
    mock_result.mappings.return_value.first.return_value = {"id": "job-1", "document_id": "doc-1"}
    session.execute = AsyncMock(return_value=mock_result)

    claimed = await repo.claim_job("job-1", "worker-1")
    assert claimed["id"] == "job-1"
    assert claimed["document_id"] == "doc-1"


@pytest.mark.asyncio
async def test_claim_job_returns_none_when_already_claimed(mock_db):
    db, session = mock_db
    repo = ResumeParsingJobRepository(db)

    mock_result = MagicMock()
    mock_result.mappings.return_value.first.return_value = None
    session.execute = AsyncMock(return_value=mock_result)

    claimed = await repo.claim_job("job-1", "worker-1")
    assert claimed is None


@pytest.mark.asyncio
async def test_mark_completed(mock_db):
    db, session = mock_db
    repo = ResumeParsingJobRepository(db)

    await repo.mark_completed("job-1")
    assert session.execute.await_count == 1


@pytest.mark.asyncio
async def test_mark_failed(mock_db):
    db, session = mock_db
    repo = ResumeParsingJobRepository(db)

    await repo.mark_failed("job-1", {"error": "test"})
    assert session.execute.await_count == 1


@pytest.mark.asyncio
async def test_release_claim(mock_db):
    db, session = mock_db
    repo = ResumeParsingJobRepository(db)

    await repo.release_claim("job-1")
    assert session.execute.await_count == 1
