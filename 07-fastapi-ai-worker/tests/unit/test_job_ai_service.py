"""Unit tests for JobAIService AI profile generation and semantic embedding."""

from datetime import datetime, timezone
import pytest

from app.providers.mock import MockEmbeddingProvider, MockLLMProvider
from app.schemas.job_enrichment import JobCanonicalAggregate
from app.services.job_ai_service import JobAIService


@pytest.mark.asyncio
async def test_job_ai_service_enrich_job_workflow():
    """Verify complete job enrichment workflow generating AI profile and 768-dim embedding."""
    llm_provider = MockLLMProvider()
    embedding_provider = MockEmbeddingProvider()
    service = JobAIService(llm_provider, embedding_provider)

    job = JobCanonicalAggregate(
        job_id="j1111111-1111-1111-1111-111111111111",
        title="Lead Cloud Architect",
        category="Engineering > Cloud",
        employment_type="full_time",
        work_mode="remote",
        experience_level="lead",
        experience_min_years=8,
        experience_max_years=12,
        salary_min=3500000.0,
        salary_max=5000000.0,
        salary_currency="INR",
        description="Design high-availability cloud infrastructure and lead DevOps strategy.",
        responsibilities="Drive architectural reviews and cloud governance.",
        requirements="Deep AWS expertise, Terraform, Kubernetes, and CI/CD pipelines.",
        preferred_qualifications="AWS Solutions Architect Professional certification.",
        benefits="Comprehensive medical coverage, remote work allowance, stock options.",
        skills=["AWS", "Terraform", "Kubernetes", "Docker", "Python"],
        locations=["Bengaluru, Karnataka, India", "Remote"],
        updated_at=datetime.now(timezone.utc),
    )

    result = await service.enrich_job(job)

    assert result.job_id == "j1111111-1111-1111-1111-111111111111"
    assert result.ai_profile.schema_version == 1
    assert len(result.embedding) == 768
    assert result.embedding_model == embedding_provider.model_name
    assert result.embedding_version == 1
    assert result.stored_updated_at == job.updated_at

    # Check extracted skills contain canonical skills
    assert any(s in result.ai_profile.extracted.must_have_skills for s in ["AWS", "Terraform", "Kubernetes", "Python"])
    assert result.ai_profile.metadata.prompt_version == "v1"


def test_job_ai_service_validate_embedding_compatibility_pass():
    """Verify valid model, version, and 768 dimension pass compatibility checks."""
    llm = MockLLMProvider()
    emb = MockEmbeddingProvider()
    service = JobAIService(llm, emb)

    # Valid model, version, dimension
    service.validate_embedding_compatibility("text-embedding-004", 1, [0.1] * 768)
    service.validate_embedding_compatibility("mock-embedding", 1, [0.1] * 768)


def test_job_ai_service_validate_embedding_compatibility_fail():
    """Verify incompatible model or version raises AIResponseValidationError."""
    from app.core.exceptions import AIResponseValidationError

    llm = MockLLMProvider()
    emb = MockEmbeddingProvider()
    service = JobAIService(llm, emb)

    # Incompatible model name
    with pytest.raises(AIResponseValidationError, match="Incompatible embedding model"):
        service.validate_embedding_compatibility("text-embedding-001-legacy", 1, [0.1] * 768)

    # Incompatible version
    with pytest.raises(AIResponseValidationError, match="Incompatible embedding version"):
        service.validate_embedding_compatibility("text-embedding-004", 2, [0.1] * 768)


@pytest.mark.asyncio
async def test_structured_experience_overrides_conflicting_llm():
    """Verify jobs.experience_min authoritative precedence over conflicting LLM output."""
    from unittest.mock import AsyncMock
    llm = MockLLMProvider()
    llm.generate_structured = AsyncMock(return_value={
        "extracted": {
            "minimum_experience_years": 3.0,
            "must_have_skills": ["Python"],
        },
        "inferred": {"role_family": "Engineering", "seniority": "Senior"},
    })
    emb = MockEmbeddingProvider()
    service = JobAIService(llm, emb)

    # 1. Structured experience_min = 8.0 overrides LLM's 3.0
    job = JobCanonicalAggregate(
        job_id="j1111111-1111-1111-1111-111111111111",
        title="Senior Python Engineer",
        description="Senior role",
        experience_min=8,
        experience_max=12,
        updated_at=datetime.now(timezone.utc),
    )
    profile = await service.generate_job_ai_profile(job)
    assert profile.extracted.minimum_experience_years == 8.0

    # 2. When structured experience is None, fallback to LLM's 3.0
    job_no_exp = JobCanonicalAggregate(
        job_id="j1111111-1111-1111-1111-111111111112",
        title="Python Engineer",
        description="Role",
        experience_min=None,
        experience_min_years=None,
        updated_at=datetime.now(timezone.utc),
    )
    profile_no_exp = await service.generate_job_ai_profile(job_no_exp)
    assert profile_no_exp.extracted.minimum_experience_years == 3.0


@pytest.mark.asyncio
async def test_zero_experience_and_zero_confidence_preserved():
    """Verify experience_min=0 and confidence_score=0.0 are preserved and not treated as falsy."""
    from unittest.mock import AsyncMock
    llm = MockLLMProvider()
    llm.generate_structured = AsyncMock(return_value={
        "extracted": {
            "minimum_experience_years": 2.0,
            "must_have_skills": ["Python"],
        },
        "inferred": {
            "role_family": "Engineering",
            "seniority": "Junior",
            "confidence_score": 0.0,
        },
    })
    emb = MockEmbeddingProvider()
    service = JobAIService(llm, emb)

    job = JobCanonicalAggregate(
        job_id="j1111111-1111-1111-1111-111111111113",
        title="Junior Developer",
        description="Entry level",
        experience_min=0,  # Valid zero!
        updated_at=datetime.now(timezone.utc),
    )
    profile = await service.generate_job_ai_profile(job)
    assert profile.extracted.minimum_experience_years == 0.0
    assert profile.inferred.confidence_score == 0.0


@pytest.mark.asyncio
async def test_structured_education_overrides_llm_and_handles_unspecified():
    """Verify structured min_education_level is authoritative and does not manufacture on 'any'."""
    from unittest.mock import AsyncMock
    llm = MockLLMProvider()
    llm.generate_structured = AsyncMock(return_value={
        "extracted": {
            "preferred_education": ["Master's Degree"],
            "must_have_skills": ["Java"],
        },
        "inferred": {},
    })
    emb = MockEmbeddingProvider()
    service = JobAIService(llm, emb)

    # 1. Structured Bachelor + Computer Science overrides LLM Master's
    job_edu = JobCanonicalAggregate(
        job_id="j1111111-1111-1111-1111-111111111114",
        title="Software Engineer",
        description="Engineering role",
        min_education_level="Bachelor's",
        education_type="Computer Science",
        updated_at=datetime.now(timezone.utc),
    )
    profile_edu = await service.generate_job_ai_profile(job_edu)
    assert profile_edu.extracted.preferred_education == ["Bachelor's (Computer Science)"]

    # 2. Education is "any" -> should not manufacture education, uses LLM if valid or empty
    job_any_edu = JobCanonicalAggregate(
        job_id="j1111111-1111-1111-1111-111111111115",
        title="Software Engineer",
        description="Engineering role",
        min_education_level="any",
        education_type="any",
        updated_at=datetime.now(timezone.utc),
    )
    llm.generate_structured = AsyncMock(return_value={
        "extracted": {"preferred_education": ["Any", "None", ""], "must_have_skills": []},
        "inferred": {},
    })
    profile_any = await service.generate_job_ai_profile(job_any_edu)
    assert profile_any.extracted.preferred_education == []


@pytest.mark.asyncio
async def test_skill_requirements_separation_and_no_demotion():
    """Verify required skills go to must_have and cannot be demoted by LLM."""
    from unittest.mock import AsyncMock
    from app.schemas.job_enrichment import JobSkillRequirement
    llm = MockLLMProvider()
    # LLM tries to put mandatory skill into nice_to_have
    llm.generate_structured = AsyncMock(return_value={
        "extracted": {
            "must_have_skills": ["FastAPI"],
            "nice_to_have_skills": ["Python", "Docker"],
        },
        "inferred": {},
    })
    emb = MockEmbeddingProvider()
    service = JobAIService(llm, emb)

    job = JobCanonicalAggregate(
        job_id="j1111111-1111-1111-1111-111111111116",
        title="Backend Engineer",
        description="Backend role",
        skill_requirements=[
            JobSkillRequirement(name="Python", is_required=True, min_years=5, importance_score=5),
            JobSkillRequirement(name="Docker", is_required=False, min_years=2, importance_score=3),
        ],
        updated_at=datetime.now(timezone.utc),
    )
    profile = await service.generate_job_ai_profile(job)

    # Python must be in must_have_skills, NOT in nice_to_have_skills
    assert "Python" in profile.extracted.must_have_skills
    assert "FastAPI" in profile.extracted.must_have_skills
    assert "Python" not in profile.extracted.nice_to_have_skills
    # Docker is optional
    assert "Docker" in profile.extracted.nice_to_have_skills
    # Skill metadata remains intact on aggregate
    assert job.skill_requirements[0].min_years == 5
    assert job.skill_requirements[0].importance_score == 5


@pytest.mark.asyncio
async def test_no_hardcoded_engineering_or_midlevel_defaults():
    """Verify non-tech jobs do not default to 'Engineering' or 'Mid-Level'."""
    from unittest.mock import AsyncMock
    llm = MockLLMProvider()
    llm.generate_structured = AsyncMock(return_value={
        "extracted": {"must_have_skills": ["HR Policy"]},
        "inferred": {
            "role_family": "",
            "seniority": "",
            "likely_career_level": "",
        },
    })
    emb = MockEmbeddingProvider()
    service = JobAIService(llm, emb)

    job = JobCanonicalAggregate(
        job_id="j1111111-1111-1111-1111-111111111117",
        title="HR Specialist",
        category="Human Resources",
        experience_level="associate",
        description="HR operations role",
        updated_at=datetime.now(timezone.utc),
    )
    profile = await service.generate_job_ai_profile(job)

    assert profile.inferred.role_family == "Human Resources"
    assert profile.inferred.seniority == "associate"
    assert profile.inferred.likely_career_level == "associate"

    # Completely unspecified job
    job_empty = JobCanonicalAggregate(
        job_id="j1111111-1111-1111-1111-111111111118",
        title="General Staff",
        category=None,
        experience_level=None,
        description="General role",
        updated_at=datetime.now(timezone.utc),
    )
    profile_empty = await service.generate_job_ai_profile(job_empty)
    assert profile_empty.inferred.role_family == ""
    assert profile_empty.inferred.seniority == ""
    assert profile_empty.inferred.likely_career_level == ""


@pytest.mark.asyncio
async def test_skill_normalization_and_deduplication():
    """Verify skill names are trimmed and case-insensitively deduplicated preserving order."""
    from unittest.mock import AsyncMock
    llm = MockLLMProvider()
    llm.generate_structured = AsyncMock(return_value={
        "extracted": {
            "must_have_skills": ["  Python  ", "python", "PYTHON", "FastAPI", "fastapi "],
            "nice_to_have_skills": [" Docker ", "docker", "AWS"],
        },
        "inferred": {},
    })
    emb = MockEmbeddingProvider()
    service = JobAIService(llm, emb)

    job = JobCanonicalAggregate(
        job_id="j1111111-1111-1111-1111-111111111119",
        title="Developer",
        description="Development role",
        updated_at=datetime.now(timezone.utc),
    )
    profile = await service.generate_job_ai_profile(job)

    assert profile.extracted.must_have_skills == ["Python", "FastAPI"]
    assert profile.extracted.nice_to_have_skills == ["Docker", "AWS"]


@pytest.mark.asyncio
async def test_responsibilities_precedence():
    """Verify primary_responsibilities uses LLM if present, falls back to DB text only if empty."""
    from unittest.mock import AsyncMock
    llm = MockLLMProvider()
    emb = MockEmbeddingProvider()
    service = JobAIService(llm, emb)

    # 1. LLM provides responsibilities -> LLM wins
    llm.generate_structured = AsyncMock(return_value={
        "extracted": {},
        "inferred": {"primary_responsibilities": ["Lead sprint reviews", "Mentor interns"]},
    })
    job = JobCanonicalAggregate(
        job_id="j1111111-1111-1111-1111-111111111120",
        title="Team Lead",
        description="Lead team",
        responsibilities="Database responsibility text",
        updated_at=datetime.now(timezone.utc),
    )
    profile = await service.generate_job_ai_profile(job)
    assert profile.inferred.primary_responsibilities == ["Lead sprint reviews", "Mentor interns"]

    # 2. LLM returns empty list -> falls back to DB text
    llm.generate_structured = AsyncMock(return_value={
        "extracted": {},
        "inferred": {"primary_responsibilities": []},
    })
    profile_fallback = await service.generate_job_ai_profile(job)
    assert profile_fallback.inferred.primary_responsibilities == ["Database responsibility text"]


@pytest.mark.asyncio
async def test_company_industry_and_screening_questions_context_in_prompt():
    """Verify company_industry and screening_questions are passed in user_input prompt."""
    llm = MockLLMProvider()
    captured_input = {}

    async def mock_gen(prompt, user_input, response_schema, **kwargs):
        captured_input["user_input"] = user_input
        captured_input["prompt"] = prompt
        return {"extracted": {}, "inferred": {}}

    llm.generate_structured = mock_gen
    emb = MockEmbeddingProvider()
    service = JobAIService(llm, emb)

    job = JobCanonicalAggregate(
        job_id="j1111111-1111-1111-1111-111111111121",
        title="Compliance Officer",
        description="Manage regulatory compliance",
        company_industry="FinTech & Banking",
        screening_questions=["Do you have 5+ years banking compliance?", "Are you certified in AML?"],
        updated_at=datetime.now(timezone.utc),
    )
    await service.generate_job_ai_profile(job)

    assert "Company Industry Context: FinTech & Banking" in captured_input["user_input"]
    assert "Screening Questions Context: Do you have 5+ years banking compliance?, Are you certified in AML?" in captured_input["user_input"]
    assert "authoritative explicit facts" in captured_input["prompt"]



