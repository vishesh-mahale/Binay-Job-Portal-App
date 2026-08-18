"""Targeted branch tests for task_handlers.py to push test coverage past 92%."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.api.v1.task_handlers import (
    handle_candidate_projection_task,
    handle_job_enrich_task,
    _resolve_candidate_id,
)
from app.schemas.tasks import (
    ResumeParseTaskPayload,
    CandidateProjectionTaskPayload,
    JobEnrichTaskPayload,
)


@pytest.mark.asyncio
async def test_resolve_candidate_id():
    """Verify _resolve_candidate_id helper queries document."""
    mock_session = MagicMock()
    mock_res = MagicMock()
    mock_mappings = MagicMock()
    mock_mappings.first.return_value = {"candidate_id": "cand-123"}
    mock_res.mappings.return_value = mock_mappings
    mock_session.execute = AsyncMock(return_value=mock_res)

    cid = await _resolve_candidate_id(mock_session, "doc-999")
    assert cid == "cand-123"

    mock_mappings.first.return_value = None
    cid_none = await _resolve_candidate_id(mock_session, "doc-none")
    assert cid_none is None


@pytest.mark.asyncio
async def test_candidate_projection_duplicate_and_lease():
    """Verify idempotency skip on candidate projection."""
    mock_req = MagicMock()

    with patch("app.repositories.processed_events_repo.ProcessedEventsRepository.is_processed", new_callable=AsyncMock, return_value=True):
        res = await handle_candidate_projection_task(
            payload=CandidateProjectionTaskPayload(
                schema_version=1,
                event_id="e2",
                aggregate_id="cand2",
                candidate_id="cand2",
                revision_number=1,
            ),
            request=mock_req,
        )
        assert res["skipped"] is True


@pytest.mark.asyncio
async def test_job_enrich_duplicate_skip():
    """Verify job enrich idempotency skip."""
    mock_req = MagicMock()
    with patch("app.repositories.processed_events_repo.ProcessedEventsRepository.is_processed", new_callable=AsyncMock, return_value=True):
        res = await handle_job_enrich_task(
            payload=JobEnrichTaskPayload(
                schema_version=1,
                event_id="e3",
                aggregate_id="job3",
            ),
            request=mock_req,
        )
        assert res["skipped"] is True
