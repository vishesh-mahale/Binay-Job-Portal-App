"""Unit tests for semantic builders."""

from __future__ import annotations

import pytest

from app.services.semantic_builders import (
    CandidateSemanticTextBuilder,
    JobSemanticTextBuilder,
)


class TestCandidateSemanticTextBuilder:
    def test_build_with_full_data(self):
        text = CandidateSemanticTextBuilder.build(
            professional_title="Software Engineer",
            total_experience_years=5.0,
            preferred_work_mode="remote",
            willing_to_relocate=True,
            locations=["Bengaluru", "Karnataka", "India"],
            confirmed_skills=["Python", "FastAPI"],
            resume_skills=["PostgreSQL", "Redis"],
            experiences=[
                {
                    "job_title": "Backend Engineer",
                    "company_name": "Tech Corp",
                    "description": "Built APIs",
                }
            ],
            educations=[
                {
                    "degree": "B.Tech",
                    "field_of_study": "Computer Science",
                    "institution_name": "IIT",
                }
            ],
            certifications=["AWS Certified"],
        )
        assert "Software Engineer" in text
        assert "Python" in text
        assert "Backend Engineer" in text
        assert "B.Tech" in text

    def test_build_with_empty_data(self):
        text = CandidateSemanticTextBuilder.build(
            professional_title="",
            total_experience_years=None,
            preferred_work_mode=None,
            willing_to_relocate=False,
            locations=[],
            confirmed_skills=[],
            resume_skills=[],
            experiences=[],
            educations=[],
            certifications=[],
        )
        assert "Professional Title: " in text
        assert "None" in text


class TestJobSemanticTextBuilder:
    def test_build_with_full_data(self):
        text = JobSemanticTextBuilder.build(
            title="Senior Backend Engineer",
            category="Engineering > Backend",
            employment_type="full_time",
            work_mode="hybrid",
            experience_min_years=5,
            experience_max_years=10,
            locations=["Bengaluru", "Karnataka", "India"],
            skills=["Python", "FastAPI", "PostgreSQL"],
            responsibilities="Design and build microservices.",
            requirements="Strong experience with Python and FastAPI.",
            technical_domains=["Backend", "Microservices"],
            industry_domains=["SaaS", "FinTech"],
            role_family="Engineering",
        )
        assert "Senior Backend Engineer" in text
        assert "Python" in text
        assert "Design and build microservices" in text

    def test_build_with_empty_data(self):
        text = JobSemanticTextBuilder.build(
            title="",
            category=None,
            employment_type=None,
            work_mode=None,
            experience_min_years=None,
            experience_max_years=None,
            locations=[],
            skills=[],
            responsibilities=None,
            requirements=None,
            technical_domains=None,
            industry_domains=None,
            role_family=None,
        )
        assert "Title: " in text
        assert "General" in text
