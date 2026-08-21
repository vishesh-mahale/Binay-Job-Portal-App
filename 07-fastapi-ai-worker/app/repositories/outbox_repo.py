"""Repository for outbox_events transactional inserts."""

from __future__ import annotations

import json
from typing import Any, AsyncGenerator, Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import DatabaseManager


class OutboxRepository:
    """Insert chained outbox events in same transaction."""

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

    async def emit_event(
        self,
        aggregate_type: str,
        aggregate_id: str,
        event_type: str,
        payload: dict[str, Any],
        schema_version: int = 1,
        session: Optional[AsyncSession] = None,
    ) -> str:
        """
        Emit a new outbox event.
        
        Returns event_id.
        """
        query = """
        INSERT INTO outbox_events (
            aggregate_type, aggregate_id, event_type, schema_version, payload,
            occurred_at, status, available_at
        )
        VALUES (
            :aggregate_type, :aggregate_id, :event_type, :schema_version, :payload,
            NOW(), 'pending', NOW()
        )
        RETURNING id
        """

        async for s in self._with_session(session):
            try:
                result = await s.execute(
                    text(query),
                    {
                        "aggregate_type": aggregate_type,
                        "aggregate_id": aggregate_id,
                        "event_type": event_type,
                        "schema_version": schema_version,
                        "payload": json.dumps(payload) if isinstance(payload, dict) else payload,
                    },
                )
                row = result.mappings().first()
                return str(row["id"]) if row else ""
            except Exception:
                if session is None:
                    await s.rollback()
                raise
