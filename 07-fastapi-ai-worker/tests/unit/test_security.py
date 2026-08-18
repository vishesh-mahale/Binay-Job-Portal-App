"""Unit tests for security module."""

from __future__ import annotations

import pytest
from unittest.mock import patch

from app.core.security import OIDCTokenValidator
from app.core.config import Settings


class TestOIDCTokenValidator:
    @pytest.fixture
    def settings(self):
        return Settings(
            DATABASE_URL="postgresql+asyncpg://test:test@localhost:5432/test",
            GOOGLE_CLOUD_PROJECT_ID="test-project",
            GOOGLE_OIDC_ALLOWED_SERVICE_ACCOUNTS="svc@test-project.iam.gserviceaccount.com",
            OIDC_AUTH_ENABLED=True,
            SUPABASE_PROJECT_URL="https://test.supabase.co",
            SUPABASE_STORAGE_KEY="test-key",
            SECRET_KEY="test-secret-key-minimum-32-characters-required-here",
        )

    @pytest.fixture
    def validator(self, settings):
        return OIDCTokenValidator(settings)

    def test_validate_token_success(self, validator):
        mock_id_info = {"email": "svc@test-project.iam.gserviceaccount.com", "iss": "https://accounts.google.com"}
        
        with patch("app.core.security.id_token.verify_oauth2_token", return_value=mock_id_info):
            result = validator.validate_token("valid-token")
            assert result["email"] == "svc@test-project.iam.gserviceaccount.com"

    def test_validate_token_invalid_email(self, validator):
        mock_id_info = {"email": "wrong@other-project.iam.gserviceaccount.com", "iss": "https://accounts.google.com"}
        
        with patch("app.core.security.id_token.verify_oauth2_token", return_value=mock_id_info):
            with pytest.raises(ValueError, match="Token validation error.*not authorized"):
                validator.validate_token("valid-token")

    def test_validate_token_missing_email(self, validator):
        mock_id_info = {"sub": "12345", "iss": "https://accounts.google.com"}
        
        with patch("app.core.security.id_token.verify_oauth2_token", return_value=mock_id_info):
            with pytest.raises(ValueError, match="Token missing 'email' claim"):
                validator.validate_token("valid-token")

    def test_validate_token_invalid_token(self, validator):
        with patch("app.core.security.id_token.verify_oauth2_token", side_effect=Exception("invalid token")):
            with pytest.raises(ValueError, match="Token validation error"):
                validator.validate_token("invalid-token")

    def test_validate_bearer_token_success(self, validator):
        mock_id_info = {"email": "svc@test-project.iam.gserviceaccount.com", "iss": "https://accounts.google.com"}
        
        with patch("app.core.security.id_token.verify_oauth2_token", return_value=mock_id_info):
            result = validator.validate_bearer_token("Bearer valid-token")
            assert result["email"] == "svc@test-project.iam.gserviceaccount.com"

    def test_validate_bearer_token_missing_header(self, validator):
        with pytest.raises(ValueError, match="Missing Authorization header"):
            validator.validate_bearer_token(None)

    def test_validate_bearer_token_invalid_format(self, validator):
        with pytest.raises(ValueError, match="Invalid Authorization header format"):
            validator.validate_bearer_token("Basic abc123")
