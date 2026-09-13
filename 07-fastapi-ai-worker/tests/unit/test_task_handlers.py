"""Unit tests for task handlers retry matrix and error paths."""

from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.schemas.tasks import ResumeParseTaskPayload, CandidateProjectionTaskPayload, JobEnrichTaskPayload
from app.core.exceptions import AIProviderError, DocumentSecurityError, DocumentValidationError
from app.api.v1 import task_handlers


class _AsyncContextManager:
    def __init__(self, session):
        self._session = session

    async def __aenter__(self):
        return self._session

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        return False


@pytest.fixture
def test_app():
    from app.main import create_app
    app = create_app()
    return app


def test_resume_parse_scan_pending_returns_503(test_app):
    client = TestClient(test_app)
    payload = ResumeParseTaskPayload(schema_version=1, event_id="e1", aggregate_id="j1", trace_id="t1").model_dump()

    with (
        patch("app.core.database.DatabaseManager.initialize", new_callable=AsyncMock),
        patch("app.repositories.processed_events_repo.ProcessedEventsRepository.is_processed", new_callable=AsyncMock) as mock_is_processed,
        patch("app.repositories.parsing_job_repo.ResumeParsingJobRepository.claim_job", new_callable=AsyncMock) as mock_claim,
    ):
        mock_is_processed.return_value = False
        mock_claim.return_value = {"id": "j1", "document_id": "d1"}

        with patch("app.api.v1.task_handlers.get_db_manager") as mock_db:
            mock_session = AsyncMock()
            mock_db.return_value.transaction = MagicMock(return_value=_AsyncContextManager(mock_session))
            mock_db.return_value.session_maker = MagicMock(return_value=_AsyncContextManager(mock_session))
            mock_result = MagicMock()
            mock_result.mappings.return_value.first.return_value = {"storage_path": "uploads/d1", "security_scan_status": "pending"}
            mock_session.execute = AsyncMock(return_value=mock_result)

            response = client.post("/internal/tasks/resume/parse", json=payload)
            assert response.status_code == 503
            data = response.json()
            assert data["detail"]["code"] == "SCAN_PENDING"


def test_resume_parse_infected_document_returns_200(test_app):
    client = TestClient(test_app)
    payload = ResumeParseTaskPayload(schema_version=1, event_id="e2", aggregate_id="j2", trace_id="t2").model_dump()

    with (
        patch("app.core.database.DatabaseManager.initialize", new_callable=AsyncMock),
        patch("app.repositories.processed_events_repo.ProcessedEventsRepository.is_processed", new_callable=AsyncMock) as mock_is_processed,
        patch("app.repositories.parsing_job_repo.ResumeParsingJobRepository.claim_job", new_callable=AsyncMock) as mock_claim,
        patch("app.repositories.resume_parsed_repo.ResumeParsedRepository.insert_event", new_callable=AsyncMock),
        patch("app.repositories.parsing_job_repo.ResumeParsingJobRepository.mark_failed", new_callable=AsyncMock),
        patch("app.repositories.processed_events_repo.ProcessedEventsRepository.record_processed", new_callable=AsyncMock),
    ):
        mock_is_processed.return_value = False
        mock_claim.return_value = {"id": "j2", "document_id": "d2"}

        with patch("app.api.v1.task_handlers.get_db_manager") as mock_db:
            mock_session = AsyncMock()
            mock_db.return_value.transaction = MagicMock(return_value=_AsyncContextManager(mock_session))
            mock_db.return_value.session_maker = MagicMock(return_value=_AsyncContextManager(mock_session))
            mock_result = MagicMock()
            mock_result.mappings.return_value.first.return_value = {"storage_path": "uploads/d2", "security_scan_status": "infected"}
            mock_session.execute = AsyncMock(return_value=mock_result)

            response = client.post("/internal/tasks/resume/parse", json=payload)
            assert response.status_code == 200
            data = response.json()
            assert data["error"]["code"] == "DOCUMENT_SECURITY_ERROR"


def test_resume_parse_ai_provider_error_returns_503(test_app):
    client = TestClient(test_app)
    payload = ResumeParseTaskPayload(schema_version=1, event_id="e3", aggregate_id="j3", trace_id="t3").model_dump()

    with (
        patch("app.core.database.DatabaseManager.initialize", new_callable=AsyncMock),
        patch("app.repositories.processed_events_repo.ProcessedEventsRepository.is_processed", new_callable=AsyncMock) as mock_is_processed,
        patch("app.repositories.parsing_job_repo.ResumeParsingJobRepository.claim_job", new_callable=AsyncMock) as mock_claim,
        patch("app.api.v1.task_handlers._get_llm_provider") as mock_llm_factory,
        patch("app.services.document_extractor.DocumentExtractor.extract_from_bytes") as mock_extract,
        patch("app.services.document_extractor.DocumentExtractor._validate_size") as mock_validate_size,
        patch("app.services.document_extractor.DocumentExtractor._validate_magic_bytes") as mock_validate_magic,
        patch("app.storage.supabase_storage.SupabaseStorageClient.download", new_callable=AsyncMock) as mock_download,
    ):
        mock_is_processed.return_value = False
        mock_claim.return_value = {"id": "j3", "document_id": "d3"}

        mock_llm = AsyncMock()
        mock_llm.generate_structured = AsyncMock(side_effect=AIProviderError("gemini", "rate limit", retryable=True))
        mock_llm_factory.return_value = mock_llm

        mock_extract.return_value = MagicMock(
            extracted_text="test",
            raw_ai_output={},
            validation_result={},
            overall_confidence=100.0,
        )
        mock_download.return_value = ("resume.txt", b"test content")

        with patch("app.api.v1.task_handlers.get_db_manager") as mock_db:
            mock_session = AsyncMock()
            mock_db.return_value.transaction = MagicMock(return_value=_AsyncContextManager(mock_session))
            mock_db.return_value.session_maker = MagicMock(return_value=_AsyncContextManager(mock_session))
            doc_result = MagicMock()
            doc_result.mappings.return_value.first.return_value = {"storage_path": "uploads/d3", "security_scan_status": "clean"}
            candidate_result = MagicMock()
            candidate_result.mappings.return_value.first.return_value = {"candidate_id": "cand-1"}
            mock_session.execute = AsyncMock(side_effect=[doc_result, candidate_result, MagicMock()])

            response = client.post("/internal/tasks/resume/parse", json=payload)
            assert response.status_code == 503
            data = response.json()
            assert data["error"]["code"] == "AI_PROVIDER_ERROR"


def test_resume_parse_unexpected_error_returns_500(test_app):
    client = TestClient(test_app)
    payload = ResumeParseTaskPayload(schema_version=1, event_id="e4", aggregate_id="j4", trace_id="t4").model_dump()

    with (
        patch("app.core.database.DatabaseManager.initialize", new_callable=AsyncMock),
        patch("app.repositories.processed_events_repo.ProcessedEventsRepository.is_processed", new_callable=AsyncMock) as mock_is_processed,
        patch("app.repositories.parsing_job_repo.ResumeParsingJobRepository.claim_job", new_callable=AsyncMock) as mock_claim,
    ):
        mock_is_processed.return_value = False
        mock_claim.side_effect = RuntimeError("DB down")

        with patch("app.api.v1.task_handlers.get_db_manager") as mock_db:
            mock_db.return_value.session_maker = MagicMock(return_value=_AsyncContextManager(AsyncMock()))

            with pytest.raises(RuntimeError, match="DB down"):
                client.post("/internal/tasks/resume/parse", json=payload)
