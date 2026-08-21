"""Repository for resume_parsing_jobs claim and status updates."""

from __future__ import annotations

import json
from typing import Any, AsyncGenerator, Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import DatabaseManager


class ResumeParsingJobRepository:
    """Manage job claim and completion state for resume parsing."""

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

    async def claim_job(
        self,
        job_id: str,
        worker_id: str,
    ) -> Optional[dict[str, Any]]:
        """Atomically claim a queued or retryable parsing job."""
        query = """
            UPDATE resume_parsing_jobs
            SET status = 'processing',
                locked_by = :worker_id,
                locked_at = NOW(),
                started_at = COALESCE(started_at, NOW()),
                attempt_number = attempt_number + 1,
                updated_at = NOW()
            WHERE id = :job_id
              AND status NOT IN ('completed', 'cancelled')
              AND (locked_at IS NULL OR locked_at < NOW() - INTERVAL '10 minutes')
            RETURNING id, document_id, status, attempt_number, max_attempts, locked_by, locked_at
        """

        async with self.db_manager.session_maker() as session:
            try:
                result = await session.execute(text(query), {"job_id": job_id, "worker_id": worker_id})
                await session.commit()
                row = result.mappings().first()
                if row is None:
                    return None
                return dict(row)
            except Exception:
                await session.rollback()
                raise
            finally:
                await session.close()

    async def mark_failed(
        self, job_id: str, error_details: dict[str, Any], session: Optional[AsyncSession] = None
    ) -> None:
        """Mark a parsing job as failed."""
        query = """
            UPDATE resume_parsing_jobs
            SET status = 'failed',
                failed_at = NOW(),
                locked_at = NULL,
                locked_by = NULL,
                error_details = :error_details,
                updated_at = NOW()
            WHERE id = :job_id
        """

        async for s in self._with_session(session):
            try:
                err_payload = json.dumps(error_details) if isinstance(error_details, dict) else error_details
                await s.execute(text(query), {"job_id": job_id, "error_details": err_payload})
            except Exception:
                if session is None:
                    await s.rollback()
                raise

    async def mark_completed(self, job_id: str, session: Optional[AsyncSession] = None) -> None:
        """Mark a parsing job as completed."""
        query = """
            UPDATE resume_parsing_jobs
            SET status = 'completed',
                completed_at = NOW(),
                locked_at = NULL,
                locked_by = NULL,
                updated_at = NOW()
            WHERE id = :job_id
        """

        async for s in self._with_session(session):
            try:
                await s.execute(text(query), {"job_id": job_id})
            except Exception:
                if session is None:
                    await s.rollback()
                raise

    async def release_claim(self, job_id: str, session: Optional[AsyncSession] = None) -> None:
        """Release an in-progress claim without marking terminal."""
        query = """
            UPDATE resume_parsing_jobs
            SET locked_at = NULL,
                locked_by = NULL,
                updated_at = NOW()
            WHERE id = :job_id AND status = 'processing'
        """

        async for s in self._with_session(session):
            try:
                await s.execute(text(query), {"job_id": job_id})
            except Exception:
                if session is None:
                    await s.rollback()
                raise
