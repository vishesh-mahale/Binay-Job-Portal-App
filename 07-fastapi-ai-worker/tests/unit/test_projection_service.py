"""Unit tests for CandidateProjectionService fact merging, deduplication, and embedding."""

import pytest
from app.providers.mock import MockEmbeddingProvider
from app.schemas.candidate_search import CandidateCanonicalAggregate
from app.services.projection_service import CandidateProjectionService


@pytest.mark.asyncio
async def test_merge_facts_deduplication_and_precedence():
    """Verify that confirmed canonical skills override resume extracted skills."""
    embedding_provider = MockEmbeddingProvider()
    service = CandidateProjectionService(embedding_provider)

    aggregate = CandidateCanonicalAggregate(
        candidate_id="c1111111-1111-1111-1111-111111111111",
        profile_revision=3,
        professional_title="Senior Python Developer",
        city="Bengaluru",
        state="Karnataka",
        country="India",
        preferred_work_mode="hybrid",
        willing_to_relocate=True,
        skills=[
            {
                "skill_id": "s1111111-1111-1111-1111-111111111111",
                "master_skill_name": "Python",
                "primary_source_type": "confirmed_profile",
            },
            {
                "skill_id": None,
                "custom_skill_name": "FastAPI",
                "primary_source_type": "manual_entry",
            },
        ],
        experiences=[
            {
                "job_title": "Backend Lead",
                "company_name": "Fintech Solutions",
                "start_date": "2020-01-01",
                "end_date": "2023-01-01",
                "is_current": False,
                "description": "Architected payment microservices.",
            }
        ],
        educations=[
            {
                "degree": "Bachelor of Technology",
                "field_of_study": "Computer Science",
                "institution_name": "VTU",
            }
        ],
        active_resume_document_id="d1111111-1111-1111-1111-111111111111",
        active_resume_parsing_result_id="p1111111-1111-1111-1111-111111111111",
        active_resume_parsed_data={
            "normalized_output": {
                "ai": {
                    # "Python" is already in canonical; should NOT duplicate and keep confirmed_profile source
                    # "Docker" and "Kubernetes" are new; should be marked latest_active_resume
                    "skills": ["python", "Docker", "Kubernetes"],
                    "experience_years": 5.0,
                }
            }
        },
    )

    merged = service.merge_facts(aggregate)

    assert merged.candidate_id == "c1111111-1111-1111-1111-111111111111"
    assert merged.source_profile_revision == 3
    assert merged.projection_revision == 3
    assert merged.skill_ids == ["s1111111-1111-1111-1111-111111111111"]

    # Deduplicated skill names: Python, FastAPI, Docker, Kubernetes
    assert "Python" in merged.skill_names
    assert "FastAPI" in merged.skill_names
    assert "Docker" in merged.skill_names
    assert "Kubernetes" in merged.skill_names
    assert len(merged.skill_names) == 4

    # Fact sources check
    assert merged.fact_sources["skills"]["Python"] == "confirmed_profile"
    assert merged.fact_sources["skills"]["FastAPI"] == "manual_entry"
    assert merged.fact_sources["skills"]["Docker"] == "latest_active_resume"
    assert merged.fact_sources["skills"]["Kubernetes"] == "latest_active_resume"

    # Normalized titles: lowercase, trimmed, deduplicated
    assert "senior python developer" in merged.normalized_titles
    assert "backend lead" in merged.normalized_titles

    # Total experience
    assert merged.total_experience_years == 3.0

    # Highest education
    assert merged.highest_education_level == "Bachelor of Technology"


@pytest.mark.asyncio
async def test_generate_projection_embedding():
    """Verify that generate_projection creates a valid 768-dim embedding."""
    embedding_provider = MockEmbeddingProvider()
    service = CandidateProjectionService(embedding_provider)

    aggregate = CandidateCanonicalAggregate(
        candidate_id="c1111111-1111-1111-1111-111111111111",
        profile_revision=1,
        professional_title="Data Scientist",
    )

    upsert_data = await service.generate_projection(aggregate)

    assert upsert_data.candidate_id == "c1111111-1111-1111-1111-111111111111"
    assert len(upsert_data.embedding) == 768
    assert upsert_data.embedding_model == embedding_provider.model_name
    assert upsert_data.embedding_version == 1
