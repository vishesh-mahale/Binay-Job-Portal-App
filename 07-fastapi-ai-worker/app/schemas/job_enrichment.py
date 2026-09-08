"""
Pydantic Schemas for Job AI Enrichment and 768-dim Embedding (JD-001).
Strictly matches 05_jobs_AI_Job_Profile_JSONB_Contract_v1_step1.md and 05_jobs_AI_Job_Embedding_Architecture_v1_step2.md.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


# ============================================================================
# Job AI Profile JSONB Contract v1
# ============================================================================

class JobExtractedProfile(BaseModel):
    """Explicit facts directly present in the job posting."""
    model_config = ConfigDict(extra="forbid")

    must_have_skills: List[str] = Field(default_factory=list, description="Mandatory skills explicitly required")
    nice_to_have_skills: List[str] = Field(default_factory=list, description="Optional / preferred skills")
    minimum_experience_years: Optional[float] = Field(default=None, ge=0.0, description="Explicit minimum years required (must be non-negative)")
    preferred_education: List[str] = Field(default_factory=list, description="Explicit degrees / qualifications")
    certifications: List[str] = Field(default_factory=list, description="Explicit certifications required or preferred")
    languages: List[str] = Field(default_factory=list, description="Explicit spoken / written language requirements")


class JobInferredProfile(BaseModel):
    """High-confidence AI inferences derived from job description context."""
    model_config = ConfigDict(extra="forbid")

    role_family: str = Field(default="", description="Functional role family e.g. Backend Engineering, Product")
    seniority: str = Field(default="", description="Inferred seniority e.g. Mid-Level, Senior, Lead")
    technical_domains: List[str] = Field(default_factory=list, description="Underlying tech domains e.g. Distributed Systems")
    industry_domains: List[str] = Field(default_factory=list, description="Industry sector e.g. FinTech, HealthTech")
    soft_skills: List[str] = Field(default_factory=list, description="Inferred behavioral / soft skills e.g. Leadership")
    primary_responsibilities: List[str] = Field(default_factory=list, description="Key core responsibilities summary")
    likely_career_level: str = Field(default="", description="Career stage e.g. IC3, Staff, Executive")
    keywords: List[str] = Field(default_factory=list, description="Search and relevance keywords")
    confidence_score: float = Field(default=0.0, ge=0.0, le=1.0, description="Confidence rating between 0.0 and 1.0")


class JobProfileMetadata(BaseModel):
    """Audit and lineage tracking metadata for the AI generation."""
    model_config = ConfigDict(extra="forbid")

    model: str = Field(..., description="LLM provider model name")
    model_version: str = Field(..., description="LLM version or checkpoint identifier")
    prompt_version: str = Field(default="v1", description="Prompt template version")
    generated_at: str = Field(..., description="ISO 8601 timestamp of generation")
    processing_time_ms: int = Field(default=0, description="Latency in milliseconds")


class JobAIProfileV1(BaseModel):
    """
    Top-level JSONB Contract v1 stored in jobs.ai_ideal_candidate_profile.
    Rejects undeclared fields strictly as required by contract.
    """
    model_config = ConfigDict(extra="forbid")

    schema_version: Literal[1] = Field(default=1, description="Schema version (must be exactly 1)")
    extracted: JobExtractedProfile = Field(default_factory=JobExtractedProfile)
    inferred: JobInferredProfile = Field(default_factory=JobInferredProfile)
    metadata: JobProfileMetadata


# ============================================================================
# Job Canonical Aggregate (Database Read Representation)
# ============================================================================

class JobSkillRequirement(BaseModel):
    """Internal representation of a skill requirement loaded from job_skills with metadata."""
    model_config = ConfigDict(extra="ignore")

    name: str
    is_required: bool = True
    min_years: Optional[float] = None
    importance_score: int = 5


class JobCanonicalAggregate(BaseModel):
    """Complete canonical data model loaded from database for a single job."""
    model_config = ConfigDict(from_attributes=True)

    job_id: str = Field(..., description="Job UUID")
    title: str = Field(..., description="Job title")
    slug: Optional[str] = None
    category: Optional[str] = Field(default=None, description="Category name (e.g. Engineering > Backend)")
    employment_type: Optional[str] = Field(default="full_time")
    work_mode: Optional[str] = Field(default="onsite")
    location_remote: Optional[bool] = Field(default=False, description="Location remote flag")
    experience_level: Optional[str] = None
    experience_min: Optional[int] = Field(default=None, description="Primary DB column: jobs.experience_min")
    experience_max: Optional[int] = Field(default=None, description="Primary DB column: jobs.experience_max")
    experience_min_years: Optional[int] = Field(default=None, description="Backward compatibility alias for experience_min")
    experience_max_years: Optional[int] = Field(default=None, description="Backward compatibility alias for experience_max")
    work_shift: Optional[str] = None
    education_type: Optional[str] = None
    min_education_level: Optional[str] = None
    max_notice_period_days: Optional[int] = None
    salary_min: Optional[float] = None
    salary_max: Optional[float] = None
    salary_currency: Optional[str] = "INR"
    description: str = Field(default="", description="Main job description text")
    responsibilities: Optional[str] = None
    requirements: Optional[str] = None
    preferred_qualifications: Optional[str] = None
    benefits: Optional[str] = None
    skills: List[str] = Field(default_factory=list, description="Associated skills from job_skills joined with skills")
    skill_requirements: List[JobSkillRequirement] = Field(default_factory=list, description="Structured skill requirements with metadata")
    custom_skills: List[str] = Field(default_factory=list, description="Direct custom free-text skill tags")
    locations: List[str] = Field(default_factory=list, description="Formatted location strings from job_locations")
    company_industry: Optional[str] = Field(default=None, description="Contextual industry of employer company")
    screening_questions: List[str] = Field(default_factory=list, description="Contextual screening questions")
    updated_at: datetime = Field(..., description="Job updated_at for optimistic concurrency check")

    @model_validator(mode="after")
    def sync_experience_and_skill_aliases(self) -> JobCanonicalAggregate:
        """
        Synchronize experience_min/max with experience_min/max_years,
        and ensure bidirectional consistency between skill_requirements and skills.
        """
        if self.experience_min is not None and self.experience_min_years is None:
            self.experience_min_years = self.experience_min
        elif self.experience_min_years is not None and self.experience_min is None:
            self.experience_min = self.experience_min_years

        if self.experience_max is not None and self.experience_max_years is None:
            self.experience_max_years = self.experience_max
        elif self.experience_max_years is not None and self.experience_max is None:
            self.experience_max = self.experience_max_years

        if self.skill_requirements and not self.skills:
            self.skills = [sr.name for sr in self.skill_requirements if sr.name]
        elif self.skills and not self.skill_requirements:
            self.skill_requirements = [JobSkillRequirement(name=s, is_required=True) for s in self.skills if s]

        return self


# ============================================================================
# Job Enrichment & Embedding Result
# ============================================================================

class JobEnrichmentResult(BaseModel):
    """Enriched job data package ready for atomic DB persistence."""
    job_id: str
    ai_profile: JobAIProfileV1
    embedding: List[float] = Field(..., description="768-dimensional float embedding vector")
    embedding_model: str
    embedding_version: int = Field(default=1)
    stored_updated_at: datetime

    @field_validator("embedding")
    @classmethod
    def validate_embedding_dimensions(cls, v: List[float]) -> List[float]:
        if len(v) != 768:
            raise ValueError(f"Job embedding vector must be exactly 768 dimensions, got {len(v)}")
        return v
