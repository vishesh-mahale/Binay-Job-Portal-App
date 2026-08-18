"""Resume parsing domain service."""

from __future__ import annotations

from typing import Any, Dict

from app.core.config import get_settings
from app.providers.base import LLMProvider, EmbeddingProvider
from app.repositories.parsing_job_repo import ResumeParsingJobRepository
from app.repositories.resume_parsed_repo import ResumeParsedRepository
from app.repositories.processed_events_repo import ProcessedEventsRepository
from app.repositories.outbox_repo import OutboxRepository
from app.schemas.resume_parser import ResumeExtractedSchema
from app.services.document_extractor import DocumentExtractor
from app.storage.supabase_storage import SupabaseStorageClient


class ResumeParsingService:
    """Orchestrate resume parsing from document download to immutable persistence."""

    def __init__(
        self,
        llm: LLMProvider,
        embedding_provider: EmbeddingProvider,
        db_manager,
        settings=None,
    ) -> None:
        self.llm = llm
        self.embedding_provider = embedding_provider
        self.db_manager = db_manager
        self.settings = settings or get_settings()

    async def parse_resume(self, parsing_job_id: str, document_id: str) -> dict[str, Any]:
        raise NotImplementedError("Resume parsing orchestration is handled inline in task_handlers.py")
