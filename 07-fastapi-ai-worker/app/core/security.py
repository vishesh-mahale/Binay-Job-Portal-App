"""
Google Cloud OIDC Token Validation.
Defense-in-depth: Cloud Run IAM + Application-level OIDC verification.
"""

from typing import Optional, Dict, Any
from datetime import datetime, timedelta
import logging

from google.auth.transport import requests
from google.oauth2 import id_token
import jwt

from app.core.config import Settings

from app.core.logging import get_logger

logger = get_logger(__name__)


class OIDCTokenValidator:
    """
    Validates Google OIDC tokens from Cloud Tasks.
    
    Flow:
    1. Extract Bearer token from Authorization header
    2. Validate signature using Google JWKS (cached, auto-rotated)
    3. Check issuer (must be https://accounts.google.com)
    4. Check audience (must match expected service URL)
    5. Check service account email (must be in allowlist)
    6. Check expiration (must be recent: iat <= now <= exp)
    """

    # Google's JWKS endpoint (public, cached)
    GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v1/certs"
    GOOGLE_ISSUER = "https://accounts.google.com"
    
    # Token age validation (not older than 1 hour)
    MAX_TOKEN_AGE_SECONDS = 3600
    
    def __init__(self, settings: Settings):
        """
        Initialize validator.
        
        Args:
            settings: Application settings
        """
        self.settings = settings
        self.allowed_service_accounts = set(settings.get_allowed_service_accounts())
        self._request = requests.Request()
        logger.info(
            "OIDC validator initialized",
            allowed_accounts_count=len(self.allowed_service_accounts),
            auth_enabled=settings.OIDC_AUTH_ENABLED
        )

    def validate_bearer_token(self, auth_header: Optional[str]) -> Dict[str, Any]:
        """
        Validate Bearer token from Authorization header.
        
        Args:
            auth_header: Authorization header value (e.g., "Bearer <token>")
            
        Returns:
            Decoded token claims
            
        Raises:
            ValueError: If token is invalid, expired, or unauthorized
            PermissionError: If service account not in allowlist
        """
        if not auth_header:
            raise ValueError("Missing Authorization header")

        # Extract Bearer token
        parts = auth_header.strip().split()
        if len(parts) != 2 or parts[0].lower() != "bearer":
            raise ValueError("Invalid Authorization header format; expected 'Bearer <token>'")

        token_string = parts[1]
        return self.validate_token(token_string)

    def validate_token(self, token_string: str) -> Dict[str, Any]:
        """
        Validate OIDC token string.
        
        Args:
            token_string: JWT token string
            
        Returns:
            Decoded token claims
            
        Raises:
            ValueError: If token is invalid, expired, or unauthorized
            PermissionError: If service account not in allowlist
        """
        if not self.settings.OIDC_AUTH_ENABLED:
            logger.warning("OIDC validation disabled; accepting all tokens")
            return {"sub": "mock-subject", "email": "mock@example.com"}

        try:
            # Step 1: Verify signature using Google's JWKS
            # google.oauth2.id_token.verify_oauth2_token handles:
            # - JWKS fetching and caching
            # - Key rotation
            # - RS256 signature verification
            claims = id_token.verify_oauth2_token(
                token_string,
                self._request,
                clock_skew_in_seconds=10  # Allow small clock drift
            )
            
            logger.debug("Token signature verified", sub=claims.get("sub"))
            
            # Step 2: Verify issuer
            issuer = claims.get("iss")
            if issuer != self.GOOGLE_ISSUER:
                raise ValueError(f"Invalid issuer: {issuer}; expected {self.GOOGLE_ISSUER}")
            
            logger.debug("Token issuer verified")
            
            # Step 3: Verify audience (if configured)
            if self.settings.OIDC_TOKEN_AUDIENCE:
                audience = claims.get("aud")
                if audience != self.settings.OIDC_TOKEN_AUDIENCE:
                    raise ValueError(f"Invalid audience: {audience}")
                logger.debug("Token audience verified")
            
            # Step 4: Verify service account email
            service_account_email = claims.get("email")
            if not service_account_email:
                raise ValueError("Token missing 'email' claim")
            
            if service_account_email not in self.allowed_service_accounts:
                logger.warning(
                    "Unauthorized service account attempted access",
                    email=service_account_email,
                    allowed_count=len(self.allowed_service_accounts)
                )
                raise PermissionError(f"Service account not authorized: {service_account_email}")
            
            logger.debug("Service account authorized", email=service_account_email)
            
            # Step 5: Verify token age
            issued_at = claims.get("iat")
            if issued_at:
                token_age = datetime.utcnow().timestamp() - issued_at
                if token_age > self.MAX_TOKEN_AGE_SECONDS:
                    raise ValueError(f"Token too old: {token_age} seconds")
            
            # Step 6: Verify expiration (id_token.verify_oauth2_token already checks this,
            # but we double-check for defense-in-depth)
            expiry = claims.get("exp")
            if expiry:
                now = datetime.utcnow().timestamp()
                if now > expiry:
                    raise ValueError("Token expired")
            
            logger.info(
                "OIDC token validated successfully",
                email=service_account_email,
                sub=claims.get("sub")
            )
            
            return claims

        except ValueError as e:
            logger.error("Token validation failed", error=str(e))
            raise
        except Exception as e:
            logger.error("Unexpected error during token validation", error=str(e), exc_info=True)
            raise ValueError(f"Token validation error: {str(e)}")

    def extract_claims(self, token_string: str, verify: bool = True) -> Dict[str, Any]:
        """
        Extract and optionally verify token claims.
        
        Args:
            token_string: JWT token string
            verify: Whether to verify signature and claims
            
        Returns:
            Decoded claims
        """
        if verify:
            return self.validate_token(token_string)
        
        # Decode without verification (for debugging only)
        try:
            return jwt.decode(token_string, options={"verify_signature": False})
        except Exception as e:
            logger.error("Failed to decode token", error=str(e))
            raise ValueError(f"Invalid token format: {str(e)}")


def get_oidc_validator(settings: Settings) -> OIDCTokenValidator:
    """Factory function for creating OIDC validator."""
    return OIDCTokenValidator(settings)


# Alias for backward compatibility
create_oidc_validator = get_oidc_validator
