"""Unit tests for CandidateProjectionRepository."""

from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

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
async def test_load_candidate_aggregate_returns_none_when_missing(mock_db):
    db, session = mock_db
    repo = CandidateProjectionRepository(db)

    mock_result = MagicMock()
    mock_result.mappings.return_value.first.return_value = None
    session.execute = AsyncMock(return_value=mock_result)

    with patch.object(repo, "db_manager", db):
        aggregate = await repo.load_candidate_aggregate("missing-id")
    assert aggregate is None


@pytest.mark.asyncio
async def test_check_stale_source_state_detects_newer_revision(mock_db):
    db, session = mock_db
    repo = CandidateProjectionRepository(db)

    mock_result = MagicMock()
    mock_result.mappings.return_value.first.return_value = {"profile_revision": 10}
    session.execute = AsyncMock(return_value=mock_result)

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
async def test_upsert_search_profile_inserts_new_row(mock_db):
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
