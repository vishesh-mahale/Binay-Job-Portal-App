"""Unit tests for candidate search projection schemas and validation."""

import pytest
from pydantic import ValidationError

from app.schemas.candidate_search import (
    CandidateCanonicalAggregate,
    CandidateMergedSearchData,
    CandidateSearchProfileUpsert,
    FactSourcesSchema,
)


def test_fact_sources_schema():
    """Test FactSourcesSchema serialization."""
    sources = FactSourcesSchema(
        skills={"Python": "candidate_manual", "FastAPI": "resume_ai"},
        titles={"Backend Engineer": "candidate_manual"},
        experiences={"total_years": "candidate_manual"},
        education={"highest_level": "candidate_manual"},
    )
    d = sources.model_dump()
    assert d["skills"]["Python"] == "candidate_manual"
    assert d["skills"]["FastAPI"] == "resume_ai"


def test_candidate_search_profile_upsert_vector_validation():
    """Test embedding dimension validation on CandidateSearchProfileUpsert."""
    valid_vector = [0.1] * 768

    upsert = CandidateSearchProfileUpsert(
        candidate_id="11111111-1111-1111-1111-111111111111",
        source_profile_revision=2,
        projection_revision=2,
        professional_title="Python Developer",
        normalized_titles=["python developer"],
        skill_ids=["22222222-2222-2222-2222-222222222222"],
        skill_names=["Python", "FastAPI"],
        locations=["Bengaluru"],
        fact_sources={"skills": {"Python": "candidate_manual"}},
        total_experience_years=4.5,
        highest_education_level="B.Tech",
        searchable_text="Python Developer Bengaluru",
        embedding=valid_vector,
        embedding_model="test-embedding-model",
        embedding_version=1,
    )
    assert len(upsert.embedding) == 768

    # Invalid dimension (e.g. 100 instead of 768) should raise ValidationError
    invalid_vector = [0.1] * 100
    with pytest.raises(ValidationError):
        CandidateSearchProfileUpsert(
            candidate_id="11111111-1111-1111-1111-111111111111",
            source_profile_revision=2,
            projection_revision=2,
            searchable_text="Text",
            embedding=invalid_vector,
            embedding_model="test-model",
        )
