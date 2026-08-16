"""
Pydantic Settings configuration for FastAPI AI Worker.
Single source of truth for environment validation and defaults.
"""

from typing import Optional
from enum import Enum
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings


class LogFormat(str, Enum):
    """Logging format options."""
    JSON = "json"
    TEXT = "text"


class AIProvider(str, Enum):
    """Supported AI providers."""
    GEMINI = "gemini"
    OPENAI = "openai"
    MOCK = "mock"


class LogLevel(str, Enum):
    """Log level options."""
    DEBUG = "DEBUG"
    INFO = "INFO"
    WARNING = "WARNING"
    ERROR = "ERROR"
    CRITICAL = "CRITICAL"


class Settings(BaseSettings):
    """
    Application settings loaded from environment variables.
    
    Validation:
    - All required fields raise ValueError if missing
    - Type coercion (int, bool) applied automatically
    - Format validation via field_validator
    """

    # ========================================================================
    # Database Configuration
    # ========================================================================
    
    DATABASE_URL: str = Field(
        ...,
        description="PostgreSQL connection string (must include ?sslmode=require for production)"
    )
    DATABASE_MAX_POOL_SIZE: int = Field(20, ge=1, le=100)
    DATABASE_MIN_POOL_SIZE: int = Field(5, ge=1, le=50)
    DATABASE_COMMAND_TIMEOUT_SECONDS: int = Field(30, ge=5, le=300)
    DATABASE_STATEMENT_TIMEOUT_SECONDS: int = Field(120, ge=10, le=600)

    # ========================================================================
    # Google Cloud & OIDC
    # ========================================================================
    
    GOOGLE_CLOUD_PROJECT_ID: str = Field(
        ...,
        description="GCP project ID"
    )
    GOOGLE_OIDC_ALLOWED_SERVICE_ACCOUNTS: str = Field(
        ...,
        description="Comma-separated service account emails"
    )
    OIDC_AUTH_ENABLED: bool = Field(True, description="Enable OIDC token validation")
    OIDC_TOKEN_AUDIENCE: Optional[str] = Field(None, description="Expected token audience")

    # ========================================================================
    # AI Provider Configuration
    # ========================================================================
    
    AI_PROVIDER: AIProvider = Field(AIProvider.GEMINI)
    
    GEMINI_API_KEY: Optional[str] = Field(None)
    GEMINI_MODEL: str = Field("gemini-2.5-flash")
    GEMINI_TEMPERATURE: float = Field(0.2, ge=0.0, le=2.0)
    GEMINI_MAX_TOKENS: int = Field(2048, ge=100, le=8192)
    
    OPENAI_API_KEY: Optional[str] = Field(None)
    OPENAI_MODEL: str = Field("gpt-4-turbo-preview")
    OPENAI_TEMPERATURE: float = Field(0.2, ge=0.0, le=2.0)
    
    EMBEDDING_PROVIDER: str = Field("gemini")
    EMBEDDING_MODEL: str = Field("text-embedding-004")
    EMBEDDING_DIMENSION: int = Field(768)
    
    MOCK_AI_PROVIDER: bool = Field(False, description="Force mock provider for testing")

    # ========================================================================
    # Document Processing
    # ========================================================================
    
    MAX_DOCUMENT_SIZE_BYTES: int = Field(10 * 1024 * 1024, ge=1024 * 1024)  # min 1MB
    MAX_EXTRACTED_TEXT_LENGTH: int = Field(100000, ge=10000)
    MAX_PDF_PAGES: int = Field(10, ge=1, le=50)
    MAX_DOCX_ENTRIES: int = Field(1000, ge=100)
    PDF_EXTRACTION_TIMEOUT_SECONDS: int = Field(30, ge=10, le=120)
    OCR_TIMEOUT_SECONDS: int = Field(60, ge=30, le=300)
    TESSERACT_CMD: Optional[str] = Field(None)

    # ========================================================================
    # Logging & Observability
    # ========================================================================
    
    LOG_LEVEL: LogLevel = Field(LogLevel.INFO)
    LOG_FORMAT: LogFormat = Field(LogFormat.JSON)
    TRACE_ID_HEADER: str = Field("x-trace-id")
    LOG_REDACT_PII: bool = Field(True)
    DEBUG_ENDPOINTS_ENABLED: bool = Field(False)
    DEBUG_FULL_TRACEBACK: bool = Field(False)

    # ========================================================================
    # Cloud Storage (Supabase)
    # ========================================================================
    
    SUPABASE_STORAGE_BUCKET: str = Field("job-portal-uploads")
    SUPABASE_STORAGE_KEY: Optional[str] = Field(None)
    SUPABASE_PROJECT_URL: str = Field(...)
    SIGNED_URL_EXPIRY_SECONDS: int = Field(900, ge=60, le=3600)

    # ========================================================================
    # Processing & Concurrency
    # ========================================================================
    
    LEASE_DURATION_SECONDS: int = Field(300, ge=60, le=3600)
    LEASE_CLEANUP_INTERVAL_SECONDS: int = Field(600, ge=60, le=3600)
    STALE_LEASE_THRESHOLD_SECONDS: int = Field(3600, ge=300, le=86400)
    MAX_CONCURRENT_TASKS: int = Field(10, ge=1, le=100)
    WORKER_CONCURRENCY: int = Field(5, ge=1, le=50)
    LOOP_WORKERS: int = Field(4, ge=1, le=16)

    # ========================================================================
    # Security
    # ========================================================================
    
    SECRET_KEY: str = Field(..., min_length=32)
    ALLOWED_ORIGINS: str = Field("http://localhost:3000")

    # ========================================================================
    # Retention Policies
    # ========================================================================
    
    PROCESSED_EVENTS_RETENTION_DAYS: int = Field(30, ge=1, le=365)
    RESUME_ARTIFACTS_RETENTION_DAYS: int = Field(7, ge=1, le=30)
    RAW_AI_OUTPUT_RETENTION_DAYS: int = Field(0, ge=0, le=90)

    # ========================================================================
    # Derived Properties & Validation
    # ========================================================================

    class Config:
        """Pydantic config."""
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = True
        validate_assignment = True

    @field_validator("DATABASE_URL")
    @classmethod
    def validate_database_url(cls, v: str) -> str:
        """Validate PostgreSQL connection string format."""
        if not v.startswith(("postgresql://", "postgres://", "postgresql+asyncpg://")):
            raise ValueError("DATABASE_URL must start with postgresql://, postgres://, or postgresql+asyncpg://")
        return v

    @field_validator("GOOGLE_OIDC_ALLOWED_SERVICE_ACCOUNTS")
    @classmethod
    def validate_service_accounts(cls, v: str) -> list[str]:
        """Parse comma-separated service accounts."""
        accounts = [acc.strip() for acc in v.split(",") if acc.strip()]
        if not accounts:
            raise ValueError("At least one service account required")
        return accounts

    def get_allowed_service_accounts(self) -> list[str]:
        """Get list of allowed service account emails."""
        if isinstance(self.GOOGLE_OIDC_ALLOWED_SERVICE_ACCOUNTS, str):
            return [acc.strip() for acc in self.GOOGLE_OIDC_ALLOWED_SERVICE_ACCOUNTS.split(",")]
        return self.GOOGLE_OIDC_ALLOWED_SERVICE_ACCOUNTS

    def get_cors_origins(self) -> list[str]:
        """Parse comma-separated CORS origins."""
        return [origin.strip() for origin in self.ALLOWED_ORIGINS.split(",") if origin.strip()]


# Global settings instance (lazy-loaded on first access)
_settings: Optional[Settings] = None


def get_settings() -> Settings:
    """
    Lazy-load and cache settings.
    
    Returns:
        Singleton Settings instance
        
    Raises:
        ValueError: If environment validation fails
    """
    global _settings
    if _settings is None:
        _settings = Settings()
    return _settings
