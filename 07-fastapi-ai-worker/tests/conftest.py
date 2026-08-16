"""
Pytest Configuration & Fixtures.
Provides common fixtures for unit and integration tests.
"""

import os
import pytest
from unittest.mock import AsyncMock, MagicMock
from typing import AsyncGenerator

from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker

from app.main import create_app
from app.core.config import Settings
from app.core.database import DatabaseManager
from app.providers.mock import MockLLMProvider, MockEmbeddingProvider


# ============================================================================
# Environment & Settings
# ============================================================================

@pytest.fixture(scope="session")
def test_settings() -> Settings:
    """
    Create test settings.
    
    Uses mock AI provider and in-memory SQLite.
    """
    return Settings(
        DATABASE_URL="sqlite+aiosqlite:///:memory:",
        GOOGLE_CLOUD_PROJECT_ID="test-project",
        GOOGLE_OIDC_ALLOWED_SERVICE_ACCOUNTS="test@test-project.iam.gserviceaccount.com",
        OIDC_AUTH_ENABLED=False,  # Disable for tests
        SUPABASE_PROJECT_URL="https://test.supabase.co",
        SUPABASE_STORAGE_KEY="test-key",
        SECRET_KEY="test-secret-key-minimum-32-characters-required-here",
        AI_PROVIDER="mock",
        MOCK_AI_PROVIDER=True,
        LOG_LEVEL="DEBUG",
    )


# ============================================================================
# Database Fixtures
# ============================================================================

@pytest.fixture
async def test_db_manager(test_settings: Settings) -> AsyncGenerator[DatabaseManager, None]:
    """
    Create database manager with in-memory database.
    
    Yields:
        Initialized DatabaseManager
    """
    db_manager = DatabaseManager(test_settings)
    await db_manager.initialize()
    
    yield db_manager
    
    await db_manager.shutdown()


# ============================================================================
# FastAPI & HTTP Client Fixtures
# ============================================================================

@pytest.fixture
def test_app() -> FastAPI:
    """
    Create test FastAPI application.
    
    Returns:
        FastAPI app with test configuration
    """
    from app.core.config import _settings as settings_module
    import app.core.config as config_module
    
    # Store original settings
    original_settings = getattr(settings_module, '_settings', None)
    
    # Use test settings
    test_settings_obj = Settings(
        DATABASE_URL="sqlite+aiosqlite:///:memory:",
        GOOGLE_CLOUD_PROJECT_ID="test-project",
        GOOGLE_OIDC_ALLOWED_SERVICE_ACCOUNTS="test@test-project.iam.gserviceaccount.com",
        OIDC_AUTH_ENABLED=False,
        SUPABASE_PROJECT_URL="https://test.supabase.co",
        SUPABASE_STORAGE_KEY="test-key",
        SECRET_KEY="test-secret-key-minimum-32-characters-required-here",
        AI_PROVIDER="mock",
        MOCK_AI_PROVIDER=True,
        LOG_LEVEL="DEBUG",
    )
    
    config_module._settings = test_settings_obj
    
    app = create_app()
    
    # Restore original settings
    config_module._settings = original_settings
    
    return app


@pytest.fixture
def test_client(test_app) -> TestClient:
    """
    Create test HTTP client.
    
    Returns:
        TestClient for making requests
    """
    return TestClient(test_app)


# ============================================================================
# AI Provider Fixtures
# ============================================================================

@pytest.fixture
def mock_llm_provider() -> MockLLMProvider:
    """Create mock LLM provider."""
    return MockLLMProvider()


@pytest.fixture
def mock_embedding_provider() -> MockEmbeddingProvider:
    """Create mock embedding provider."""
    return MockEmbeddingProvider()


# ============================================================================
# Mock Fixtures
# ============================================================================

@pytest.fixture
def mock_google_auth() -> MagicMock:
    """Mock Google OAuth2 auth module."""
    return MagicMock()


@pytest.fixture
def mock_asyncpg() -> MagicMock:
    """Mock asyncpg module."""
    return MagicMock()


# ============================================================================
# Test Data Fixtures
# ============================================================================

@pytest.fixture
def sample_cloud_task_payload() -> dict:
    """Sample Cloud Task payload."""
    return {
        "schema_version": 1,
        "event_id": "550e8400-e29b-41d4-a716-446655440000",
        "aggregate_id": "660e8400-e29b-41d4-a716-446655440000",
        "trace_id": "770e8400-e29b-41d4-a716-446655440000",
    }


@pytest.fixture
def sample_oidc_token() -> str:
    """Sample (invalid) OIDC token for testing."""
    # This is a fake token for structure testing
    return (
        "eyJhbGciOiJSUzI1NiIsImtpZCI6IjEyMzQ1Njc4OTAifQ."
        "eyJpc3MiOiJodHRwczovL2FjY291bnRzLmdvb2dsZS5jb20iLCJzdWIiOiIxMjM0NTY3ODkwIiwi"
        "ZW1haWwiOiJ0ZXN0QHRlc3QtcHJvamVjdC5pYW0uZ3NlcnZpY2VhY2NvdW50LmNvbSJ9."
        "fake-signature"
    )


@pytest.fixture
def sample_resume_text() -> str:
    """Sample resume text."""
    return """
    John Doe
    john.doe@example.com | (555) 123-4567
    
    PROFESSIONAL SUMMARY
    Experienced Software Engineer with 5 years of Python expertise.
    
    EXPERIENCE
    Senior Software Engineer | TechCorp Inc. | 2020-2023
    - Led team of 4 engineers
    - Designed microservices architecture
    
    SKILLS
    Python, FastAPI, PostgreSQL, Docker, Kubernetes, AWS
    
    EDUCATION
    B.S. Computer Science | State University | 2018
    """


# ============================================================================
# Async Test Marker
# ============================================================================

def pytest_configure(config):
    """Register custom pytest markers."""
    config.addinivalue_line(
        "markers", "asyncio: mark test as async (used with pytest-asyncio)"
    )
