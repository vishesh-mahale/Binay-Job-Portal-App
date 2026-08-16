"""Unit tests for symmetric candidate and job semantic text builders."""

import pytest
from app.services.semantic_builders import CandidateSemanticTextBuilder, JobSemanticTextBuilder


def test_candidate_semantic_text_builder_full():
    """Test candidate semantic builder with all fields populated."""
    text = CandidateSemanticTextBuilder.build(
        professional_title="Senior Python Architect",
        total_experience_years=8.5,
        preferred_work_mode="hybrid",
        willing_to_relocate=True,
        locations=["Bengaluru", "Karnataka", "India"],
        confirmed_skills=["Python", "FastAPI", "PostgreSQL"],
        resume_skills=["Docker", "Kubernetes", "Redis"],
        experiences=[
            {
                "job_title": "Lead Engineer",
                "company_name": "Tech Corp",
                "description": "Architected distributed event-driven systems using FastAPI.",
            }
        ],
        educations=[
            {
                "degree": "B.Tech",
                "field_of_study": "Computer Science",
                "institution_name": "IIT Delhi",
            }
        ],
        certifications=["AWS Certified Solutions Architect"],
    )

    assert "Professional Title: Senior Python Architect" in text
    assert "Experience Level: 8.5 years" in text
    assert "Work Preference: Hybrid | Willing to Relocate: Yes" in text
    assert "Locations: Bengaluru, Karnataka, India" in text
    assert "Confirmed Skills: Python, FastAPI, PostgreSQL" in text
    assert "Resume Extracted Skills: Docker, Kubernetes, Redis" in text
    assert "Lead Engineer at Tech Corp: Architected distributed event-driven systems" in text
    assert "Education: B.Tech in Computer Science (IIT Delhi)" in text
    assert "Certifications: AWS Certified Solutions Architect" in text


def test_candidate_semantic_text_builder_empty():
    """Test candidate semantic builder with empty/fallback fields."""
    text = CandidateSemanticTextBuilder.build()

    assert "Professional Title: Not Specified" in text
    assert "Experience Level: 0.0 years" in text
    assert "Work Preference: Not Specified | Willing to Relocate: No" in text
    assert "Locations: Not Specified" in text
    assert "Confirmed Skills: None" in text
    assert "Resume Extracted Skills: None" in text
    assert "Experience Summary:\nNone" in text
    assert "Education: Not Specified" in text
    assert "Certifications: None" in text


def test_job_semantic_text_builder_full():
    """Test job semantic builder with all fields populated."""
    text = JobSemanticTextBuilder.build(
        title="Senior Backend Engineer",
        category="Software Engineering",
        employment_type="full_time",
        work_mode="remote",
        experience_min_years=5,
        experience_max_years=8,
        locations=["Remote, India"],
        skills=["Python", "AsyncIO", "PostgreSQL"],
        responsibilities="Build high-throughput async APIs and background workers.",
        requirements="5+ years of experience with Python and distributed systems.",
        technical_domains=["Backend", "Distributed Systems"],
        industry_domains=["Fintech"],
        role_family="Engineering",
    )

    assert "Title: Senior Backend Engineer" in text
    assert "Category: Software Engineering" in text
    assert "Employment Type: Full Time | Work Mode: Remote" in text
    assert "Experience Required: 5-8 years" in text
    assert "Location: Remote, India" in text
    assert "Required Skills: Python, AsyncIO, PostgreSQL" in text
    assert "Responsibilities:\nBuild high-throughput async APIs" in text
    assert "Requirements:\n5+ years of experience" in text
    assert "AI Domain & Concepts: Backend, Distributed Systems, Fintech, Engineering" in text
