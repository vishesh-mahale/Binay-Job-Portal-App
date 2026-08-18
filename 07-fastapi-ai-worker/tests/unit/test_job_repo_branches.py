"""Unit tests for JobRepository branches."""

from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.core.database import DatabaseManager
from app.repositories.job_repo import JobRepository


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
async def test_load_job_aggregate_with_skills_and_locations(mock_db):
    db, session = mock_db
    repo = JobRepository(db)

    job_result = MagicMock()
    job_result.mappings.return_value.first.return_value = {
        "id": "j1",
        "title": "Engineer",
        "slug": "engineer",
        "denorm_category": "Engineering",
        "employment_type": "full_time",
        "work_mode": "hybrid",
        "experience_level": "mid",
        "salary_min": 1000000.0,
        "salary_max": 2000000.0,
        "salary_currency": "INR",
        "description": "Job desc",
        "responsibilities": "Resp",
        "requirements": "Req",
        "preferred_qualifications": None,
        "benefits": None,
        "location_city": "Bengaluru",
        "location_state": "Karnataka",
        "location_country": "India",
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "category_name": "Engineering",
    }
    skills_result = MagicMock()
    skills_result.mappings.return_value.all.return_value = [{"skill_name": "Python"}]
    locations_result = MagicMock()
    locations_result.mappings.return_value.all.return_value = [
        {"city": "Bengaluru", "state": "Karnataka", "country": "India", "is_primary": True}
    ]

    session.execute = AsyncMock(side_effect=[job_result, skills_result, locations_result])

    with patch.object(repo, "db_manager", db):
        aggregate = await repo.load_job_aggregate("j1")
    assert aggregate is not None
    assert aggregate.job_id == "j1"
    assert "Python" in aggregate.skills
    assert "Bengaluru, Karnataka, India" in aggregate.locations


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
