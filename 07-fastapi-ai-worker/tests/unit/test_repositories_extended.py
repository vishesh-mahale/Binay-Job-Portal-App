"""Unit tests for repository branches and standalone session executions."""

import pytest
from unittest.mock import AsyncMock, MagicMock
from contextlib import asynccontextmanager

from app.repositories.match_repo import MatchRepository
from app.repositories.interview_repo import InterviewRepository
from app.repositories.screening_questions_repo import ScreeningQuestionsRepository
from app.repositories.outbox_repo import OutboxRepository
from app.repositories.processed_events_repo import ProcessedEventsRepository
from app.repositories.resume_parsed_repo import ResumeParsedRepository


@pytest.fixture
def mock_db_with_session():
    mock_db = MagicMock()
    mock_session = AsyncMock()

    sample_row = {
        "id": "test-id",
        "application_id": "a1",
        "job_id": "j1",
        "candidate_id": "c1",
        "participant_id": "p1",
        "interview_id": "i1",
        "is_guest": False,
        "job_title": "Software Engineer",
        "interview_title": "Technical Round",
        "title": "Software Engineer",
        "description": "Building tools",
        "guest_name": None,
        "cover_letter": None,
        "answers_to_screening_questions": [],
        "job_description": "Job desc",
        "job_responsibilities": "Job resp",
        "job_requirements": "Job req",
        "ai_ideal_candidate_profile": {},
        "feedback_json": "[]",
    }

    mock_res = MagicMock()
    mock_res.mappings.return_value.first.return_value = sample_row
    mock_res.mappings.return_value.all.return_value = []
    mock_res.scalar_one_or_none.return_value = 1
    mock_res.first.return_value = (1,)
    mock_res.rowcount = 1
    mock_session.execute = AsyncMock(return_value=mock_res)
    mock_session.commit = AsyncMock()

    @asynccontextmanager
    async def _tx():
        yield mock_session

    @asynccontextmanager
    async def _get_session():
        yield mock_session

    mock_db.transaction = _tx
    mock_db.get_session = _get_session
    
    mock_maker = MagicMock()
    mock_maker.return_value.__aenter__ = AsyncMock(return_value=mock_session)
    mock_maker.return_value.__aexit__ = AsyncMock(return_value=False)
    mock_db.session_maker = mock_maker
    return mock_db, mock_session


@pytest.mark.asyncio
async def test_match_repo_standalone_session(mock_db_with_session):
    mock_db, session = mock_db_with_session
    repo = MatchRepository(mock_db)

    ctx = await repo.load_application_match_context("a1")
    assert ctx is not None

    upd = await repo.update_application_match_result(
        application_id="a1",
        match_score=90.0,
        match_details={"note": "good"},
        ranking_score=90.0,
        session=None,
    )
    assert upd is True


@pytest.mark.asyncio
async def test_interview_repo_standalone_session(mock_db_with_session):
    mock_db, session = mock_db_with_session
    repo = InterviewRepository(mock_db)

    ctx = await repo.load_interview_context("i1")
    assert ctx is not None

    upd = await repo.update_interview_ai_summary(
        interview_id="i1",
        participant_id="p1",
        ai_summary="Great fit",
        session=None,
    )
    assert upd is True


@pytest.mark.asyncio
async def test_screening_repo_standalone_session(mock_db_with_session):
    mock_db, session = mock_db_with_session
    repo = ScreeningQuestionsRepository(mock_db)

    ctx = await repo.load_job_for_screening("j1")
    assert ctx is not None

    upd = await repo.update_job_screening_questions(
        job_id="j1",
        questions=[{"id": "q1", "question": "Explain FastAPI"}],
        session=None,
    )
    assert upd is True


@pytest.mark.asyncio
async def test_outbox_repo_standalone_session(mock_db_with_session):
    mock_db, session = mock_db_with_session
    repo = OutboxRepository(mock_db)

    mock_res = MagicMock()
    mock_res.mappings.return_value.first.return_value = {"id": "e1-uuid"}
    session.execute = AsyncMock(return_value=mock_res)

    event_id = await repo.emit_event(
        aggregate_type="job",
        aggregate_id="j1",
        event_type="job.created",
        payload={"title": "Engineer"},
        session=None,
    )
    assert event_id is not None


@pytest.mark.asyncio
async def test_processed_events_repo_standalone_session(mock_db_with_session):
    mock_db, session = mock_db_with_session
    repo = ProcessedEventsRepository(mock_db)

    is_proc = await repo.is_processed("consumer", "e1")
    assert is_proc is True

    rec = await repo.record_processed("consumer", "e1", {"status": "ok"}, session=None)
    assert rec is True


@pytest.mark.asyncio
async def test_resume_parsed_repo_standalone_session(mock_db_with_session):
    mock_db, session = mock_db_with_session
    repo = ResumeParsedRepository(mock_db)

    await repo.insert_event(
        parsing_job_id="job-1",
        event_type="started",
        event_data={"key": "val"},
        session=None,
    )

    await repo.insert_artifact(
        parsing_job_id="job-1",
        artifact_type="text",
        inline_data={"text": "hello"},
        checksum_sha256="abc",
        session=None,
    )
