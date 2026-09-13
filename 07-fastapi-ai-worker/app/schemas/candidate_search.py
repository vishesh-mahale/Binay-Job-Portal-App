"""Schemas for candidate search projection (PD-002 Active Resume Search)."""

from __future__ import annotations

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field


class FactSourcesSchema(BaseModel):
    """Tracks origin of each fact in the candidate search projection."""
    model_config = ConfigDict(extra="allow")

    skills: Dict[str, str] = Field(
        default_factory=dict,
        description="Mapping of skill name to source label ('candidate_manual', 'resume_ai', etc.)"
    )
    titles: Dict[str, str] = Field(
        default_factory=dict,
        description="Mapping of title to source label"
    )
    experiences: Dict[str, str] = Field(
        default_factory=dict,
        description="Mapping of experience identifier/company to source label"
    )
    education: Dict[str, str] = Field(
        default_factory=dict,
        description="Mapping of education degree/field to source label"
    )


class CandidateCanonicalAggregate(BaseModel):
    """Complete candidate canonical profile aggregate loaded from database."""
    model_config = ConfigDict(extra="ignore")

    candidate_id: str
    user_id: Optional[str] = None
    profile_revision: int = 1
    professional_title: Optional[str] = None
    summary: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    current_location: Optional[str] = None
    preferred_work_mode: Optional[str] = None
    willing_to_relocate: bool = False
    willing_to_travel: bool = False
    notice_period_days: Optional[int] = None
    expected_salary_min: Optional[float] = None
    expected_salary_max: Optional[float] = None
    salary_currency: str = "INR"
    is_open_to_work: bool = True

    # Active child facts
    skills: List[Dict[str, Any]] = Field(default_factory=list)
    experiences: List[Dict[str, Any]] = Field(default_factory=list)
    educations: List[Dict[str, Any]] = Field(default_factory=list)
    certifications: List[Dict[str, Any]] = Field(default_factory=list)
    projects: List[Dict[str, Any]] = Field(default_factory=list)
    languages: List[Dict[str, Any]] = Field(default_factory=list)

    # Active resume state (if present)
    active_resume_document_id: Optional[str] = None
    active_resume_parsing_result_id: Optional[str] = None
    active_resume_parsed_data: Optional[Dict[str, Any]] = None


class CandidateMergedSearchData(BaseModel):
    """Merged and deduplicated candidate search data prepared for projection."""
    candidate_id: str
    source_profile_revision: int
    projection_revision: int
    active_resume_document_id: Optional[str] = None
    active_resume_parsing_result_id: Optional[str] = None

    professional_title: Optional[str] = None
    normalized_titles: List[str] = Field(default_factory=list)
    skill_ids: List[str] = Field(default_factory=list)
    skill_names: List[str] = Field(default_factory=list)
    locations: List[str] = Field(default_factory=list)
    fact_sources: Dict[str, Any] = Field(default_factory=dict)
    total_experience_years: Optional[float] = None
    highest_education_level: Optional[str] = None
    semantic_text: str = ""
    searchable_text: str = ""


class CandidateSearchProfileUpsert(BaseModel):
    """Payload model for candidate_search_profiles table UPSERT."""
    candidate_id: str
    source_profile_revision: int
    projection_revision: int
    active_resume_document_id: Optional[str] = None
    active_resume_parsing_result_id: Optional[str] = None

    professional_title: Optional[str] = None
    normalized_titles: List[str] = Field(default_factory=list)
    skill_ids: List[str] = Field(default_factory=list)
    skill_names: List[str] = Field(default_factory=list)
    locations: List[str] = Field(default_factory=list)
    fact_sources: Dict[str, Any] = Field(default_factory=dict)
    total_experience_years: Optional[float] = None
    highest_education_level: Optional[str] = None
    searchable_text: str
    embedding: List[float] = Field(..., min_length=768, max_length=768)
    embedding_model: str
    embedding_version: int = 1
