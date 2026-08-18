"""Extra unit tests targeting edge cases and branches across services and repositories."""

from datetime import datetime, timezone
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.services.document_extractor import DocumentExtractor
from app.services.semantic_builders import CandidateSemanticTextBuilder, JobSemanticTextBuilder
from app.services.job_ai_service import JobAIService
from app.schemas.job_enrichment import JobCanonicalAggregate
from app.repositories.outbox_repo import OutboxRepository
from app.repositories.analytics_repo import AnalyticsRepository


def test_extractor_magic_bytes_failure():
    extractor = DocumentExtractor()
    with pytest.raises(ValueError, match="magic bytes do not match"):
        extractor.extract_from_bytes("resume.pdf", b"not_a_pdf_file")


def test_extractor_docx_magic_bytes_failure():
    extractor = DocumentExtractor()
    with pytest.raises(ValueError, match="magic bytes do not match"):
        extractor.extract_from_bytes("resume.docx", b"not_a_zip_file")


def test_semantic_builder_none_and_edge_values():
    text = CandidateSemanticTextBuilder.build(
        professional_title="Python Developer",
        total_experience_years=3.5,
        preferred_work_mode="remote",
        willing_to_relocate=True,
        locations=["San Francisco"],
        confirmed_skills=["Python", "FastAPI"],
        resume_skills=["Docker"],
        experiences=[{"job_title": "Engineer", "company_name": "Tech Corp", "description": "Built APIs"}],
        educations=[{"degree": "BS", "field_of_study": "CS", "institution_name": "Univ"}],
        certifications=["AWS"],
    )
    assert "Python" in text
    assert "Engineer" in text

    job_text = JobSemanticTextBuilder.build(
        title="Software Engineer",
        skills=["Python", "SQL"],
        locations=["Remote"],
        responsibilities="Building scalable backend APIs",
        requirements="Python 3.12, FastAPI",
    )
    assert "Software Engineer" in job_text
    assert "Python" in job_text


@pytest.mark.asyncio
async def test_job_ai_service_profile_generation():
    mock_llm = MagicMock()
    mock_llm.model_name = "mock-llm"
    mock_llm.model_version = "v1"
    mock_llm.generate_structured = AsyncMock(return_value={
        "schema_version": 1,
        "extracted": {
            "must_have_skills": ["Python", "FastAPI"],
            "nice_to_have_skills": ["Docker"],
            "minimum_experience_years": 3.0,
            "preferred_education": ["B.Tech"],
            "certifications": [],
            "languages": ["English"],
        },
        "inferred": {
            "role_family": "Backend Engineering",
            "seniority": "Mid-Level",
            "technical_domains": ["Distributed Systems"],
            "industry_domains": ["Technology"],
            "soft_skills": ["Problem Solving"],
            "primary_responsibilities": ["Develop REST APIs"],
            "likely_career_level": "IC3",
            "keywords": ["Python", "FastAPI"],
            "confidence_score": 0.95,
        },
        "metadata": {
            "model": "gemini-2.5-flash",
            "model_version": "2.5",
            "prompt_version": "v1",
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "processing_time_ms": 120,
        }
    })
    mock_embed = MagicMock()
    mock_embed.get_embedding = AsyncMock(return_value=[0.1] * 768)

    service = JobAIService(llm_provider=mock_llm, embedding_provider=mock_embed)
    job_agg = JobCanonicalAggregate(
        job_id="job-1",
        title="Senior Python Developer",
        description="Must know Python, FastAPI, and Postgres database systems.",
        employment_type="full_time",
        work_mode="remote",
        locations=["Remote"],
        skills=["Python"],
        updated_at=datetime.now(timezone.utc),
    )
    res = await service.generate_job_ai_profile(job_agg)
    assert res.schema_version == 1
    assert "Python" in res.extracted.must_have_skills


@pytest.mark.asyncio
async def test_analytics_repo_emit():
    mock_db = MagicMock()
    mock_session = AsyncMock()
    mock_res = MagicMock()
    mock_res.rowcount = 1
    mock_session.execute = AsyncMock(return_value=mock_res)
    
    class _CM:
        async def __aenter__(self):
            return mock_session
        async def __aexit__(self, *args):
            return False

    mock_db.session_maker.return_value = _CM()
    repo = AnalyticsRepository(mock_db)
    inserted = await repo.emit(
        event_name="test_event",
        event_category="ai",
        entity_type="job",
        entity_id="j1",
        event_data={"key": "value"},
    )
    assert inserted is True


@pytest.mark.asyncio
async def test_outbox_repo_emit_event():
    mock_db = MagicMock()
    mock_session = AsyncMock()
    mock_res = MagicMock()
    mock_mappings = MagicMock()
    mock_mappings.first.return_value = {"id": "evt-123"}
    mock_res.mappings.return_value = mock_mappings
    mock_session.execute = AsyncMock(return_value=mock_res)
    
    class _CM:
        async def __aenter__(self):
            return mock_session
        async def __aexit__(self, *args):
            return False

    mock_db.session_maker.return_value = _CM()
    repo = OutboxRepository(mock_db)
    event_id = await repo.emit_event(
        event_type="test.event",
        aggregate_type="test",
        aggregate_id="agg-1",
        payload={"foo": "bar"},
    )
    assert event_id == "evt-123"
