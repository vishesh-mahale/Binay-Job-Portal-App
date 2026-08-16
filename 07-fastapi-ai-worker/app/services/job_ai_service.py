"""
Job AI Enrichment & Embedding Domain Service (JD-001).
Coordinates LLM structured extraction, symmetric semantic text assembly, and 768-dim vector embedding.
"""

from __future__ import annotations

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
        Calls LLM provider with strict technical recruiter prompt and JSON schema.
        """
        system_prompt = (
            "You are an expert technical recruiter.\n\n"
            "Your task is to enrich an existing job posting.\n"
            "The database already stores the original job description.\n"
            "Do NOT duplicate the original job.\n"
            "Return ONLY additional AI-enriched information.\n\n"
            "Rules:\n"
            "1. Return valid JSON only.\n"
            "2. Follow the schema exactly.\n"
            "3. extracted = explicit facts only.\n"
            "4. inferred = high-confidence inference only.\n"
            "5. Never invent mandatory technologies.\n"
            "6. Never invent certifications.\n"
            "7. Never invent years of experience.\n"
            "8. If uncertain use null or [].\n"
            "9. Do not add extra fields."
        )

        user_input_parts = [
            f"Title: {job.title}",
            f"Category: {job.category or 'General'}",
            f"Employment Type: {job.employment_type} | Work Mode: {job.work_mode}",
            f"Experience Level: {job.experience_level or 'Not specified'}",
            f"Skills: {', '.join(job.skills) if job.skills else 'None'}",
            f"Locations: {', '.join(job.locations) if job.locations else 'Not specified'}",
            "Description:",
            job.description,
        ]

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

        # Fallback / sanitize if skills were already present in job_skills but missed by LLM
        if not extracted_data.get("must_have_skills") and job.skills:
            extracted_data["must_have_skills"] = list(job.skills)

        extracted = JobExtractedProfile(
            must_have_skills=extracted_data.get("must_have_skills") or [],
            nice_to_have_skills=extracted_data.get("nice_to_have_skills") or [],
            minimum_experience_years=extracted_data.get("minimum_experience_years"),
            preferred_education=extracted_data.get("preferred_education") or [],
            certifications=extracted_data.get("certifications") or [],
            languages=extracted_data.get("languages") or [],
        )

        inferred = JobInferredProfile(
            role_family=inferred_data.get("role_family") or job.category or "Engineering",
            seniority=inferred_data.get("seniority") or job.experience_level or "Mid-Level",
            technical_domains=inferred_data.get("technical_domains") or [],
            industry_domains=inferred_data.get("industry_domains") or [],
            soft_skills=inferred_data.get("soft_skills") or [],
            primary_responsibilities=inferred_data.get("primary_responsibilities") or [],
            likely_career_level=inferred_data.get("likely_career_level") or "",
            keywords=inferred_data.get("keywords") or [],
            confidence_score=float(inferred_data.get("confidence_score") or 0.9),
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
            experience_min_years=job.experience_min_years,
            experience_max_years=job.experience_max_years,
            locations=job.locations,
            skills=all_skills,
            responsibilities=job.responsibilities,
            requirements=job.requirements,
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

    async def enrich_job(self, job: JobCanonicalAggregate) -> JobEnrichmentResult:
        """
        Complete enrichment workflow:
        1. Generate structured AI Profile JSONB.
        2. Generate 768-dim vector embedding.
        3. Return JobEnrichmentResult package.
        """
        ai_profile = await self.generate_job_ai_profile(job)
        embedding_vector = await self.generate_job_embedding(job, ai_profile)

        embedding_model = getattr(self.embedding_provider, "model_name", "text-embedding-004")

        return JobEnrichmentResult(
            job_id=job.job_id,
            ai_profile=ai_profile,
            embedding=embedding_vector,
            embedding_model=embedding_model,
            embedding_version=1,
            stored_updated_at=job.updated_at,
        )
