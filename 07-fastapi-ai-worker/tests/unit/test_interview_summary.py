"""Unit tests for Interview Summary service, schemas, and repository."""

import pytest
from unittest.mock import AsyncMock, MagicMock
from contextlib import asynccontextmanager

from app.schemas.interview_summary import (
    InterviewSummaryTaskPayload,
    InterviewSummaryResult,
)
from app.services.interview_service import InterviewService
from app.repositories.interview_repo import InterviewRepository
from app.core.exceptions import AIProviderError


def test_interview_schemas_validation():
    """Verify InterviewSummaryTaskPayload and result schemas."""
    payload = InterviewSummaryTaskPayload(
        schema_version=1,
        event_id="e2222222-2222-2222-2222-222222222222",
        aggregate_id="i2222222-2222-2222-2222-222222222222",
        trace_id="t2222222-2222-2222-2222-222222222222",
    )
    assert payload.schema_version == 1
    assert payload.aggregate_id == "i2222222-2222-2222-2222-222222222222"

    res = InterviewSummaryResult(
        summary="Candidate showed strong system design skills.",
        strengths=["System Design", "Communication"],
        weaknesses=["Distributed cache nuances"],
        recommendation="Hire",
        model_name="mock-model",
        generated_at="2026-08-18T10:00:00Z",
    )
    assert len(res.strengths) == 2
    assert res.recommendation == "Hire"


@pytest.mark.asyncio
async def test_interview_service_success():
    """Verify InterviewService structured summary generation."""
    mock_llm = AsyncMock()
    mock_llm.model_name = "mock-model"
    mock_llm.generate_structured.return_value = {
        "summary": "Solid technical performance with good communication.",
        "strengths": ["Fast problem solver", "Clear communication"],
        "weaknesses": ["Limited Kubernetes experience"],
        "technical_assessment": "4/5 technical competency",
        "cultural_fit_assessment": "5/5 team collaboration",
        "recommendation": "Strong Hire",
    }

    service = InterviewService(llm_provider=mock_llm)
    context = {
        "job_title": "Senior Engineer",
        "interview_title": "Technical Round 1",
        "interview_type": "technical",
        "feedback_list": [
            {
                "participant_role": "lead_interviewer",
                "technical_skill": 4,
                "communication": 5,
                "problem_solving": 4,
                "cultural_fit": 5,
                "overall_rating": 4,
                "decision": "pass",
                "strengths": "Quick thinking",
                "weaknesses": "None major",
                "notes": "Great interview",
            }
        ],
    }

    result = await service.generate_interview_summary(context)
    assert isinstance(result, InterviewSummaryResult)
    assert result.recommendation == "Strong Hire"
    assert len(result.strengths) == 2


@pytest.mark.asyncio
async def test_interview_service_errors():
    """Verify InterviewService error propagation."""
    mock_llm = AsyncMock()
    mock_llm.generate_structured.side_effect = AIProviderError("Timeout")

    service = InterviewService(llm_provider=mock_llm)
    with pytest.raises(AIProviderError):
        await service.generate_interview_summary({})


@pytest.mark.asyncio
async def test_interview_repository_operations():
    """Verify InterviewRepository load and update methods."""
    mock_db = MagicMock()
    session = AsyncMock()

    mock_res = MagicMock()
    mock_res.mappings().first.return_value = {
        "interview_id": "i2222222-2222-2222-2222-222222222222",
        "application_id": "a2222222-2222-2222-2222-222222222222",
        "job_id": "j2222222-2222-2222-2222-222222222222",
        "interview_title": "Tech Screen",
        "job_title": "Backend Dev",
    }
    mock_res.mappings().all.return_value = [
        {"feedback_id": "f1", "participant_id": "p1", "decision": "pass", "participant_role": "interviewer"}
    ]
    mock_res.rowcount = 1
    session.execute.return_value = mock_res

    @asynccontextmanager
    async def _mock_trans():
        yield session

    mock_db.transaction = _mock_trans

    repo = InterviewRepository(mock_db)
    ctx = await repo.load_interview_context("i2222222-2222-2222-2222-222222222222")
    assert ctx is not None
    assert ctx["job_title"] == "Backend Dev"
    assert len(ctx["feedback_list"]) == 1

    updated = await repo.update_interview_ai_summary(
        interview_id="i2222222-2222-2222-2222-222222222222",
        participant_id="p1",
        ai_summary="Great performance",
        session=session,
    )
    assert updated is True
