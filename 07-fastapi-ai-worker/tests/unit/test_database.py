"""Unit tests for DatabaseManager initialization."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
from sqlalchemy.engine import Engine

from app.core.database import DatabaseManager


def test_database_manager_initialization():
    db_manager = DatabaseManager.__new__(DatabaseManager)
    db_manager.settings = MagicMock()
    db_manager.settings.DATABASE_URL = "postgresql+asyncpg://test:test@localhost:5432/test"
    db_manager.settings.DATABASE_MAX_POOL_SIZE = 5
    db_manager.engine = None
    db_manager.session_maker = None
    db_manager._pool = None
    
    mock_engine = MagicMock(spec=Engine)
    mock_session_maker = MagicMock()
    
    with patch("app.core.database.create_async_engine", return_value=mock_engine) as mock_create_engine, \
         patch("app.core.database.async_sessionmaker", return_value=mock_session_maker):
        
        import asyncio
        asyncio.run(db_manager.initialize())
        
        mock_create_engine.assert_called_once()
        assert db_manager.engine is mock_engine
        assert db_manager.session_maker is mock_session_maker


def test_database_manager_session_maker_property():
    db_manager = DatabaseManager.__new__(DatabaseManager)
    db_manager.session_maker = None
    assert db_manager.session_maker is None
    
    mock_session_maker = MagicMock()
    db_manager.session_maker = mock_session_maker
    assert db_manager.session_maker is mock_session_maker
