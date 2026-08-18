"""Unit tests for DatabaseManager shutdown and session paths."""

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


@pytest.mark.asyncio
async def test_shutdown_disposes_engine():
    db_manager = DatabaseManager.__new__(DatabaseManager)
    db_manager.engine = AsyncMock()
    db_manager.engine.dispose = AsyncMock()

    await db_manager.shutdown()

    db_manager.engine.dispose.assert_awaited_once()


@pytest.mark.asyncio
async def test_shutdown_without_engine():
    db_manager = DatabaseManager.__new__(DatabaseManager)
    db_manager.engine = None

    await db_manager.shutdown()


@pytest.mark.asyncio
async def test_get_session_success():
    db_manager = DatabaseManager.__new__(DatabaseManager)
    db_manager.settings = MagicMock()
    db_manager.settings.DATABASE_URL = "postgresql+asyncpg://test:test@localhost:5432/test"
    db_manager.settings.DATABASE_MAX_POOL_SIZE = 5
    db_manager.engine = None
    db_manager.session_maker = None
    db_manager._pool = None

    mock_session = AsyncMock()
    mock_session_maker = MagicMock(return_value=_AsyncContextManager(mock_session))

    with patch("app.core.database.create_async_engine") as mock_create_engine, \
         patch("app.core.database.async_sessionmaker", return_value=mock_session_maker):
        db_manager.session_maker = mock_session_maker
        async with db_manager.get_session() as session:
            assert session is mock_session


@pytest.mark.asyncio
async def test_transaction_success():
    db_manager = DatabaseManager.__new__(DatabaseManager)
    db_manager.settings = MagicMock()
    db_manager.settings.DATABASE_URL = "postgresql+asyncpg://test:test@localhost:5432/test"
    db_manager.settings.DATABASE_MAX_POOL_SIZE = 5
    db_manager.engine = None
    db_manager.session_maker = None
    db_manager._pool = None

    mock_session = AsyncMock()
    mock_session.commit = AsyncMock()
    mock_session_maker = MagicMock(return_value=_AsyncContextManager(mock_session))

    with patch("app.core.database.create_async_engine") as mock_create_engine, \
         patch("app.core.database.async_sessionmaker", return_value=mock_session_maker):
        db_manager.session_maker = mock_session_maker
        async with db_manager.transaction() as session:
            assert session is mock_session
        mock_session.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_transaction_rollback_on_error():
    db_manager = DatabaseManager.__new__(DatabaseManager)
    db_manager.settings = MagicMock()
    db_manager.settings.DATABASE_URL = "postgresql+asyncpg://test:test@localhost:5432/test"
    db_manager.settings.DATABASE_MAX_POOL_SIZE = 5
    db_manager.engine = None
    db_manager.session_maker = None
    db_manager._pool = None

    mock_session = AsyncMock()
    mock_session.rollback = AsyncMock()
    mock_session_maker = MagicMock(return_value=_AsyncContextManager(mock_session))

    with patch("app.core.database.create_async_engine") as mock_create_engine, \
         patch("app.core.database.async_sessionmaker", return_value=mock_session_maker):
        db_manager.session_maker = mock_session_maker
        with pytest.raises(RuntimeError, match="test error"):
            async with db_manager.transaction() as session:
                raise RuntimeError("test error")
        mock_session.rollback.assert_awaited_once()
