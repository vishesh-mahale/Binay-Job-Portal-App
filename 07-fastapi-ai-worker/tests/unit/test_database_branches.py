"""Unit tests for DatabaseManager branches."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.core.database import DatabaseManager


class _AsyncContextManager:
    def __init__(self, session):
        self._session = session

    async def __aenter__(self):
        return self._session

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        return False


def test_get_session_without_init():
    db_manager = DatabaseManager.__new__(DatabaseManager)
    db_manager.session_maker = None

    with pytest.raises(RuntimeError, match="Database not initialized"):
        import asyncio
        asyncio.run(_enter_context_manager(db_manager.get_session()))


def test_transaction_without_init():
    db_manager = DatabaseManager.__new__(DatabaseManager)
    db_manager.session_maker = None

    with pytest.raises(RuntimeError, match="Database not initialized"):
        import asyncio
        asyncio.run(_enter_context_manager(db_manager.transaction()))


async def _enter_context_manager(cm):
    async with cm:
        pass


@pytest.mark.asyncio
async def test_execute_raw():
    db_manager = DatabaseManager.__new__(DatabaseManager)
    db_manager.settings = MagicMock()
    db_manager.settings.DATABASE_URL = "postgresql+asyncpg://test:test@localhost:5432/test"
    db_manager.settings.DATABASE_MAX_POOL_SIZE = 5
    db_manager.engine = None
    db_manager.session_maker = None
    db_manager._pool = None

    mock_session = AsyncMock()
    mock_result = MagicMock()
    mock_result.__iter__ = MagicMock(return_value=iter([{"id": 1}, {"id": 2}]))
    mock_session.execute = AsyncMock(return_value=mock_result)

    mock_session_maker = MagicMock(return_value=_AsyncContextManager(mock_session))

    with patch("app.core.database.create_async_engine") as mock_create_engine, \
         patch("app.core.database.async_sessionmaker", return_value=mock_session_maker):
        db_manager.session_maker = mock_session_maker
        rows = await db_manager.execute_raw("SELECT * FROM test")
        assert rows == [{"id": 1}, {"id": 2}]


@pytest.mark.asyncio
async def test_insert_processed_event_success():
    db_manager = DatabaseManager.__new__(DatabaseManager)
    db_manager.settings = MagicMock()
    db_manager.settings.DATABASE_URL = "postgresql+asyncpg://test:test@localhost:5432/test"
    db_manager.settings.DATABASE_MAX_POOL_SIZE = 5
    db_manager.engine = None
    db_manager.session_maker = None
    db_manager._pool = None

    mock_session = AsyncMock()
    mock_session.execute = AsyncMock()
    mock_session.commit = AsyncMock()

    mock_session_maker = MagicMock(return_value=_AsyncContextManager(mock_session))

    with patch("app.core.database.create_async_engine") as mock_create_engine, \
         patch("app.core.database.async_sessionmaker", return_value=mock_session_maker):
        db_manager.session_maker = mock_session_maker
        await db_manager.insert_processed_event("consumer-1", "event-1", {"status": "ok"})
        mock_session.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_acquire_processing_lease_success():
    db_manager = DatabaseManager.__new__(DatabaseManager)
    db_manager.settings = MagicMock()
    db_manager.settings.DATABASE_URL = "postgresql+asyncpg://test:test@localhost:5432/test"
    db_manager.settings.DATABASE_MAX_POOL_SIZE = 5
    db_manager.engine = None
    db_manager.session_maker = None
    db_manager._pool = None

    mock_session = AsyncMock()
    mock_result = MagicMock()
    mock_result.rowcount = 1
    mock_session.execute = AsyncMock(return_value=mock_result)

    mock_session_maker = MagicMock(return_value=_AsyncContextManager(mock_session))

    with patch("app.core.database.create_async_engine") as mock_create_engine, \
         patch("app.core.database.async_sessionmaker", return_value=mock_session_maker):
        db_manager.session_maker = mock_session_maker
        result = await db_manager.acquire_processing_lease(
            lease_key="key-1",
            consumer_name="consumer-1",
            event_id="event-1",
            worker_id="worker-1",
        )
        assert result is True


@pytest.mark.asyncio
async def test_acquire_processing_lease_conflict():
    db_manager = DatabaseManager.__new__(DatabaseManager)
    db_manager.settings = MagicMock()
    db_manager.settings.DATABASE_URL = "postgresql+asyncpg://test:test@localhost:5432/test"
    db_manager.settings.DATABASE_MAX_POOL_SIZE = 5
    db_manager.engine = None
    db_manager.session_maker = None
    db_manager._pool = None

    mock_session = AsyncMock()
    mock_result = MagicMock()
    mock_result.rowcount = 0
    mock_session.execute = AsyncMock(return_value=mock_result)

    mock_session_maker = MagicMock(return_value=_AsyncContextManager(mock_session))

    with patch("app.core.database.create_async_engine") as mock_create_engine, \
         patch("app.core.database.async_sessionmaker", return_value=mock_session_maker):
        db_manager.session_maker = mock_session_maker
        result = await db_manager.acquire_processing_lease(
            lease_key="key-1",
            consumer_name="consumer-1",
            event_id="event-1",
            worker_id="worker-1",
        )
        assert result is False


@pytest.mark.asyncio
async def test_release_processing_lease():
    db_manager = DatabaseManager.__new__(DatabaseManager)
    db_manager.settings = MagicMock()
    db_manager.settings.DATABASE_URL = "postgresql+asyncpg://test:test@localhost:5432/test"
    db_manager.settings.DATABASE_MAX_POOL_SIZE = 5
    db_manager.engine = None
    db_manager.session_maker = None
    db_manager._pool = None

    mock_session = AsyncMock()
    mock_session.execute = AsyncMock()

    mock_session_maker = MagicMock(return_value=_AsyncContextManager(mock_session))

    with patch("app.core.database.create_async_engine") as mock_create_engine, \
         patch("app.core.database.async_sessionmaker", return_value=mock_session_maker):
        db_manager.session_maker = mock_session_maker
        await db_manager.release_processing_lease(lease_key="key-1")
        mock_session.execute.assert_awaited_once()
