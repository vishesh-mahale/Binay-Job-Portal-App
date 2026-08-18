"""Unit tests for Job Screening Questions service, schemas, and repository."""

import pytest
from unittest.mock import AsyncMock, MagicMock
from contextlib import asynccontextmanager

from app.schemas.screening_questions import (
    JobScreeningQuestionsTaskPayload,
    ScreeningQuestionItem,
    JobScreeningQuestionsResult,
)
from app.services.screening_service import ScreeningService
from app.repositories.screening_questions_repo import ScreeningQuestionsRepository
from app.core.exceptions import AIProviderError


def test_screening_schemas_validation():
    """Verify JobScreeningQuestionsTaskPayload and result schemas."""
    payload = JobScreeningQuestionsTaskPayload(
        schema_version=1,
        event_id="e3333333-3333-3333-3333-333333333333",
        aggregate_id="j3333333-3333-3333-3333-333333333333",
        trace_id="t3333333-3333-3333-3333-333333333333",
    )
    assert payload.schema_version == 1

    item = ScreeningQuestionItem(
        id="q1",
        question="Do you have 3+ years experience with FastAPI?",
        category="technical",
        required=True,
        question_type="boolean",
    )
    assert item.question_type == "boolean"

    res = JobScreeningQuestionsResult(
        questions=[item],
        model_name="mock-model",
        generated_at="2026-08-18T10:00:00Z",
    )
    assert len(res.questions) == 1


@pytest.mark.asyncio
async def test_screening_service_success():
    """Verify ScreeningService structured questions generation."""
    mock_llm = AsyncMock()
    mock_llm.model_name = "mock-model"
    mock_llm.generate_structured.return_value = {
        "questions": [
            {
                "question": "How many years of Python experience do you have?",
                "category": "experience",
                "required": True,
                "question_type": "number",
            },
            {
                "question": "Are you comfortable working in a hybrid model?",
                "category": "logistics",
                "required": True,
                "question_type": "boolean",
            },
        ]
    }

    service = ScreeningService(llm_provider=mock_llm)
    job_context = {
        "title": "Backend Developer",
        "work_mode": "hybrid",
        "skills": ["Python", "FastAPI"],
        "requirements": "3+ years experience",
    }

    result = await service.generate_screening_questions(job_context)
    assert isinstance(result, JobScreeningQuestionsResult)
    assert len(result.questions) == 2
    assert result.questions[0].category == "experience"
    assert result.questions[1].question_type == "boolean"


@pytest.mark.asyncio
async def test_screening_service_errors():
    """Verify ScreeningService error propagation."""
    mock_llm = AsyncMock()
    mock_llm.generate_structured.side_effect = AIProviderError("Timeout")

    service = ScreeningService(llm_provider=mock_llm)
    with pytest.raises(AIProviderError):
        await service.generate_screening_questions({})


@pytest.mark.asyncio
async def test_screening_repository_operations():
    """Verify ScreeningQuestionsRepository load and update methods."""
    mock_db = MagicMock()
    session = AsyncMock()

    mock_res = MagicMock()
    mock_res.mappings().first.return_value = {
        "job_id": "j3333333-3333-3333-3333-333333333333",
        "title": "Backend Dev",
        "description": "Build APIs",
    }
    mock_res.mappings().all.return_value = [{"skill_name": "Python", "is_required": True}]
    mock_res.rowcount = 1
    session.execute.return_value = mock_res

    @asynccontextmanager
    async def _mock_trans():
        yield session

    mock_db.transaction = _mock_trans

    repo = ScreeningQuestionsRepository(mock_db)
    ctx = await repo.load_job_for_screening("j3333333-3333-3333-3333-333333333333")
    assert ctx is not None
    assert ctx["title"] == "Backend Dev"
    assert "Python" in ctx["skills"]

    updated = await repo.update_job_screening_questions(
        job_id="j3333333-3333-3333-3333-333333333333",
        questions=[{"id": "q1", "question": "Are you available?"}],
        session=session,
    )
    assert updated is True
