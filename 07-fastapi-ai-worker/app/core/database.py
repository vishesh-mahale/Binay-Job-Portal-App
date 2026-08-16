"""
Async PostgreSQL database connection management.
Uses asyncpg for performance and SQLAlchemy for ORM/query building.
"""

from typing import Optional, AsyncGenerator
import logging

from sqlalchemy.ext.asyncio import (
    create_async_engine,
    AsyncSession,
    async_sessionmaker,
    AsyncEngine,
)
from sqlalchemy.pool import NullPool
import asyncpg

from app.core.config import Settings


logger = logging.getLogger(__name__)


class DatabaseManager:
    """Manages async database connections and session lifecycle."""

    def __init__(self, settings: Settings):
        """
        Initialize database manager.
        
        Args:
            settings: Application settings
        """
        self.settings = settings
        self.engine: Optional[AsyncEngine] = None
        self.session_maker: Optional[async_sessionmaker] = None
        self._pool: Optional[asyncpg.pool.Pool] = None

    async def initialize(self) -> None:
        """
        Initialize database engine and connection pool.
        
        Must be called during app startup.
        
        Raises:
            Exception: If database connection fails
        """
        logger.info("Initializing database engine", url=self.settings.DATABASE_URL[:50] + "...")
        
        try:
            # Create async SQLAlchemy engine
            # Using NullPool because Cloud Run is ephemeral; no persistent connections
            self.engine = create_async_engine(
                self.settings.DATABASE_URL,
                echo=False,  # Set to True for SQL query logging
                pool_size=self.settings.DATABASE_MAX_POOL_SIZE,
                max_overflow=10,
                pool_pre_ping=True,  # Verify connection before using
                pool_recycle=3600,  # Recycle connections after 1 hour
                poolclass=NullPool,  # Ephemeral pool for serverless
                connect_args={
                    "server_settings": {
                        "application_name": "fastapi-ai-worker",
                        "statement_timeout": str(self.settings.DATABASE_STATEMENT_TIMEOUT_SECONDS * 1000),
                    },
                    "command_timeout": self.settings.DATABASE_COMMAND_TIMEOUT_SECONDS,
                },
            )
            
            # Create async session factory
            self.session_maker = async_sessionmaker(
                self.engine,
                class_=AsyncSession,
                expire_on_commit=False,
                autoflush=False,
            )
            
            # Test connection
            async with self.engine.begin() as conn:
                await conn.execute(__import__("sqlalchemy").text("SELECT 1"))
            
            logger.info("Database initialized successfully")
            
        except Exception as e:
            logger.error("Failed to initialize database", error=str(e), exc_info=True)
            raise

    async def shutdown(self) -> None:
        """
        Shutdown database engine and close all connections.
        
        Must be called during app shutdown.
        """
        logger.info("Shutting down database engine")
        
        if self.engine:
            await self.engine.dispose()
            logger.info("Database engine disposed")

    async def get_session(self) -> AsyncGenerator[AsyncSession, None]:
        """
        Get async database session (async context manager).
        
        Usage:
            async with db_manager.get_session() as session:
                result = await session.execute(query)
        
        Yields:
            AsyncSession
        """
        if not self.session_maker:
            raise RuntimeError("Database not initialized; call initialize() first")
        
        async with self.session_maker() as session:
            try:
                yield session
            except Exception as e:
                await session.rollback()
                logger.error("Database session error", error=str(e), exc_info=True)
                raise
            finally:
                await session.close()

    async def execute_raw(self, query: str, params: Optional[dict] = None) -> list[dict]:
        """
        Execute raw SQL query.
        
        Args:
            query: SQL query string
            params: Optional parameters dict
            
        Returns:
            List of result rows as dicts
        """
        async with self.session_maker() as session:
            try:
                result = await session.execute(
                    __import__("sqlalchemy").text(query),
                    params or {}
                )
                return [dict(row) for row in result]
            finally:
                await session.close()

    async def insert_processed_event(self, consumer_name: str, event_id: str, result_metadata: dict) -> None:
        """
        Insert idempotency record in processed_events.
        
        Args:
            consumer_name: Consumer/processor name (e.g., 'resume_parser')
            event_id: Event UUID
            result_metadata: Result metadata JSONB object
        """
        query = """
        INSERT INTO processed_events (consumer_name, event_id, result_metadata)
        VALUES (:consumer_name, :event_id, :result_metadata)
        ON CONFLICT (consumer_name, event_id) DO NOTHING
        """
        
        async with self.session_maker() as session:
            try:
                await session.execute(
                    __import__("sqlalchemy").text(query),
                    {
                        "consumer_name": consumer_name,
                        "event_id": event_id,
                        "result_metadata": __import__("json").dumps(result_metadata),
                    }
                )
                await session.commit()
                logger.debug("Processed event recorded", consumer_name=consumer_name, event_id=event_id)
            except Exception as e:
                await session.rollback()
                logger.error(
                    "Failed to insert processed event",
                    consumer_name=consumer_name,
                    event_id=event_id,
                    error=str(e)
                )
                raise
            finally:
                await session.close()

    async def acquire_processing_lease(
        self,
        lease_key: str,
        consumer_name: str,
        event_id: str,
        worker_id: str,
        lease_duration_seconds: int = 300,
    ) -> bool:
        """
        Acquire processing lease (atomic).
        
        Args:
            lease_key: Unique lease key (e.g., 'candidate_projection:candidate_id')
            consumer_name: Consumer name (e.g., 'candidate_projection')
            event_id: Event UUID
            worker_id: Worker identifier
            lease_duration_seconds: Lease TTL
            
        Returns:
            True if lease acquired, False if already locked by another worker
        """
        query = """
        INSERT INTO event_processing_leases (lease_key, consumer_name, event_id, expires_at, worker_id)
        VALUES (:lease_key, :consumer_name, :event_id, NOW() + INTERVAL ':duration seconds', :worker_id)
        ON CONFLICT (lease_key) DO NOTHING
        """
        
        async with self.session_maker() as session:
            try:
                result = await session.execute(
                    __import__("sqlalchemy").text(query),
                    {
                        "lease_key": lease_key,
                        "consumer_name": consumer_name,
                        "event_id": event_id,
                        "duration": lease_duration_seconds,
                        "worker_id": worker_id,
                    }
                )
                await session.commit()
                rows_affected = result.rowcount if hasattr(result, 'rowcount') else 1
                acquired = rows_affected > 0
                logger.debug("Lease acquisition attempt", lease_key=lease_key, acquired=acquired)
                return acquired
            except Exception as e:
                await session.rollback()
                logger.error("Failed to acquire lease", lease_key=lease_key, error=str(e))
                raise
            finally:
                await session.close()

    async def release_processing_lease(self, lease_key: str) -> None:
        """
        Release processing lease.
        
        Args:
            lease_key: Lease key to release
        """
        query = "DELETE FROM event_processing_leases WHERE lease_key = :lease_key"
        
        async with self.session_maker() as session:
            try:
                await session.execute(
                    __import__("sqlalchemy").text(query),
                    {"lease_key": lease_key}
                )
                await session.commit()
                logger.debug("Lease released", lease_key=lease_key)
            except Exception as e:
                await session.rollback()
                logger.error("Failed to release lease", lease_key=lease_key, error=str(e))
                raise
            finally:
                await session.close()


# Global database manager instance
_db_manager: Optional[DatabaseManager] = None


def get_db_manager(settings: Settings) -> DatabaseManager:
    """Get or create database manager."""
    global _db_manager
    if _db_manager is None:
        _db_manager = DatabaseManager(settings)
    return _db_manager
