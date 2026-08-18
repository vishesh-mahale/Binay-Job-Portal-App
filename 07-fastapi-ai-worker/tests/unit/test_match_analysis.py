"""Unit tests for Match & Gap Analysis service, schemas, and repository."""

import pytest
from unittest.mock import AsyncMock, MagicMock
from app.schemas.match_analysis import (
    MatchAnalyzeTaskPayload,
    MatchAnalysisResult,
    MatchScoreDetails,
    SkillMatchDetail,
    GapItem,
)
from app.services.match_service import MatchService
from app.repositories.match_repo import MatchRepository
from app.core.exceptions import AIProviderError, AIResponseValidationError


def test_match_schemas_validation():
    """Verify MatchAnalyzeTaskPayload and result schemas."""
    payload = MatchAnalyzeTaskPayload(
        schema_version=1,
        event_id="e1111111-1111-1111-1111-111111111111",
        aggregate_id="a1111111-1111-1111-1111-111111111111",
        trace_id="t1111111-1111-1111-1111-111111111111",
    )
    assert payload.schema_version == 1
    assert payload.aggregate_id == "a1111111-1111-1111-1111-111111111111"

    skill = SkillMatchDetail(skill_name="Python", matched=True, importance="required", candidate_source="confirmed_profile")
    assert skill.matched is True

    gap = GapItem(category="skill", description="Missing Kubernetes", severity="high")
    assert gap.severity == "high"


@pytest.mark.asyncio
async def test_match_service_success():
    """Verify MatchService structured output generation."""
    mock_llm = AsyncMock()
    mock_llm.model_name = "mock-model"
    mock_llm.generate_structured.return_value = {
        "overall_match_score": 85.5,
        "ranking_score": 88.0,
        "skills_match_score": 90.0,
        "experience_match_score": 80.0,
        "domain_match_score": 85.0,
        "skills_breakdown": [
            {"skill_name": "Python", "matched": True, "importance": "required", "candidate_source": "confirmed_profile"},
            {"skill_name": "AWS", "matched": False, "importance": "required", "candidate_source": None},
        ],
        "experience_breakdown": {
            "required_years_min": 3.0,
            "candidate_years": 4.5,
            "meets_requirement": True,
        },
        "gaps": [
            {"category": "skill", "description": "Lacks AWS production experience", "severity": "medium"}
        ],
        "fit_summary": "Strong candidate with core backend skills.",
    }

    service = MatchService(llm_provider=mock_llm)
    context = {
        "job_title": "Backend Engineer",
        "candidate_title": "Python Developer",
        "required_skills": ["Python", "AWS"],
        "candidate_skills": ["Python", "FastAPI"],
        "candidate_experience_years": 4.5,
    }

    result = await service.analyze_application_match(context)
    assert isinstance(result, MatchAnalysisResult)
    assert result.match_score == 85.5
    assert result.ranking_score == 88.0
    assert len(result.details.skills_breakdown) == 2
    assert len(result.details.gaps) == 1
    assert result.details.experience_breakdown.meets_requirement is True


@pytest.mark.asyncio
async def test_match_service_error_handling():
    """Verify MatchService error propagation."""
    mock_llm = AsyncMock()
    mock_llm.generate_structured.side_effect = AIProviderError("Provider timeout")

    service = MatchService(llm_provider=mock_llm)
    with pytest.raises(AIProviderError):
        await service.analyze_application_match({})

    mock_llm.generate_structured.side_effect = Exception("Malformed JSON")
    with pytest.raises(AIProviderError):
        await service.analyze_application_match({})


@pytest.mark.asyncio
async def test_match_repository_operations():
    """Verify MatchRepository load and update methods."""
    mock_db = MagicMock()
    session = AsyncMock()

    mock_res = MagicMock()
    mock_res.mappings().first.return_value = {
        "application_id": "a1111111-1111-1111-1111-111111111111",
        "job_id": "j1111111-1111-1111-1111-111111111111",
        "candidate_id": "c1111111-1111-1111-1111-111111111111",
        "is_guest": False,
        "job_title": "Software Engineer",
        "candidate_title": "Software Engineer",
    }
    mock_res.mappings().all.return_value = [{"skill_name": "Python", "is_required": True}]
    mock_res.rowcount = 1
    session.execute.return_value = mock_res

    from contextlib import asynccontextmanager

    @asynccontextmanager
    async def _mock_trans():
        yield session

    mock_db.transaction = _mock_trans

    repo = MatchRepository(mock_db)
    ctx = await repo.load_application_match_context("a1111111-1111-1111-1111-111111111111")
    assert ctx is not None
    assert ctx["job_title"] == "Software Engineer"
    assert "Python" in ctx["required_skills"]

    updated = await repo.update_application_match_result(
        application_id="a1111111-1111-1111-1111-111111111111",
        match_score=85.0,
        match_details={"summary": "good"},
        ranking_score=85.0,
        session=session,
    )
    assert updated is True
