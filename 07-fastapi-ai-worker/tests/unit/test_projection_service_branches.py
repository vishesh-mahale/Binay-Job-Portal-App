"""Unit tests for CandidateProjectionService branches."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.projection_service import CandidateProjectionService
from app.schemas.candidate_search import CandidateCanonicalAggregate, CandidateMergedSearchData


@pytest.mark.asyncio
async def test_merge_facts_with_empty_aggregate():
    embedding = AsyncMock()
    embedding.embed = AsyncMock(return_value=[0.1] * 768)
    service = CandidateProjectionService(embedding_provider=embedding)

    aggregate = CandidateCanonicalAggregate(
        candidate_id="c1",
        profile_revision=1,
        professional_title="",
        summary=None,
        city=None,
        state=None,
        country=None,
        current_location=None,
        preferred_work_mode=None,
        willing_to_relocate=False,
        willing_to_travel=False,
        notice_period_days=None,
        expected_salary_min=None,
        expected_salary_max=None,
        salary_currency="INR",
        is_open_to_work=True,
        skills=[],
        experiences=[],
        educations=[],
        certifications=[],
        projects=[],
        languages=[],
        active_resume_document_id=None,
        active_resume_parsing_result_id=None,
        active_resume_parsed_data={},
    )

    merged = service.merge_facts(aggregate)
    assert merged.candidate_id == "c1"
    assert merged.professional_title == ""
    assert merged.skill_names == []
    assert merged.locations == []


@pytest.mark.asyncio
async def test_merge_facts_with_resume_skills():
    embedding = AsyncMock()
    embedding.embed = AsyncMock(return_value=[0.1] * 768)
    service = CandidateProjectionService(embedding_provider=embedding)

    aggregate = CandidateCanonicalAggregate(
        candidate_id="c1",
        profile_revision=1,
        professional_title="Engineer",
        summary=None,
        city="Bengaluru",
        state="Karnataka",
        country="India",
        current_location="Bengaluru, Karnataka, India",
        preferred_work_mode="remote",
        willing_to_relocate=False,
        willing_to_travel=True,
        notice_period_days=30,
        expected_salary_min=1000000,
        expected_salary_max=2000000,
        salary_currency="INR",
        is_open_to_work=True,
        skills=[
            {
                "skill_id": "s1",
                "master_skill_name": "Python",
                "primary_source_type": "confirmed_profile",
            }
        ],
        experiences=[],
        educations=[],
        certifications=[],
        projects=[],
        languages=[],
        active_resume_document_id="d1",
        active_resume_parsing_result_id="r1",
        active_resume_parsed_data={
            "normalized_output": {
                "ai": {
                    "skills": ["PostgreSQL", "Redis"],
                    "experience_years": 3.0,
                }
            }
        },
    )

    merged = service.merge_facts(aggregate)
    assert "Python" in merged.skill_names
    assert "PostgreSQL" in merged.skill_names
    assert merged.fact_sources["skills"]["Python"] == "confirmed_profile"
    assert merged.fact_sources["skills"]["PostgreSQL"] == "latest_active_resume"


@pytest.mark.asyncio
async def test_generate_projection_returns_upsert_data():
    embedding = AsyncMock()
    embedding.embed = AsyncMock(return_value=[0.1] * 768)
    embedding.model_name = "text-embedding-004"
    service = CandidateProjectionService(embedding_provider=embedding)

    aggregate = CandidateCanonicalAggregate(
        candidate_id="c1",
        profile_revision=1,
        professional_title="Engineer",
        summary=None,
        city="Bengaluru",
        state="Karnataka",
        country="India",
        current_location="Bengaluru, Karnataka, India",
        preferred_work_mode="remote",
        willing_to_relocate=False,
        willing_to_travel=True,
        notice_period_days=30,
        expected_salary_min=1000000,
        expected_salary_max=2000000,
        salary_currency="INR",
        is_open_to_work=True,
        skills=[
            {
                "skill_id": "s1",
                "master_skill_name": "Python",
                "primary_source_type": "confirmed_profile",
            }
        ],
        experiences=[],
        educations=[],
        certifications=[],
        projects=[],
        languages=[],
        active_resume_document_id="d1",
        active_resume_parsing_result_id="r1",
        active_resume_parsed_data={
            "normalized_output": {
                "ai": {
                    "skills": ["PostgreSQL"],
                    "experience_years": 3.0,
                }
            }
        },
    )

    upsert = await service.generate_projection(aggregate)
    assert upsert.candidate_id == "c1"
    assert len(upsert.embedding) == 768
    assert upsert.embedding_model == "text-embedding-004"
