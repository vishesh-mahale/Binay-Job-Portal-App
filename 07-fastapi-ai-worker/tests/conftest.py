"""
Pytest Configuration & Fixtures.
Provides common fixtures for unit and integration tests.
"""

import os
import pytest
from unittest.mock import AsyncMock, MagicMock
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession

import app.core.config as config_module
from app.core.config import Settings
from app.core.logging import configure_logging
from app.core.database import DatabaseManager
from app.providers.mock import MockLLMProvider, MockEmbeddingProvider


# ============================================================================
# Environment & Settings
# ============================================================================

def _build_test_settings() -> Settings:
    return Settings(
        DATABASE_URL="postgresql+asyncpg://test:test@localhost:5432/test_db",
        GOOGLE_CLOUD_PROJECT_ID="test-project",
        GCP_REGION="asia-south1",
        GOOGLE_OIDC_ALLOWED_SERVICE_ACCOUNTS="test@test-project.iam.gserviceaccount.com",
        OIDC_AUTH_ENABLED=False,  # Disable for tests
        OIDC_TOKEN_AUDIENCE=None,
        SUPABASE_PROJECT_URL="https://test.supabase.co",
        SUPABASE_STORAGE_KEY="test-key",
        SECRET_KEY="test-secret-key-minimum-32-characters-required-here",
        AI_PROVIDER="mock",
        MOCK_AI_PROVIDER=True,
        LOG_LEVEL="DEBUG",
    )


# Set global test settings and configure structlog
config_module._settings = _build_test_settings()
configure_logging("DEBUG", "text", False)


@pytest.fixture(scope="session")
def test_settings() -> Settings:
    """Create test settings."""
    return _build_test_settings()


# ============================================================================
# FastAPI & HTTP Client Fixtures
# ============================================================================

@pytest.fixture
def test_app(test_settings: Settings) -> FastAPI:
    """
    Create test FastAPI application.
    
    Returns:
        FastAPI app with test configuration
    """
    from app.main import create_app
    return create_app(settings=test_settings)


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


def pytest_configure(config):
    """Register custom pytest markers."""
    config.addinivalue_line(
        "markers", "asyncio: mark test as async (used with pytest-asyncio)"
    )
