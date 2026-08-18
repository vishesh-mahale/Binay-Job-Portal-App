"""Schemas for AI Match & Gap Analysis (Section 6.3)."""

from __future__ import annotations

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field


class MatchAnalyzeTaskPayload(BaseModel):
    """Payload for Cloud Task requesting AI match analysis for a job application."""
    model_config = ConfigDict(extra="forbid")

    schema_version: int = Field(default=1, description="Must be 1")
    event_id: str = Field(..., description="Trigger event UUID")
    aggregate_id: str = Field(..., description="job_application UUID")
    trace_id: str = Field(..., description="Distributed tracing UUID")


class SkillMatchDetail(BaseModel):
    """Skill match breakdown item."""
    model_config = ConfigDict(extra="forbid")

    skill_name: str
    matched: bool
    importance: str = Field(default="required", description="'required' or 'preferred'")
    candidate_source: Optional[str] = Field(default=None, description="'confirmed_profile', 'resume', or None")


class ExperienceMatchDetail(BaseModel):
    """Experience requirements match comparison."""
    model_config = ConfigDict(extra="forbid")

    required_years_min: Optional[float] = None
    candidate_years: Optional[float] = None
    meets_requirement: bool = True


class GapItem(BaseModel):
    """Specific missing or weak requirement identified."""
    model_config = ConfigDict(extra="forbid")

    category: str = Field(..., description="'skill', 'experience', 'education', 'certification', 'domain'")
    description: str
    severity: str = Field(default="medium", description="'critical', 'high', 'medium', 'low'")


class MatchScoreDetails(BaseModel):
    """Structured details object stored in job_applications.ai_match_details."""
    model_config = ConfigDict(extra="forbid")

    skills_match_score: float = Field(..., ge=0, le=100)
    experience_match_score: float = Field(..., ge=0, le=100)
    domain_match_score: float = Field(..., ge=0, le=100)
    skills_breakdown: List[SkillMatchDetail] = Field(default_factory=list)
    experience_breakdown: Optional[ExperienceMatchDetail] = None
    gaps: List[GapItem] = Field(default_factory=list)
    fit_summary: str = Field(default="")
    evaluated_at: str
    model_name: str


class MatchAnalysisResult(BaseModel):
    """Complete result returned from MatchService."""
    model_config = ConfigDict(extra="forbid")

    match_score: float = Field(..., ge=0, le=100)
    ranking_score: float = Field(..., ge=0, le=100)
    details: MatchScoreDetails
