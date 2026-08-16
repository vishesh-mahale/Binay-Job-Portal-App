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
