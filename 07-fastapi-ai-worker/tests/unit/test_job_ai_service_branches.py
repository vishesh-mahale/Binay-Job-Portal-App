"""Unit tests for JobAIService branches."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from datetime import datetime, timezone

from app.services.job_ai_service import JobAIService
from app.schemas.job_enrichment import (
    JobCanonicalAggregate,
    JobAIProfileV1,
    JobExtractedProfile,
    JobInferredProfile,
    JobProfileMetadata,
    JobEnrichmentResult,
)


@pytest.mark.asyncio
async def test_generate_job_ai_profile_fallback_to_job_skills():
    llm = AsyncMock()
    llm.model_name = "gemini-2.0-flash"
    llm.model_version = "v1"
    llm.generate_structured = AsyncMock(return_value={
        "extracted": {
            "must_have_skills": [],
            "nice_to_have_skills": [],
            "minimum_experience_years": 5,
            "preferred_education": [],
            "certifications": [],
            "languages": [],
        },
        "inferred": {
            "role_family": "Backend",
            "seniority": "Senior",
            "technical_domains": ["Python"],
            "industry_domains": ["SaaS"],
            "soft_skills": ["Communication"],
            "primary_responsibilities": ["Build APIs"],
            "likely_career_level": "Senior",
            "keywords": ["python", "api"],
            "confidence_score": 0.9,
        },
    })

    job = JobCanonicalAggregate(
        job_id="j1",
        title="Backend Engineer",
        category="Engineering",
        employment_type="full_time",
        work_mode="hybrid",
        experience_level="senior",
        experience_min_years=5,
        experience_max_years=10,
        salary_min=1000000.0,
        salary_max=2000000.0,
        salary_currency="INR",
        description="Build APIs",
        responsibilities="Design systems",
        requirements="Python, FastAPI",
        preferred_qualifications=None,
        benefits=None,
        skills=["Python", "FastAPI"],
        locations=["Bengaluru"],
        updated_at=datetime.now(timezone.utc),
    )

    service = JobAIService(llm_provider=llm, embedding_provider=None, settings=None)
    profile = await service.generate_job_ai_profile(job)
    assert profile.extracted.must_have_skills == ["Python", "FastAPI"]
    assert profile.inferred.role_family == "Backend"


@pytest.mark.asyncio
async def test_generate_job_embedding_with_list_vector():
    llm = AsyncMock()
    embedding = AsyncMock()
    embedding.embedding = [0.1] * 768
    embedding_provider = AsyncMock()
    embedding_provider.embed = AsyncMock(return_value=embedding)
    embedding_provider.model_name = "text-embedding-004"

    job = JobCanonicalAggregate(
        job_id="j1",
        title="Backend Engineer",
        category="Engineering",
        employment_type="full_time",
        work_mode="hybrid",
        experience_level="senior",
        experience_min_years=5,
        experience_max_years=10,
        salary_min=1000000.0,
        salary_max=2000000.0,
        salary_currency="INR",
        description="Build APIs",
        responsibilities="Design systems",
        requirements="Python, FastAPI",
        preferred_qualifications=None,
        benefits=None,
        skills=["Python"],
        locations=["Bengaluru"],
        updated_at=datetime.now(timezone.utc),
    )

    profile = JobAIProfileV1(
        schema_version=1,
        extracted=JobExtractedProfile(must_have_skills=["Python"]),
        inferred=JobInferredProfile(role_family="Backend"),
        metadata=JobProfileMetadata(
            model="gemini-2.0-flash",
            model_version="v1",
            prompt_version="v1",
            generated_at=datetime.now(timezone.utc).isoformat(),
            processing_time_ms=120,
        ),
    )

    service = JobAIService(llm_provider=llm, embedding_provider=embedding_provider, settings=None)
    vector = await service.generate_job_embedding(job, profile)
    assert len(vector) == 768


@pytest.mark.asyncio
async def test_enrich_job_returns_result():
    llm = AsyncMock()
    embedding = AsyncMock()
    embedding.embedding = [0.1] * 768
    embedding_provider = AsyncMock()
    embedding_provider.embed = AsyncMock(return_value=embedding)
    embedding_provider.model_name = "text-embedding-004"

    job = JobCanonicalAggregate(
        job_id="j1",
        title="Backend Engineer",
        category="Engineering",
        employment_type="full_time",
        work_mode="hybrid",
        experience_level="senior",
        experience_min_years=5,
        experience_max_years=10,
        salary_min=1000000.0,
        salary_max=2000000.0,
        salary_currency="INR",
        description="Build APIs",
        responsibilities="Design systems",
        requirements="Python, FastAPI",
        preferred_qualifications=None,
        benefits=None,
        skills=["Python"],
        locations=["Bengaluru"],
        updated_at=datetime.now(timezone.utc),
    )

    with patch.object(JobAIService, "generate_job_ai_profile", new_callable=AsyncMock) as mock_gen_profile, \
         patch.object(JobAIService, "generate_job_embedding", new_callable=AsyncMock) as mock_gen_embed:
        mock_gen_profile.return_value = JobAIProfileV1(
            schema_version=1,
            extracted=JobExtractedProfile(must_have_skills=["Python"]),
            inferred=JobInferredProfile(role_family="Backend"),
            metadata=JobProfileMetadata(
                model="gemini-2.0-flash",
                model_version="v1",
                prompt_version="v1",
                generated_at=datetime.now(timezone.utc).isoformat(),
                processing_time_ms=120,
            ),
        )
        mock_gen_embed.return_value = [0.1] * 768

        service = JobAIService(llm_provider=llm, embedding_provider=embedding_provider, settings=None)
        result = await service.enrich_job(job)
        assert result.job_id == "j1"
        assert len(result.embedding) == 768
