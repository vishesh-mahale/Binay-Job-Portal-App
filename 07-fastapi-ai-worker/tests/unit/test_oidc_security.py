"""Unit tests for Google Cloud Tasks OIDC token validation and authorization."""

from datetime import datetime, timezone
import pytest
from unittest.mock import MagicMock, patch

from app.core.config import Settings
from app.core.security import OIDCTokenValidator


def _make_settings(**overrides) -> Settings:
    base = {
        "DATABASE_URL": "postgresql+asyncpg://test:test@localhost:5432/test_db",
        "GOOGLE_CLOUD_PROJECT_ID": "test-project",
        "GOOGLE_OIDC_ALLOWED_SERVICE_ACCOUNTS": "cloud-tasks@binay-portal.iam.gserviceaccount.com",
        "SUPABASE_PROJECT_URL": "https://test.supabase.co",
        "SECRET_KEY": "test-secret-key-minimum-32-characters-required-here",
        "OIDC_AUTH_ENABLED": True,
    }
    base.update(overrides)
    return Settings(**base)


def test_oidc_disabled_returns_mock_claims():
    """When OIDC_AUTH_ENABLED=False, validator returns mock claims without verification."""
    settings = _make_settings(OIDC_AUTH_ENABLED=False)
    validator = OIDCTokenValidator(settings)
    claims = validator.validate_token("dummy-token")
    assert claims["sub"] == "mock-subject"
    assert "email" in claims


def test_oidc_missing_bearer_header():
    """Missing or invalid Authorization header raises ValueError."""
    settings = _make_settings(OIDC_AUTH_ENABLED=True)
    validator = OIDCTokenValidator(settings)

    with pytest.raises(ValueError, match="Missing Authorization header"):
        validator.validate_bearer_token(None)

    with pytest.raises(ValueError, match="Invalid Authorization header format"):
        validator.validate_bearer_token("Basic invalid-token")


def test_oidc_valid_token_flow():
    """Valid token with expected issuer, audience, and allowlisted service account passes."""
    settings = _make_settings(
        OIDC_AUTH_ENABLED=True,
        OIDC_TOKEN_AUDIENCE="https://fastapi-ai-worker.internal",
        GOOGLE_OIDC_ALLOWED_SERVICE_ACCOUNTS="cloud-tasks@binay-portal.iam.gserviceaccount.com",
    )
    validator = OIDCTokenValidator(settings)

    mock_claims = {
        "iss": "https://accounts.google.com",
        "aud": "https://fastapi-ai-worker.internal",
        "email": "cloud-tasks@binay-portal.iam.gserviceaccount.com",
        "sub": "user-12345",
        "iat": datetime.now(timezone.utc).timestamp() - 10,
        "exp": datetime.now(timezone.utc).timestamp() + 3600,
    }

    with patch("google.oauth2.id_token.verify_oauth2_token", return_value=mock_claims):
        claims = validator.validate_bearer_token("Bearer valid.mock.jwt")
        assert claims["email"] == "cloud-tasks@binay-portal.iam.gserviceaccount.com"
        assert claims["aud"] == "https://fastapi-ai-worker.internal"


def test_oidc_unauthorized_service_account():
    """Valid token from non-allowlisted service account raises error."""
    settings = _make_settings(
        OIDC_AUTH_ENABLED=True,
        GOOGLE_OIDC_ALLOWED_SERVICE_ACCOUNTS="cloud-tasks@binay-portal.iam.gserviceaccount.com",
    )
    validator = OIDCTokenValidator(settings)

    mock_claims = {
        "iss": "https://accounts.google.com",
        "email": "attacker@evil.iam.gserviceaccount.com",
        "sub": "attacker-id",
        "iat": datetime.now(timezone.utc).timestamp() - 10,
        "exp": datetime.now(timezone.utc).timestamp() + 3600,
    }

    with patch("google.oauth2.id_token.verify_oauth2_token", return_value=mock_claims):
        with pytest.raises((PermissionError, ValueError), match="not authorized"):
            validator.validate_bearer_token("Bearer attacker.token")


def test_oidc_invalid_audience():
    """Token with mismatched audience raises ValueError."""
    settings = _make_settings(
        OIDC_AUTH_ENABLED=True,
        OIDC_TOKEN_AUDIENCE="https://expected-audience.internal",
        GOOGLE_OIDC_ALLOWED_SERVICE_ACCOUNTS="cloud-tasks@binay-portal.iam.gserviceaccount.com",
    )
    validator = OIDCTokenValidator(settings)

    mock_claims = {
        "iss": "https://accounts.google.com",
        "aud": "https://wrong-audience.internal",
        "email": "cloud-tasks@binay-portal.iam.gserviceaccount.com",
        "iat": datetime.now(timezone.utc).timestamp() - 10,
        "exp": datetime.now(timezone.utc).timestamp() + 3600,
    }

    with patch("google.oauth2.id_token.verify_oauth2_token", return_value=mock_claims):
        with pytest.raises(ValueError, match="Invalid audience"):
            validator.validate_bearer_token("Bearer mismatch.aud.token")
