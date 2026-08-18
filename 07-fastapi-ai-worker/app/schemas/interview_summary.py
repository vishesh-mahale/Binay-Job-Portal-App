"""Schemas for Interview AI Summary (Section 6.6)."""

from __future__ import annotations

from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field


class InterviewSummaryTaskPayload(BaseModel):
    """Payload for Cloud Task requesting AI summary of interview feedback."""
    model_config = ConfigDict(extra="forbid")

    schema_version: int = Field(default=1, description="Must be 1")
    event_id: str = Field(..., description="Trigger event UUID")
    aggregate_id: str = Field(..., description="interview UUID")
    trace_id: str = Field(..., description="Distributed tracing UUID")


class InterviewSummaryResult(BaseModel):
    """AI-synthesized interview assessment."""
    model_config = ConfigDict(extra="forbid")

    summary: str = Field(..., description="Concise assessment summary")
    strengths: List[str] = Field(default_factory=list, description="Key candidate strengths observed")
    weaknesses: List[str] = Field(default_factory=list, description="Key candidate concerns or growth areas")
    technical_assessment: Optional[str] = None
    cultural_fit_assessment: Optional[str] = None
    recommendation: Optional[str] = None
    model_name: str
    generated_at: str
