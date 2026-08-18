"""Unit tests for projection_repo branches."""

from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.repositories.projection_repo import CandidateProjectionRepository
from app.schemas.candidate_search import CandidateSearchProfileUpsert


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
async def test_load_candidate_aggregate_with_provided_session(mock_db):
    db, session = mock_db
    repo = CandidateProjectionRepository(db)

    profile_result = MagicMock()
    profile_result.mappings.return_value.first.return_value = {
        "id": "c1",
        "user_id": "u1",
        "professional_title": "Engineer",
        "summary": None,
        "city": "Bengaluru",
        "state": "Karnataka",
        "country": "India",
        "current_location": "Bengaluru, Karnataka, India",
        "preferred_work_mode": "remote",
        "willing_to_relocate": False,
        "willing_to_travel": True,
        "notice_period_days": 30,
        "expected_salary_min": 1000000,
        "expected_salary_max": 2000000,
        "salary_currency": "INR",
        "is_open_to_work": True,
        "profile_revision": 1,
    }
    skills_result = MagicMock()
    skills_result.mappings.return_value.all.return_value = []
    experiences_result = MagicMock()
    experiences_result.mappings.return_value.all.return_value = []
    educations_result = MagicMock()
    educations_result.mappings.return_value.all.return_value = []
    certifications_result = MagicMock()
    certifications_result.mappings.return_value.all.return_value = []
    projects_result = MagicMock()
    projects_result.mappings.return_value.all.return_value = []
    languages_result = MagicMock()
    languages_result.mappings.return_value.all.return_value = []
    doc_result = MagicMock()
    doc_result.mappings.return_value.first.return_value = None
    parse_result = MagicMock()
    parse_result.mappings.return_value.first.return_value = None

    session.execute = AsyncMock(side_effect=[
        profile_result,
        skills_result,
        experiences_result,
        educations_result,
        certifications_result,
        projects_result,
        languages_result,
        doc_result,
        parse_result,
    ])

    aggregate = await repo.load_candidate_aggregate("c1", session=session)
    assert aggregate is not None
    assert aggregate.candidate_id == "c1"
    assert session.execute.await_count == 8  # 8 queries when no active resume


@pytest.mark.asyncio
async def test_check_stale_source_state_profile_not_found(mock_db):
    db, session = mock_db
    repo = CandidateProjectionRepository(db)

    rev_result = MagicMock()
    rev_result.mappings.return_value.first.return_value = None
    session.execute = AsyncMock(return_value=rev_result)

    with patch.object(repo, "db_manager", db):
        is_stale = await repo.check_stale_source_state(
            candidate_id="missing",
            stored_revision=1,
            stored_document_id="d1",
            stored_parsing_result_id="r1",
        )
    assert is_stale is True


@pytest.mark.asyncio
async def test_check_stale_source_state_document_mismatch(mock_db):
    db, session = mock_db
    repo = CandidateProjectionRepository(db)

    rev_result = MagicMock()
    rev_result.mappings.return_value.first.return_value = {"profile_revision": 5}
    doc_result = MagicMock()
    doc_result.mappings.return_value.first.return_value = {"document_id": "d2"}
    session.execute = AsyncMock(side_effect=[rev_result, doc_result])

    with patch.object(repo, "db_manager", db):
        is_stale = await repo.check_stale_source_state(
            candidate_id="c1",
            stored_revision=5,
            stored_document_id="d1",
            stored_parsing_result_id="r1",
        )
    assert is_stale is True


@pytest.mark.asyncio
async def test_check_stale_source_state_parsing_result_mismatch(mock_db):
    db, session = mock_db
    repo = CandidateProjectionRepository(db)

    rev_result = MagicMock()
    rev_result.mappings.return_value.first.return_value = {"profile_revision": 5}
    doc_result = MagicMock()
    doc_result.mappings.return_value.first.return_value = {"document_id": "d1"}
    parse_result = MagicMock()
    parse_result.mappings.return_value.first.return_value = {"parsing_result_id": "r2"}
    session.execute = AsyncMock(side_effect=[rev_result, doc_result, parse_result])

    with patch.object(repo, "db_manager", db):
        is_stale = await repo.check_stale_source_state(
            candidate_id="c1",
            stored_revision=5,
            stored_document_id="d1",
            stored_parsing_result_id="r1",
        )
    assert is_stale is True


@pytest.mark.asyncio
async def test_check_stale_source_state_clean(mock_db):
    db, session = mock_db
    repo = CandidateProjectionRepository(db)

    rev_result = MagicMock()
    rev_result.mappings.return_value.first.return_value = {"profile_revision": 5}
    doc_result = MagicMock()
    doc_result.mappings.return_value.first.return_value = {"document_id": "d1"}
    parse_result = MagicMock()
    parse_result.mappings.return_value.first.return_value = {"parsing_result_id": "r1"}
    session.execute = AsyncMock(side_effect=[rev_result, doc_result, parse_result])

    with patch.object(repo, "db_manager", db):
        is_stale = await repo.check_stale_source_state(
            candidate_id="c1",
            stored_revision=5,
            stored_document_id="d1",
            stored_parsing_result_id="r1",
        )
    assert is_stale is False


@pytest.mark.asyncio
async def test_upsert_search_profile_with_session(mock_db):
    db, session = mock_db
    repo = CandidateProjectionRepository(db)

    mock_result = MagicMock()
    mock_result.rowcount = 1
    session.execute = AsyncMock(return_value=mock_result)

    upsert = CandidateSearchProfileUpsert(
        candidate_id="c1",
        source_profile_revision=5,
        projection_revision=5,
        active_resume_document_id="d1",
        active_resume_parsing_result_id="r1",
        professional_title="Engineer",
        normalized_titles=["engineer"],
        skill_ids=[],
        skill_names=["Python"],
        locations=["NYC"],
        fact_sources={},
        total_experience_years=5.0,
        highest_education_level="B.Tech",
        searchable_text="Engineer Python NYC",
        embedding=[0.1] * 768,
        embedding_model="text-embedding-004",
        embedding_version=1,
        stored_updated_at=datetime.now(timezone.utc),
    )

    with patch.object(repo, "db_manager", db):
        await repo.upsert_search_profile(upsert, session=session)

    assert session.execute.await_count == 1
