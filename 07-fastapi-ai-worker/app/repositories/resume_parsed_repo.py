"""Repository for immutable writes to resume parsing tables."""

from __future__ import annotations

from typing import Any, AsyncGenerator, Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import DatabaseManager


class ResumeParsedRepository:
    """Persist parsed resume result, artifact metadata, and event timeline."""

    def __init__(self, db_manager: DatabaseManager) -> None:
        self.db_manager = db_manager

    async def _with_session(
        self, session: Optional[AsyncSession] = None
    ) -> AsyncGenerator[AsyncSession, None]:
        if session is not None:
            yield session
            return
        async with self.db_manager.session_maker() as s:
            yield s

    async def insert_parsed_result(
        self,
        *,
        parsing_job_id: str,
        document_id: str,
        extracted_text: str,
        raw_ai_output: dict[str, Any],
        normalized_output: dict[str, Any],
        confidence_details: dict[str, Any],
        validation_result: dict[str, Any],
        overall_confidence: float,
        schema_version: str,
        session: Optional[AsyncSession] = None,
    ) -> str:
        """Insert immutable parsed result row."""
        query = """
            INSERT INTO resume_parsed_data (
                parsing_job_id, document_id, extracted_text, raw_ai_output,
                normalized_output, confidence_details, validation_result,
                overall_confidence, schema_version
            ) VALUES (
                :parsing_job_id, :document_id, :extracted_text, :raw_ai_output,
                :normalized_output, :confidence_details, :validation_result,
                :overall_confidence, :schema_version
            )
            RETURNING id
        """

        async for s in self._with_session(session):
            try:
                result = await s.execute(
                    text(query),
                    {
                        "parsing_job_id": parsing_job_id,
                        "document_id": document_id,
                        "extracted_text": extracted_text,
                        "raw_ai_output": raw_ai_output,
                        "normalized_output": normalized_output,
                        "confidence_details": confidence_details,
                        "validation_result": validation_result,
                        "overall_confidence": overall_confidence,
                        "schema_version": schema_version,
                    },
                )
                row = result.mappings().first()
                return str(row["id"]) if row else ""
            except Exception:
                if session is None:
                    await s.rollback()
                raise

    async def insert_artifact(
        self,
        *,
        parsing_job_id: str,
        artifact_type: str,
        inline_data: dict[str, Any],
        checksum_sha256: str | None = None,
        session: Optional[AsyncSession] = None,
    ) -> None:
        query = """
            INSERT INTO resume_parsing_artifacts (
                parsing_job_id, artifact_type, inline_data, checksum_sha256
            ) VALUES (
                :parsing_job_id, :artifact_type, :inline_data, :checksum_sha256
            )
        """

        async for s in self._with_session(session):
            try:
                await s.execute(
                    text(query),
                    {
                        "parsing_job_id": parsing_job_id,
                        "artifact_type": artifact_type,
                        "inline_data": inline_data,
                        "checksum_sha256": checksum_sha256,
                    },
                )
            except Exception:
                if session is None:
                    await s.rollback()
                raise

    async def insert_event(
        self,
        *,
        parsing_job_id: str,
        event_type: str,
        event_data: dict[str, Any],
        session: Optional[AsyncSession] = None,
    ) -> None:
        query = """
            INSERT INTO resume_parsing_job_events (
                parsing_job_id, event_type, event_data
            ) VALUES (
                :parsing_job_id, :event_type, :event_data
            )
        """

        async for s in self._with_session(session):
            try:
                await s.execute(
                    text(query),
                    {
                        "parsing_job_id": parsing_job_id,
                        "event_type": event_type,
                        "event_data": event_data,
                    },
                )
            except Exception:
                if session is None:
                    await s.rollback()
                raise
