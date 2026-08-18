"""Unit tests for JobRepository."""

from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import DatabaseManager
from app.repositories.job_repo import JobRepository
from app.schemas.job_enrichment import JobEnrichmentResult, JobAIProfileV1, JobExtractedProfile, JobInferredProfile, JobProfileMetadata


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
    db.transaction = MagicMock(return_value=_AsyncContextManager(session))
    return db, session


@pytest.mark.asyncio
async def test_load_job_aggregate_returns_none_when_missing(mock_db):
    db, session = mock_db
    repo = JobRepository(db)

    mock_result = MagicMock()
    mock_result.mappings.return_value.first.return_value = None
    session.execute = AsyncMock(return_value=mock_result)

    with patch.object(repo, "db_manager", db):
        aggregate = await repo.load_job_aggregate("missing-id")
    assert aggregate is None


@pytest.mark.asyncio
async def test_check_stale_job_detects_change(mock_db):
    db, session = mock_db
    repo = JobRepository(db)

    old_ts = datetime(2024, 1, 1, tzinfo=timezone.utc)
    new_ts = datetime(2024, 1, 2, tzinfo=timezone.utc)

    mock_result = MagicMock()
    mock_result.mappings.return_value.first.return_value = {"updated_at": new_ts}
    session.execute = AsyncMock(return_value=mock_result)

    with patch.object(repo, "db_manager", db):
        is_stale = await repo.check_stale_job("job-1", old_ts)
    assert is_stale is True


@pytest.mark.asyncio
async def test_check_stale_job_clean(mock_db):
    db, session = mock_db
    repo = JobRepository(db)

    ts = datetime(2024, 1, 1, tzinfo=timezone.utc)

    mock_result = MagicMock()
    mock_result.mappings.return_value.first.return_value = {"updated_at": ts}
    session.execute = AsyncMock(return_value=mock_result)

    with patch.object(repo, "db_manager", db):
        is_stale = await repo.check_stale_job("job-1", ts)
    assert is_stale is False


@pytest.mark.asyncio
async def test_update_job_ai_enrichment_success(mock_db):
    db, session = mock_db
    repo = JobRepository(db)

    profile = JobAIProfileV1(
        schema_version=1,
        extracted=JobExtractedProfile(must_have_skills=["Python"]),
        inferred=JobInferredProfile(role_family="Backend"),
        metadata=JobProfileMetadata(
            model="gemini-2.0-flash",
            model_version="v1",
            prompt_version="v1",
            generated_at=datetime.now(timezone.utc).isoformat(),
            processing_time_ms=120,
        ),
    )
    result = JobEnrichmentResult(
        job_id="job-1",
        ai_profile=profile,
        embedding=[0.1] * 768,
        embedding_model="text-embedding-004",
        embedding_version=1,
        stored_updated_at=datetime.now(timezone.utc),
    )

    mock_result = MagicMock()
    mock_result.rowcount = 1
    session.execute = AsyncMock(return_value=mock_result)

    with patch.object(repo, "db_manager", db):
        updated = await repo.update_job_ai_enrichment(result, session=session)
    assert updated is True
