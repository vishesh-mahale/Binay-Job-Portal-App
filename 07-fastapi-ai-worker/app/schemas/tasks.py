"""Task payload schemas for Cloud Tasks."""

from __future__ import annotations

from pydantic import BaseModel, Field


class ResumeParseTaskPayload(BaseModel):
    """Cloud Task payload for resume parsing."""
    schema_version: int = Field(1, ge=1)
    event_id: str
    aggregate_id: str
    trace_id: str | None = None


class CandidateProjectionTaskPayload(BaseModel):
    """Cloud Task payload for candidate search projection rebuild."""
    schema_version: int = Field(1, ge=1)
    event_id: str
    aggregate_id: str
    trace_id: str | None = None


class JobEnrichTaskPayload(BaseModel):
    """Cloud Task payload for job AI enrichment."""
    schema_version: int = Field(1, ge=1)
    event_id: str
    aggregate_id: str
    trace_id: str | None = None
