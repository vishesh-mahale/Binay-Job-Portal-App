"""Repository for analytics_events idempotent inserts."""

from __future__ import annotations

import json
from typing import Any, AsyncGenerator, Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import DatabaseManager


class AnalyticsRepository:
    """Emit idempotent analytics events."""

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

    async def emit(
        self,
        event_name: str,
        event_category: str,
        source: str = "fastapi",
        user_id: Optional[str] = None,
        company_id: Optional[str] = None,
        entity_type: Optional[str] = None,
        entity_id: Optional[str] = None,
        event_data: Optional[dict[str, Any]] = None,
        trace_id: Optional[str] = None,
        session: Optional[AsyncSession] = None,
    ) -> bool:
        """
        Insert analytics event idempotently.

        Returns True if inserted, False if duplicate.
        """
        import uuid

        idempotency_key = f"{event_name}:{entity_id or ''}:{trace_id or ''}:{uuid.uuid4().hex[:8]}"
        query = """
        INSERT INTO analytics_events (
            idempotency_key, user_id, company_id, request_id, trace_id,
            event_name, event_category, source, entity_type, entity_id, event_data
        )
        VALUES (
            :idempotency_key, :user_id, :company_id, :request_id, :trace_id,
            :event_name, :event_category, :source, :entity_type, :entity_id, :event_data
        )
        ON CONFLICT (idempotency_key) DO NOTHING
        """

        payload_json = json.dumps(event_data or {}) if isinstance(event_data or {}, dict) else (event_data or {})

        async for s in self._with_session(session):
            try:
                result = await s.execute(
                    text(query),
                    {
                        "idempotency_key": idempotency_key,
                        "user_id": user_id,
                        "company_id": company_id,
                        "request_id": None,
                        "trace_id": trace_id,
                        "event_name": event_name,
                        "event_category": event_category,
                        "source": source,
                        "entity_type": entity_type,
                        "entity_id": entity_id,
                        "event_data": payload_json,
                    },
                )
                rowcount = getattr(result, "rowcount", 0) or 0
                try:
                    return bool(rowcount > 0)
                except TypeError:
                    return False
            except Exception:
                if session is None:
                    await s.rollback()
                raise
