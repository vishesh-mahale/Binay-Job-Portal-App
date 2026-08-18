"""Unit tests for ResumeParsedRepository branches."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.repositories.resume_parsed_repo import ResumeParsedRepository


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
async def test_insert_parsed_result_with_session(mock_db):
    db, session = mock_db
    repo = ResumeParsedRepository(db)

    mock_result = MagicMock()
    mock_result.mappings.return_value.first.return_value = {"id": "parsed-1"}
    session.execute = AsyncMock(return_value=mock_result)

    result = await repo.insert_parsed_result(
        parsing_job_id="job-1",
        document_id="doc-1",
        extracted_text="resume text",
        raw_ai_output={},
        normalized_output={},
        confidence_details={},
        validation_result={},
        overall_confidence=95.0,
        schema_version="1.0",
        session=session,
    )
    assert result == "parsed-1"
    assert session.execute.await_count == 1


@pytest.mark.asyncio
async def test_insert_artifact_with_session(mock_db):
    db, session = mock_db
    repo = ResumeParsedRepository(db)

    await repo.insert_artifact(
        parsing_job_id="job-1",
        artifact_type="extracted_text",
        inline_data={"text": "sample"},
        checksum_sha256="abc123",
        session=session,
    )
    assert session.execute.await_count == 1


@pytest.mark.asyncio
async def test_insert_event_with_session(mock_db):
    db, session = mock_db
    repo = ResumeParsedRepository(db)

    await repo.insert_event(
        parsing_job_id="job-1",
        event_type="started",
        event_data={"trace_id": "t1"},
        session=session,
    )
    assert session.execute.await_count == 1
