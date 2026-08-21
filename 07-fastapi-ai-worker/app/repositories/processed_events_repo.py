"""Repository for processed_events idempotency records."""

from __future__ import annotations

import json
from typing import Any, AsyncGenerator, Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import DatabaseManager


class ProcessedEventsRepository:
    """Manage processed_events idempotency records."""

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

    async def record_processed(
        self,
        consumer_name: str,
        event_id: str,
        result_metadata: dict[str, Any],
        session: Optional[AsyncSession] = None,
    ) -> bool:
        """
        Record that an event was processed.
        
        Returns True if inserted, False if already exists.
        """
        query = """
        INSERT INTO processed_events (consumer_name, event_id, result_metadata)
        VALUES (:consumer_name, :event_id, :result_metadata)
        ON CONFLICT (consumer_name, event_id) DO NOTHING
        """

        async for s in self._with_session(session):
            try:
                result = await s.execute(
                    text(query),
                    {
                        "consumer_name": consumer_name,
                        "event_id": event_id,
                        "result_metadata": json.dumps(result_metadata) if isinstance(result_metadata, dict) else result_metadata,
                    },
                )
                return result.rowcount > 0
            except Exception:
                if session is None:
                    await s.rollback()
                raise

    async def is_processed(self, consumer_name: str, event_id: str) -> bool:
        """Check if event was already processed."""
        query = """
        SELECT 1 FROM processed_events
        WHERE consumer_name = :consumer_name AND event_id = :event_id
        """

        async with self.db_manager.session_maker() as session:
            try:
                result = await session.execute(
                    text(query),
                    {"consumer_name": consumer_name, "event_id": event_id},
                )
                return result.first() is not None
            finally:
                await session.close()
