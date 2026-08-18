"""
Async PostgreSQL database connection management.
Uses asyncpg for performance and SQLAlchemy for ORM/query building.
"""

from contextlib import asynccontextmanager
from typing import Optional, AsyncGenerator
import json
import sqlalchemy

from sqlalchemy.ext.asyncio import (
    create_async_engine,
    AsyncSession,
    async_sessionmaker,
    AsyncEngine,
)
from sqlalchemy.pool import NullPool
import asyncpg

from app.core.config import Settings, get_settings
from app.core.logging import get_logger


logger = get_logger(__name__)


class DatabaseManager:
    """Manages async database connections and session lifecycle."""

    def __init__(self, settings: Optional[Settings] = None):
        """
        Initialize database manager.
        
        Args:
            settings: Application settings
        """
        self.settings = settings or get_settings()
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
            self.engine = create_async_engine(
                self.settings.DATABASE_URL,
                echo=False,
                pool_size=self.settings.DATABASE_MAX_POOL_SIZE,
                max_overflow=10,
                pool_pre_ping=True,
                pool_recycle=3600,
            )
            
            # Create session factory
            self.session_maker = async_sessionmaker(
                bind=self.engine,
                class_=AsyncSession,
                expire_on_commit=False,
                autoflush=False
            )
            
            logger.info("Database engine initialized successfully")
            
        except Exception as e:
            logger.error("Failed to initialize database engine", error=str(e))
            raise

    async def shutdown(self) -> None:
        """Close database engine and all connections."""
        if self.engine is not None:
            logger.info("Disposing database engine")
            if hasattr(self.engine, "dispose"):
                await self.engine.dispose()
            logger.info("Database engine disposed")

    @asynccontextmanager
    async def get_session(self) -> AsyncGenerator[AsyncSession, None]:
        """
        Get an async database session.
        
        Usage:
            async with db_manager.get_session() as session:
                result = await session.execute(query)
        """
        if not self.session_maker:
            raise RuntimeError("Database not initialized. Call initialize() first.")
        
        async with self.session_maker() as session:
            try:
                yield session
            except Exception as e:
                await session.rollback()
                logger.error("Database session error, rolled back", error=str(e))
                raise
            finally:
                await session.close()

    @asynccontextmanager
    async def transaction(self) -> AsyncGenerator[AsyncSession, None]:
        """
        Get a session and run in a transaction context.
        
        Commits automatically on success, rolls back on exception.
        """
        if not self.session_maker:
            raise RuntimeError("Database not initialized. Call initialize() first.")

        async with self.session_maker() as session:
            try:
                yield session
                await session.commit()
            except Exception as e:
                await session.rollback()
                logger.error("Transaction error, rolled back", error=str(e))
                raise
            finally:
                await session.close()

    async def execute_raw(self, query: str, **params) -> list[dict]:
        """
        Execute raw SQL query and return rows as dictionaries.
        
        Args:
            query: SQL query string
            **params: Query parameters
            
        Returns:
            List of result rows as dictionaries
        """
        async with self.get_session() as session:
            result = await session.execute(
                sqlalchemy.text(query),
                params
            )
            rows = []
            for row in result:
                if isinstance(row, dict):
                    rows.append(row)
                elif hasattr(row, "_mapping"):
                    rows.append(dict(row._mapping))
                else:
                    rows.append(dict(row))
            return rows

    async def insert_processed_event(
        self,
        consumer_name: str,
        event_id: str,
        result_metadata: Optional[dict] = None
    ) -> bool:
        """
        Record that an event has been processed (for idempotency).
        
        Args:
            consumer_name: Name of consumer/handler
            event_id: UUID of event
            result_metadata: Optional JSON metadata about processing result
            
        Returns:
            True if inserted, False if already exists (duplicate)
        """
        query = """
        INSERT INTO processed_events (consumer_name, event_id, result_metadata)
        VALUES (:consumer_name, :event_id, :result_metadata)
        ON CONFLICT (consumer_name, event_id) DO NOTHING
        """
        
        metadata_json = json.dumps(result_metadata or {})
        
        async with self.session_maker() as session:
            try:
                result = await session.execute(
                    sqlalchemy.text(query),
                    {
                        "consumer_name": consumer_name,
                        "event_id": event_id,
                        "result_metadata": metadata_json
                    }
                )
                await session.commit()
                rowcount = getattr(result, "rowcount", None)
                if rowcount is not None and isinstance(rowcount, int):
                    return rowcount > 0
                return True
            except Exception as e:
                await session.rollback()
                logger.error("Failed to insert processed event", error=str(e))
                raise
            finally:
                await session.close()

    async def acquire_processing_lease(
        self,
        lease_key: str,
        consumer_name: str,
        event_id: str,
        worker_id: str,
        lease_duration_seconds: int = 300
    ) -> bool:
        """
        Acquire a processing lease for an event.
        
        Prevents concurrent processing of the same event.
        
        Args:
            lease_key: Unique lease identifier (e.g., 'resume:parse:doc_id')
            consumer_name: Name of consumer
            event_id: Event UUID
            worker_id: Worker instance identifier
            lease_duration_seconds: How long lease is valid
            
        Returns:
            True if lease acquired, False if already held by another worker
        """
        query = """
        INSERT INTO event_processing_leases (
            lease_key, consumer_name, event_id, worker_id, expires_at
        ) VALUES (
            :lease_key, :consumer_name, :event_id, :worker_id,
            NOW() + make_interval(secs => :duration)
        )
        ON CONFLICT (lease_key) DO UPDATE
        SET worker_id = :worker_id,
            expires_at = NOW() + make_interval(secs => :duration)
        WHERE event_processing_leases.expires_at < NOW()
        """
        
        async with self.session_maker() as session:
            try:
                result = await session.execute(
                    sqlalchemy.text(query),
                    {
                        "lease_key": lease_key,
                        "consumer_name": consumer_name,
                        "event_id": event_id,
                        "worker_id": worker_id,
                        "duration": float(lease_duration_seconds)
                    }
                )
                await session.commit()
                rowcount = getattr(result, "rowcount", None)
                acquired = (rowcount > 0) if (rowcount is not None and isinstance(rowcount, int)) else True
                if acquired:
                    logger.debug("Lease acquired", lease_key=lease_key, duration=lease_duration_seconds)
                else:
                    logger.debug("Lease already held", lease_key=lease_key)
                return acquired
            except Exception as e:
                await session.rollback()
                logger.error("Failed to acquire lease", lease_key=lease_key, error=str(e))
                raise
            finally:
                await session.close()

    async def release_processing_lease(self, lease_key: str) -> None:
        """
        Release a processing lease.
        
        Args:
            lease_key: Lease key to release
        """
        query = "DELETE FROM event_processing_leases WHERE lease_key = :lease_key"
        
        async with self.session_maker() as session:
            try:
                await session.execute(
                    sqlalchemy.text(query),
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


def get_db_manager(settings: Optional[Settings] = None) -> DatabaseManager:
    """Get or create database manager."""
    global _db_manager
    if _db_manager is None:
        _db_manager = DatabaseManager(settings or get_settings())
    return _db_manager
