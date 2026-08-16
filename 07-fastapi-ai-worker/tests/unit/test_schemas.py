"""Unit tests for all core task and domain schemas across worker pipelines."""

import pytest
from pydantic import ValidationError

from app.schemas.tasks import (
    ResumeParseTaskPayload,
    CandidateProjectionTaskPayload,
    JobEnrichTaskPayload,
)
from app.schemas.resume_parser import ResumeExtractedSchema


def test_resume_parse_task_payload_valid():
    """Valid resume parse task payload."""
    payload = ResumeParseTaskPayload(
        schema_version=1,
        event_id="e1111111-1111-1111-1111-111111111111",
        aggregate_id="doc-1111-1111-1111-111111111111",
        trace_id="t1111111-1111-1111-1111-111111111111",
    )
    assert payload.schema_version == 1
    assert payload.aggregate_id == "doc-1111-1111-1111-111111111111"


def test_candidate_projection_task_payload_valid():
    """Valid candidate projection task payload."""
    payload = CandidateProjectionTaskPayload(
        schema_version=1,
        event_id="e2222222-2222-2222-2222-222222222222",
        aggregate_id="c2222222-2222-2222-2222-222222222222",
        trace_id="t2222222-2222-2222-2222-222222222222",
    )
    assert payload.schema_version == 1
    assert payload.aggregate_id == "c2222222-2222-2222-2222-222222222222"


def test_job_enrich_task_payload_valid():
    """Valid job enrichment task payload."""
    payload = JobEnrichTaskPayload(
        schema_version=1,
        event_id="e3333333-3333-3333-3333-333333333333",
        aggregate_id="j3333333-3333-3333-3333-333333333333",
        trace_id="t3333333-3333-3333-3333-333333333333",
    )
    assert payload.schema_version == 1
    assert payload.aggregate_id == "j3333333-3333-3333-3333-333333333333"


def test_task_payload_missing_required_fields():
    """Missing trace_id or aggregate_id triggers validation error."""
    with pytest.raises(ValidationError):
        JobEnrichTaskPayload(
            schema_version=1,
            event_id="e3333333-3333-3333-3333-333333333333",
            # missing aggregate_id and trace_id
        )
