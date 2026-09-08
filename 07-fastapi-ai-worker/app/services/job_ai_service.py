"""
Job AI Enrichment & Embedding Domain Service (JD-001).
Coordinates LLM structured extraction, symmetric semantic text assembly, and 768-dim vector embedding.
"""

from __future__ import annotations

import sys
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.core.config import Settings, get_settings
from app.core.exceptions import AIProviderError, AIResponseValidationError
from app.core.logging import get_logger
from app.providers.base import EmbeddingProvider, LLMProvider
from app.schemas.job_enrichment import (
    JobAIProfileV1,
    JobCanonicalAggregate,
    JobEnrichmentResult,
    JobExtractedProfile,
    JobInferredProfile,
    JobProfileMetadata,
)
from app.services.semantic_builders import JobSemanticTextBuilder

logger = get_logger(__name__)

JOB_AI_PROFILE_SCHEMA = {
    "type": "object",
    "required": ["extracted", "inferred"],
    "properties": {
        "extracted": {
            "type": "object",
            "properties": {
                "must_have_skills": {"type": "array", "items": {"type": "string"}},
                "nice_to_have_skills": {"type": "array", "items": {"type": "string"}},
                "minimum_experience_years": {"type": ["number", "null"]},
                "preferred_education": {"type": "array", "items": {"type": "string"}},
                "certifications": {"type": "array", "items": {"type": "string"}},
                "languages": {"type": "array", "items": {"type": "string"}},
            },
            "additionalProperties": False,
        },
        "inferred": {
            "type": "object",
            "properties": {
                "role_family": {"type": "string"},
                "seniority": {"type": "string"},
                "technical_domains": {"type": "array", "items": {"type": "string"}},
                "industry_domains": {"type": "array", "items": {"type": "string"}},
                "soft_skills": {"type": "array", "items": {"type": "string"}},
                "primary_responsibilities": {"type": "array", "items": {"type": "string"}},
                "likely_career_level": {"type": "string"},
                "keywords": {"type": "array", "items": {"type": "string"}},
                "confidence_score": {"type": "number"},
            },
            "additionalProperties": False,
        },
    },
    "additionalProperties": False,
}


def _normalize_skill_list(skills: List[str]) -> List[str]:
    """Trim whitespace and deduplicate skill strings case-insensitively while preserving original casing and order."""
    seen = set()
    result: List[str] = []
    for s in skills:
        cleaned = str(s).strip()
        if cleaned and cleaned.lower() not in seen:
            seen.add(cleaned.lower())
            result.append(cleaned)
    return result


class JobAIService:
    """Service for enriching job postings with AI candidate profile and semantic embeddings."""

    def __init__(
        self,
        llm_provider: LLMProvider,
        embedding_provider: EmbeddingProvider,
        settings: Optional[Settings] = None,
    ) -> None:
        self.llm = llm_provider
        self.embedding_provider = embedding_provider
        self.settings = settings or get_settings()

    async def generate_job_ai_profile(self, job: JobCanonicalAggregate) -> JobAIProfileV1:
        """
        Generate structured Job AI Profile JSONB following contract v1.
        Enforces structured employer precedence: structured DB value > LLM extracted > AI inference.
        """
        system_prompt = (
            "You are an expert technical recruiter.\n\n"
            "Your task is to enrich an existing job posting.\n"
            "The database already stores the original job description and structured employer fields.\n"
            "Do NOT duplicate the original job.\n"
            "Return ONLY additional AI-enriched information.\n\n"
            "Rules:\n"
            "1. Return valid JSON only.\n"
            "2. Follow the schema exactly.\n"
            "3. Structured employer fields (Title, Category, Experience Level, Min/Max Experience, Education, Skills) are authoritative explicit facts.\n"
            "4. extracted = explicit facts from structured employer fields and job prose.\n"
            "5. inferred = high-confidence AI interpretation only.\n"
            "6. Never invent mandatory technologies.\n"
            "7. Never invent certifications.\n"
            "8. Never invent years of experience.\n"
            "9. If uncertain use null or [].\n"
            "10. Do not add extra fields."
        )

        skills_summary: List[str] = []
        if job.skill_requirements:
            for sr in job.skill_requirements:
                req_tag = "Required" if sr.is_required else "Optional"
                years_tag = f", {sr.min_years}y" if sr.min_years is not None else ""
                skills_summary.append(f"{sr.name} ({req_tag}{years_tag})")
        elif job.skills:
            skills_summary = list(job.skills)

        exp_min_val = job.experience_min if job.experience_min is not None else (job.experience_min_years if job.experience_min_years is not None else 0)
        exp_max_val = job.experience_max if job.experience_max is not None else (job.experience_max_years if job.experience_max_years is not None else "+")

        user_input_parts = [
            f"Title: {job.title}",
            f"Category: {job.category or 'General'}",
            f"Employment Type: {job.employment_type} | Work Mode: {job.work_mode} | Work Shift: {job.work_shift or 'Not specified'}",
            f"Experience Level: {job.experience_level or 'Not specified'} ({exp_min_val}-{exp_max_val} years)",
            f"Education Required: {job.education_type or 'Any'} ({job.min_education_level or 'Not specified'})",
            f"Max Notice Period: {job.max_notice_period_days if job.max_notice_period_days is not None else 'Not specified'} days",
            f"Skills: {', '.join(skills_summary) if skills_summary else 'None'}",
            f"Custom Skills: {', '.join(job.custom_skills) if job.custom_skills else 'None'}",
            f"Locations: {', '.join(job.locations) if job.locations else 'Not specified'}",
            "Description:",
            job.description,
        ]

        if job.company_industry:
            user_input_parts.append(f"Company Industry Context: {job.company_industry}")
        if job.screening_questions:
            user_input_parts.append(f"Screening Questions Context: {', '.join(job.screening_questions)}")

        if job.requirements:
            user_input_parts.extend(["Requirements:", job.requirements])
        if job.responsibilities:
            user_input_parts.extend(["Responsibilities:", job.responsibilities])
        if job.preferred_qualifications:
            user_input_parts.extend(["Preferred Qualifications:", job.preferred_qualifications])
        if job.benefits:
            user_input_parts.extend(["Benefits:", job.benefits])

        user_input = "\n".join(user_input_parts)

        start_time = time.perf_counter()
        try:
            raw_result = await self.llm.generate_structured(
                prompt=system_prompt,
                user_input=user_input,
                response_schema=JOB_AI_PROFILE_SCHEMA,
            )
        except Exception as exc:
            provider_name = getattr(self.llm, "provider_name", "llm")
            logger.error("LLM structured output call failed for job", job_id=job.job_id, error=str(exc))
            raise AIProviderError(provider=provider_name, reason=f"Job AI profile extraction failed: {exc}")

        latency_ms = int((time.perf_counter() - start_time) * 1000)

        # Parse extracted and inferred sections
        extracted_data = raw_result.get("extracted") or {}
        inferred_data = raw_result.get("inferred") or {}

        # ----------------------------------------------------------------------
        # P0 Fix 1: Structured employer experience authoritative precedence
        # ----------------------------------------------------------------------
        if job.experience_min is not None:
            min_exp_years: Optional[float] = float(job.experience_min)
        elif job.experience_min_years is not None:
            min_exp_years = float(job.experience_min_years)
        else:
            raw_exp = extracted_data.get("minimum_experience_years")
            min_exp_years = float(raw_exp) if raw_exp is not None else None

        # ----------------------------------------------------------------------
        # P0 Fix 1: Structured employer education authoritative precedence
        # ----------------------------------------------------------------------
        UNSPECIFIED_EDUCATION = {"any", "none", "unspecified", "not specified", ""}
        has_structured_edu = (
            job.min_education_level is not None
            and job.min_education_level.strip().lower() not in UNSPECIFIED_EDUCATION
        )
        if has_structured_edu:
            edu_level = job.min_education_level.strip()
            if job.education_type and job.education_type.strip().lower() not in UNSPECIFIED_EDUCATION:
                preferred_education = [f"{edu_level} ({job.education_type.strip()})"]
            else:
                preferred_education = [edu_level]
        else:
            raw_edu = extracted_data.get("preferred_education") or []
            preferred_education = [
                e.strip() for e in raw_edu
                if e and e.strip() and e.strip().lower() not in UNSPECIFIED_EDUCATION
            ]

        # ----------------------------------------------------------------------
        # P0 Fix 2 & 5: Preserve skill metadata and normalize/deduplicate
        # ----------------------------------------------------------------------
        structured_required: List[str] = []
        structured_optional: List[str] = []

        if job.skill_requirements:
            for sr in job.skill_requirements:
                if sr.name and sr.name.strip():
                    if sr.is_required:
                        structured_required.append(sr.name.strip())
                    else:
                        structured_optional.append(sr.name.strip())
        elif job.skills:
            structured_required.extend([s.strip() for s in job.skills if s and s.strip()])

        if job.custom_skills:
            for cs in job.custom_skills:
                if cs and cs.strip():
                    structured_required.append(cs.strip())

        llm_must_have = [s.strip() for s in (extracted_data.get("must_have_skills") or []) if s and s.strip()]
        llm_nice_to_have = [s.strip() for s in (extracted_data.get("nice_to_have_skills") or []) if s and s.strip()]

        # Authoritative required skills: DB required skills ALWAYS win and can never be moved to optional
        must_have_combined = list(structured_required) + llm_must_have
        must_have_skills = _normalize_skill_list(must_have_combined)

        must_have_lookup = {s.lower() for s in must_have_skills}

        # Non-required skills start with structured optional + LLM nice_to_have (excluding anything in must_have)
        nice_to_have_combined = [
            s for s in (structured_optional + llm_nice_to_have)
            if s.lower() not in must_have_lookup
        ]
        nice_to_have_skills = _normalize_skill_list(nice_to_have_combined)

        certifications = _normalize_skill_list(extracted_data.get("certifications") or [])
        languages = _normalize_skill_list(extracted_data.get("languages") or [])

        extracted = JobExtractedProfile(
            must_have_skills=must_have_skills,
            nice_to_have_skills=nice_to_have_skills,
            minimum_experience_years=min_exp_years,
            preferred_education=preferred_education,
            certifications=certifications,
            languages=languages,
        )

        # ----------------------------------------------------------------------
        # P0 Fix 3: Remove incorrect hardcoded defaults (role_family, seniority)
        # ----------------------------------------------------------------------
        role_family = (inferred_data.get("role_family") or "").strip()
        if not role_family and job.category:
            role_family = job.category.strip()

        seniority = (inferred_data.get("seniority") or "").strip()
        if not seniority and job.experience_level:
            seniority = job.experience_level.strip()

        likely_career_level = (inferred_data.get("likely_career_level") or "").strip()
        if not likely_career_level:
            likely_career_level = seniority or (job.experience_level.strip() if job.experience_level else "")

        # P0 Fix 1: Primary responsibilities fallback only when LLM returns none and DB text is non-empty
        llm_resp = [r.strip() for r in (inferred_data.get("primary_responsibilities") or []) if r and r.strip()]
        if llm_resp:
            primary_responsibilities = llm_resp
        elif job.responsibilities and job.responsibilities.strip():
            primary_responsibilities = [job.responsibilities.strip()]
        else:
            primary_responsibilities = []

        # P0 Fix 4: Preserve valid zero values and explicit confidence
        raw_conf = inferred_data.get("confidence_score")
        if raw_conf is not None:
            confidence_score = float(raw_conf)
        else:
            confidence_score = 0.9

        inferred = JobInferredProfile(
            role_family=role_family,
            seniority=seniority,
            technical_domains=inferred_data.get("technical_domains") or [],
            industry_domains=inferred_data.get("industry_domains") or [],
            soft_skills=inferred_data.get("soft_skills") or [],
            primary_responsibilities=primary_responsibilities,
            likely_career_level=likely_career_level,
            keywords=inferred_data.get("keywords") or [],
            confidence_score=confidence_score,
        )

        metadata = JobProfileMetadata(
            model=getattr(self.llm, "model_name", "gemini-2.0-flash"),
            model_version=getattr(self.llm, "model_version", "v1"),
            prompt_version="v1",
            generated_at=datetime.now(timezone.utc).isoformat(),
            processing_time_ms=latency_ms,
        )

        return JobAIProfileV1(
            schema_version=1,
            extracted=extracted,
            inferred=inferred,
            metadata=metadata,
        )

    async def generate_job_embedding(
        self,
        job: JobCanonicalAggregate,
        ai_profile: JobAIProfileV1,
    ) -> List[float]:
        """
        Assemble symmetric job semantic text and generate 768-dim vector embedding.
        """
        all_skills = list(job.skills)
        for s in ai_profile.extracted.must_have_skills + ai_profile.extracted.nice_to_have_skills:
            if s and s not in all_skills:
                all_skills.append(s)

        semantic_text = JobSemanticTextBuilder.build(
            title=job.title,
            category=job.category,
            employment_type=job.employment_type,
            work_mode=job.work_mode,
            work_shift=job.work_shift,
            location_remote=job.location_remote,
            education_type=job.education_type,
            min_education_level=job.min_education_level,
            max_notice_period_days=job.max_notice_period_days,
            experience_level=job.experience_level,
            experience_min=job.experience_min or job.experience_min_years,
            experience_max=job.experience_max or job.experience_max_years,
            experience_min_years=job.experience_min_years or job.experience_min,
            experience_max_years=job.experience_max_years or job.experience_max,
            locations=job.locations,
            skills=all_skills,
            custom_skills=job.custom_skills,
            description=job.description,
            responsibilities=job.responsibilities,
            requirements=job.requirements,
            preferred_qualifications=job.preferred_qualifications,
            technical_domains=ai_profile.inferred.technical_domains,
            industry_domains=ai_profile.inferred.industry_domains,
            role_family=ai_profile.inferred.role_family,
        )

        logger.debug(
            "Generating job embedding vector",
            job_id=job.job_id,
            text_length=len(semantic_text),
        )

        try:
            embedding_resp = await self.embedding_provider.embed(semantic_text)
            vector = (
                embedding_resp.embedding
                if hasattr(embedding_resp, "embedding")
                else embedding_resp
            )
        except Exception as exc:
            provider_name = getattr(self.embedding_provider, "provider_name", "embedding")
            logger.error("Embedding provider failed for job", job_id=job.job_id, error=str(exc))
            raise AIProviderError(provider=provider_name, reason=f"Job embedding generation failed: {exc}")

        if not isinstance(vector, list) or len(vector) != 768:
            raise AIResponseValidationError(
                f"Generated job embedding dimension mismatch: expected 768, got {len(vector) if isinstance(vector, list) else type(vector)}"
            )

        return vector

    def validate_embedding_compatibility(self, model: str, version: int, vector: List[float]) -> None:
        """Enforce strict compatibility rules for pgvector cosine distance operations."""
        expected_model = getattr(self.settings, "EMBEDDING_MODEL", "text-embedding-004")
        expected_version = 1
        expected_dim = getattr(self.settings, "EMBEDDING_DIMENSION", 768)

        is_expected = model.lower() == expected_model.lower()
        is_mock_allowed = (
            model.lower().startswith("mock")
            and (getattr(self.settings, "MOCK_AI_PROVIDER", False) or "pytest" in sys.modules)
        )
        if not (is_expected or is_mock_allowed):
            raise AIResponseValidationError(
                f"Incompatible embedding model '{model}'. Expected '{expected_model}' for mathematical vector comparability."
            )

        if version != expected_version:
            raise AIResponseValidationError(
                f"Incompatible embedding version '{version}'. Expected '{expected_version}'."
            )

        if len(vector) != expected_dim:
            raise AIResponseValidationError(
                f"Incompatible embedding vector dimension {len(vector)}. Expected {expected_dim}."
            )

    async def enrich_job(self, job: JobCanonicalAggregate) -> JobEnrichmentResult:
        """
        Complete enrichment workflow:
        1. Generate structured AI Profile JSONB.
        2. Generate 768-dim vector embedding.
        3. Validate model/version/dimension compatibility.
        4. Return JobEnrichmentResult package.
        """
        ai_profile = await self.generate_job_ai_profile(job)
        embedding_vector = await self.generate_job_embedding(job, ai_profile)

        embedding_model = getattr(self.embedding_provider, "model_name", "text-embedding-004")
        embedding_version = 1

        self.validate_embedding_compatibility(embedding_model, embedding_version, embedding_vector)

        return JobEnrichmentResult(
            job_id=job.job_id,
            ai_profile=ai_profile,
            embedding=embedding_vector,
            embedding_model=embedding_model,
            embedding_version=embedding_version,
            stored_updated_at=job.updated_at,
        )

