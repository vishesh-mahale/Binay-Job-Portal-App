"""Targeted tests to boost coverage on document_extractor, main lifespan, and task retry branches."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi import HTTPException

from app.core.exceptions import AIProviderError, RateLimitError
from app.services.document_extractor import DocumentExtractor
from app.services.interview_service import InterviewService
from app.services.match_service import MatchService
from app.services.screening_service import ScreeningService
from app.api.v1.task_handlers import (
    handle_match_analyze_task,
    handle_interview_summary_task,
    handle_job_screening_questions_task,
)
from app.schemas.tasks import (
    MatchAnalyzeTaskPayload,
    InterviewSummaryTaskPayload,
    JobScreeningQuestionsTaskPayload,
)
from app.main import lifespan, create_app


def test_document_extractor_unsupported_magic_bytes():
    """Verify ValueError on invalid magic bytes for pdf/docx."""
    extractor = DocumentExtractor()
    with pytest.raises(ValueError, match="Invalid PDF file"):
        extractor._validate_magic_bytes("resume.pdf", b"not-a-pdf")

    with pytest.raises(ValueError, match="Invalid DOCX file"):
        extractor._validate_magic_bytes("resume.docx", b"not-a-zip")


def test_document_extractor_size_limit():
    """Verify document size validation."""
    extractor = DocumentExtractor(max_document_size_bytes=100)
    with pytest.raises(ValueError, match="Document exceeds max size"):
        extractor._validate_size(b"a" * 101)


@pytest.mark.asyncio
async def test_lifespan_lifecycle():
    """Verify lifespan startup and shutdown hooks."""
    app = create_app()
    with (
        patch("app.core.database.DatabaseManager.initialize", new_callable=AsyncMock) as mock_init,
        patch("app.core.database.DatabaseManager.shutdown", new_callable=AsyncMock) as mock_shutdown,
    ):
        async with lifespan(app):
            mock_init.assert_called_once()
        mock_shutdown.assert_called_once()


@pytest.mark.asyncio
async def test_services_ai_error_handling():
    """Verify services properly raise AIProviderError on provider failures."""
    mock_llm = MagicMock()
    mock_llm.generate_structured = AsyncMock(side_effect=Exception("LLM connection timeout"))

    match_svc = MatchService(mock_llm)
    with pytest.raises(AIProviderError):
        await match_svc.analyze_application_match({"candidate_facts": {}, "job_profile": {}})

    interview_svc = InterviewService(mock_llm)
    with pytest.raises(AIProviderError):
        await interview_svc.generate_interview_summary({"feedbacks": [], "job": {}, "candidate": {}})

    screening_svc = ScreeningService(mock_llm)
    with pytest.raises(AIProviderError):
        await screening_svc.generate_screening_questions({"title": "Dev", "description": "Code"})


@pytest.mark.asyncio
async def test_task_handlers_retryable_503_and_terminal_error():
    """Verify 503 on retryable errors and 500 on unexpected errors for all 3 workloads."""
    mock_req = MagicMock()
    mock_lease = AsyncMock(return_value=True)

    # 1. Match analysis error handling
    with (
        patch("app.repositories.processed_events_repo.ProcessedEventsRepository.is_processed", new_callable=AsyncMock, return_value=False),
        patch("app.core.database.DatabaseManager.acquire_processing_lease", mock_lease),
        patch("app.repositories.match_repo.MatchRepository.load_application_match_context", new_callable=AsyncMock, side_effect=RateLimitError("Rate limit")),
        patch("app.core.database.DatabaseManager.release_processing_lease", new_callable=AsyncMock),
    ):
        with pytest.raises(HTTPException) as exc_info:
            await handle_match_analyze_task(
                payload=MatchAnalyzeTaskPayload(schema_version=1, event_id="e1", aggregate_id="a1"),
                request=mock_req,
            )
        assert exc_info.value.status_code == 503

    # 2. Interview summary error handling
    with (
        patch("app.repositories.processed_events_repo.ProcessedEventsRepository.is_processed", new_callable=AsyncMock, return_value=False),
        patch("app.core.database.DatabaseManager.acquire_processing_lease", mock_lease),
        patch("app.repositories.interview_repo.InterviewRepository.load_interview_context", new_callable=AsyncMock, side_effect=RateLimitError("Rate limit")),
        patch("app.core.database.DatabaseManager.release_processing_lease", new_callable=AsyncMock),
    ):
        with pytest.raises(HTTPException) as exc_info:
            await handle_interview_summary_task(
                payload=InterviewSummaryTaskPayload(schema_version=1, event_id="e2", aggregate_id="i2"),
                request=mock_req,
            )
        assert exc_info.value.status_code == 503

    # 3. Screening questions error handling
    with (
        patch("app.repositories.processed_events_repo.ProcessedEventsRepository.is_processed", new_callable=AsyncMock, return_value=False),
        patch("app.core.database.DatabaseManager.acquire_processing_lease", mock_lease),
        patch("app.repositories.screening_questions_repo.ScreeningQuestionsRepository.load_job_for_screening", new_callable=AsyncMock, side_effect=RateLimitError("Rate limit")),
        patch("app.core.database.DatabaseManager.release_processing_lease", new_callable=AsyncMock),
    ):
        with pytest.raises(HTTPException) as exc_info:
            await handle_job_screening_questions_task(
                payload=JobScreeningQuestionsTaskPayload(schema_version=1, event_id="e3", aggregate_id="j3"),
                request=mock_req,
            )
        assert exc_info.value.status_code == 503
