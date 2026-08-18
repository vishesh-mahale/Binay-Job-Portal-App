"""Schemas for Job Screening Questions (Section 6.7.1)."""

from __future__ import annotations

from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field


class JobScreeningQuestionsTaskPayload(BaseModel):
    """Payload for Cloud Task requesting tailored screening questions for a job."""
    model_config = ConfigDict(extra="forbid")

    schema_version: int = Field(default=1, description="Must be 1")
    event_id: str = Field(..., description="Trigger event UUID")
    aggregate_id: str = Field(..., description="job UUID")
    trace_id: str = Field(..., description="Distributed tracing UUID")


class ScreeningQuestionItem(BaseModel):
    """Individual screening question item stored in jobs.screening_questions JSONB array."""
    model_config = ConfigDict(extra="forbid")

    id: str = Field(..., description="Question UUID or identifier")
    question: str = Field(..., description="Screening question text")
    category: str = Field(default="technical", description="'technical', 'experience', 'logistics', 'cultural'")
    required: bool = Field(default=True, description="Whether answer is required")
    question_type: str = Field(default="text", description="'text', 'boolean', 'choice', 'number'")
    options: Optional[List[str]] = Field(default=None, description="Optional choices if question_type='choice'")


class JobScreeningQuestionsResult(BaseModel):
    """Result returned by ScreeningService."""
    model_config = ConfigDict(extra="forbid")

    questions: List[ScreeningQuestionItem] = Field(default_factory=list)
    model_name: str
    generated_at: str
