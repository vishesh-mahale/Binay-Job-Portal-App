"""Typed Pydantic models for resume extraction v2 schema."""

from __future__ import annotations

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class ExtractedSkill(BaseModel):
    name: str
    proficiency_level: Optional[int] = None
    years_of_experience: Optional[float] = None


class ExtractedExperience(BaseModel):
    company_name: str
    job_title: str
    employment_type: Optional[str] = None
    location: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    is_current: Optional[bool] = None
    description: Optional[str] = None
    responsibilities: List[str] = Field(default_factory=list)
    achievements: List[str] = Field(default_factory=list)
    skills: List[str] = Field(default_factory=list)


class ExtractedEducation(BaseModel):
    institution_name: str
    degree: str
    field_of_study: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    is_current: Optional[bool] = None
    grade: Optional[str] = None
    description: Optional[str] = None


class ExtractedCertification(BaseModel):
    name: str
    issuer: Optional[str] = None
    credential_id: Optional[str] = None
    credential_url: Optional[str] = None
    issued_at: Optional[str] = None
    expires_at: Optional[str] = None
    does_not_expire: Optional[bool] = None


class ExtractedProject(BaseModel):
    title: str
    description: Optional[str] = None
    project_url: Optional[str] = None
    repository_url: Optional[str] = None
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    technologies: List[str] = Field(default_factory=list)


class ExtractedLanguage(BaseModel):
    language_name: str
    proficiency: Optional[str] = None


class ExtractedAward(BaseModel):
    title: str
    issuer: Optional[str] = None
    awarded_at: Optional[str] = None
    description: Optional[str] = None


class ExtractedLink(BaseModel):
    link_type: str = "other"
    label: Optional[str] = None
    url: str


class ResumeExtractionOutput(BaseModel):
    """Full structured output from LLM resume extraction."""
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    postal_code: Optional[str] = None
    date_of_birth: Optional[str] = None
    gender: Optional[str] = None
    summary: Optional[str] = None
    skills: List[ExtractedSkill] = Field(default_factory=list)
    experience_years: Optional[float] = None
    current_title: Optional[str] = None
    educations: List[ExtractedEducation] = Field(default_factory=list)
    experiences: List[ExtractedExperience] = Field(default_factory=list)
    certifications: List[ExtractedCertification] = Field(default_factory=list)
    projects: List[ExtractedProject] = Field(default_factory=list)
    languages: List[ExtractedLanguage] = Field(default_factory=list)
    awards: List[ExtractedAward] = Field(default_factory=list)
    links: List[ExtractedLink] = Field(default_factory=list)


def validate_extraction_output(raw: Dict[str, Any]) -> ResumeExtractionOutput:
    """Validate and coerce raw LLM output into typed model.

    Per-item filtering: invalid items are dropped instead of failing the whole output.
    Returns validated model with only well-formed items.
    """
    import logging
    logger = logging.getLogger(__name__)

    # Filter invalid items from arrays before full-model validation
    def _filter_items(items: list, required_fields: list[str], label: str) -> list:
        filtered = []
        for i, item in enumerate(items):
            if not isinstance(item, dict):
                continue
            missing = [f for f in required_fields if not item.get(f)]
            if missing:
                logger.warning("Dropping %s item %d: missing %s", label, i, missing)
                continue
            filtered.append(item)
        return filtered

    cleaned = dict(raw)
    if not cleaned.get("phone"):
        cleaned["phone"] = raw.get("phone_number") or raw.get("mobile") or raw.get("contact_number") or None
    cleaned["skills"] = _filter_items(raw.get("skills", []), ["name"], "skill")
    cleaned["experiences"] = _filter_items(raw.get("experiences", []), ["company_name", "job_title"], "experience")
    cleaned["educations"] = _filter_items(raw.get("educations", []), ["institution_name", "degree"], "education")
    cleaned["certifications"] = _filter_items(raw.get("certifications", []), ["name"], "certification")
    cleaned["projects"] = _filter_items(raw.get("projects", []), ["title"], "project")
    cleaned["languages"] = _filter_items(raw.get("languages", []), ["language_name"], "language")
    cleaned["awards"] = _filter_items(raw.get("awards", []), ["title"], "award")
    cleaned["links"] = _filter_items(raw.get("links", []), ["url"], "link")

    return ResumeExtractionOutput.model_validate(cleaned)


def extraction_is_empty(output: ResumeExtractionOutput) -> bool:
    """Check if extraction produced no meaningful data."""
    has_name = bool(output.name and output.name.strip())
    has_skills = len(output.skills) > 0
    has_experiences = len(output.experiences) > 0
    has_educations = len(output.educations) > 0
    return not (has_name or has_skills or has_experiences or has_educations)
