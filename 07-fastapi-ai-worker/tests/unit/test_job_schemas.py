"""Unit tests for Job AI Enrichment schemas and JSONB contract v1 validation."""

from datetime import datetime, timezone
import pytest
from pydantic import ValidationError

from app.schemas.job_enrichment import (
    JobAIProfileV1,
    JobCanonicalAggregate,
    JobEnrichmentResult,
    JobExtractedProfile,
    JobInferredProfile,
    JobProfileMetadata,
)


def test_job_ai_profile_v1_valid():
    """Valid Job AI profile passes strict contract validation."""
    profile = JobAIProfileV1(
        schema_version=1,
        extracted=JobExtractedProfile(
            must_have_skills=["Java", "Spring Boot", "Kafka"],
            nice_to_have_skills=["Docker", "AWS"],
            minimum_experience_years=5.0,
            preferred_education=["B.Tech Computer Science"],
            certifications=["AWS Certified Solutions Architect"],
            languages=["English"],
        ),
        inferred=JobInferredProfile(
            role_family="Backend Engineering",
            seniority="Senior",
            technical_domains=["Distributed Systems", "FinTech"],
            industry_domains=["Banking"],
            soft_skills=["Leadership", "Mentoring"],
            primary_responsibilities=["Architect payment processing pipeline"],
            likely_career_level="IC4 / Senior Engineer",
            keywords=["kafka", "microservices", "spring-boot"],
            confidence_score=0.95,
        ),
        metadata=JobProfileMetadata(
            model="gemini-2.0-flash",
            model_version="v1",
            prompt_version="v1",
            generated_at=datetime.now(timezone.utc).isoformat(),
            processing_time_ms=120,
        ),
    )

    assert profile.schema_version == 1
    assert "Java" in profile.extracted.must_have_skills
    assert profile.inferred.role_family == "Backend Engineering"
    assert profile.metadata.model == "gemini-2.0-flash"


def test_job_ai_profile_rejects_extra_fields():
    """Contract v1 forbids undeclared fields strictly (extra='forbid')."""
    valid_extracted = {
        "must_have_skills": ["Python"],
        "nice_to_have_skills": [],
        "minimum_experience_years": 3.0,
        "preferred_education": [],
        "certifications": [],
        "languages": [],
        "unexpected_field": "illegal_value",  # Should cause ValidationError
    }

    with pytest.raises(ValidationError):
        JobExtractedProfile(**valid_extracted)


def test_job_ai_profile_schema_version_strict_literal():
    """Verify schema_version strictly enforces Literal[1] and rejects any other integer."""
    with pytest.raises(ValidationError):
        JobAIProfileV1(
            schema_version=2,  # Must be strictly 1
            extracted=JobExtractedProfile(must_have_skills=["Python"]),
            inferred=JobInferredProfile(role_family="Data Engineering"),
            metadata=JobProfileMetadata(
                model="test-model",
                model_version="v1",
                prompt_version="v1",
                generated_at=datetime.now(timezone.utc).isoformat(),
                processing_time_ms=10,
            ),
        )


def test_job_extracted_profile_rejects_negative_experience():
    """Verify minimum_experience_years rejects negative numbers."""
    with pytest.raises(ValidationError):
        JobExtractedProfile(minimum_experience_years=-2.5)


def test_job_enrichment_result_vector_dimension_check():
    """JobEnrichmentResult strictly validates exact 768-dimensional float vectors."""
    profile = JobAIProfileV1(
        schema_version=1,
        extracted=JobExtractedProfile(must_have_skills=["Go"]),
        inferred=JobInferredProfile(role_family="Cloud Engineering"),
        metadata=JobProfileMetadata(
            model="mock-llm",
            model_version="v1",
            prompt_version="v1",
            generated_at=datetime.now(timezone.utc).isoformat(),
            processing_time_ms=50,
        ),
    )

    # Valid 768-dim vector
    valid_vector = [0.01] * 768
    res = JobEnrichmentResult(
        job_id="j1111111-1111-1111-1111-111111111111",
        ai_profile=profile,
        embedding=valid_vector,
        embedding_model="text-embedding-004",
        embedding_version=1,
        stored_updated_at=datetime.now(timezone.utc),
    )
    assert len(res.embedding) == 768

    # Invalid vector length (e.g. 512 dimensions)
    with pytest.raises(ValidationError, match="768 dimensions"):
        JobEnrichmentResult(
            job_id="j1111111-1111-1111-1111-111111111111",
            ai_profile=profile,
            embedding=[0.01] * 512,
            embedding_model="text-embedding-004",
            embedding_version=1,
            stored_updated_at=datetime.now(timezone.utc),
        )


def test_job_canonical_aggregate_new_fields_and_semantic_text():
    """Verify newly added job fields (experience_min/max, experience_level, work_shift, education_type/min, max_notice_period_days, custom_skills, location_remote, description, preferred_qualifications) are loaded and rendered in semantic text."""
    job = JobCanonicalAggregate(
        job_id="j2222222-2222-2222-2222-222222222222",
        title="Senior AI Engineer",
        category="AI / Machine Learning",
        employment_type="full_time",
        work_mode="hybrid",
        location_remote=True,
        experience_level="senior",
        experience_min=3,
        experience_max=7,
        work_shift="night_shift",
        education_type="bachelor",
        min_education_level="B.Tech Computer Science",
        max_notice_period_days=30,
        custom_skills=["Qdrant", "Mojo", "LangGraph"],
        skills=["Python", "PyTorch"],
        locations=["Mumbai, Maharashtra, India"],
        description="Build state-of-the-art LLM pipelines and RAG systems.",
        preferred_qualifications="AWS Certified Machine Learning Specialty.",
        updated_at=datetime.now(timezone.utc),
    )

    assert job.experience_min == 3
    assert job.experience_max == 7
    assert job.experience_level == "senior"
    assert job.location_remote is True
    assert job.work_shift == "night_shift"
    assert job.education_type == "bachelor"
    assert job.min_education_level == "B.Tech Computer Science"
    assert job.max_notice_period_days == 30
    assert "Qdrant" in job.custom_skills
    assert job.description == "Build state-of-the-art LLM pipelines and RAG systems."
    assert job.preferred_qualifications == "AWS Certified Machine Learning Specialty."

    from app.services.semantic_builders import JobSemanticTextBuilder

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
        experience_min=job.experience_min,
        experience_max=job.experience_max,
        skills=job.skills,
        custom_skills=job.custom_skills,
        description=job.description,
        preferred_qualifications=job.preferred_qualifications,
    )

    assert "Night Shift" in semantic_text
    assert "Remote: Yes" in semantic_text
    assert "Senior" in semantic_text
    assert "Bachelor" in semantic_text
    assert "B.Tech Computer Science" in semantic_text
    assert "30 days" in semantic_text
    assert "3-7 years" in semantic_text
    assert "Qdrant" in semantic_text
    assert "Mojo" in semantic_text
    assert "Build state-of-the-art LLM pipelines" in semantic_text
    assert "AWS Certified Machine Learning Specialty" in semantic_text

