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
