"""
Custom exception hierarchy for FastAPI AI Worker.
Includes standard HTTP status codes, error details, and log formatting.
"""

from typing import Any, Dict, Optional


class WorkerException(Exception):
    """Base exception for all worker errors."""
    
    def __init__(
        self,
        message: str,
        http_status: int = 500,
        internal_code: str = "INTERNAL_ERROR",
        details: Optional[Dict[str, Any]] = None
    ):
        super().__init__(message)
        self.message = message
        self.http_status = http_status
        self.internal_code = internal_code
        self.details = details if details is not None else {}
        
    def to_dict(self) -> Dict[str, Any]:
        """Convert exception to API error response dict."""
        return {
            "error": {
                "code": self.internal_code,
                "message": self.message,
                "details": self.details if bool(self.details) else None
            }
        }


# ============================================================================
# Task & Workflow Errors
# ============================================================================

class TaskValidationError(WorkerException):
    """Task payload failed schema validation."""
    
    def __init__(self, message: str = "Task payload validation failed", details: Optional[Dict[str, Any]] = None):
        super().__init__(
            message=message,
            http_status=400,
            internal_code="TASK_VALIDATION_ERROR",
            details=details
        )


class OIDCAuthenticationError(WorkerException):
    """Google Cloud Tasks OIDC token validation failed."""
    
    def __init__(self, message: str = "OIDC Authentication failed"):
        super().__init__(
            message=f"OIDC Authentication failed: {message}" if not message.startswith("OIDC Authentication failed") else message,
            http_status=401,
            internal_code="OIDC_AUTH_ERROR"
        )


class OIDCAuthorizationError(WorkerException):
    """Service account not authorized."""
    
    def __init__(self, service_account: str = "unknown"):
        super().__init__(
            message=f"Service account '{service_account}' is not authorized to invoke worker tasks",
            http_status=403,
            internal_code="OIDC_AUTHZ_ERROR"
        )


class DuplicateTaskError(WorkerException):
    """Task has already been processed (idempotency guard)."""
    
    def __init__(self, event_id: str = ""):
        super().__init__(
            message=f"Event {event_id} has already been processed" if event_id else "Event has already been processed",
            http_status=200,
            internal_code="DUPLICATE_TASK",
            details={"event_id": event_id, "skipped": True} if event_id else None
        )


class LockAcquisitionError(WorkerException):
    """Failed to acquire processing lease/lock (another instance is working)."""
    
    def __init__(self, resource_id: str = ""):
        super().__init__(
            message=f"Resource {resource_id} is currently being processed by another worker" if resource_id else "Processing lease already held",
            http_status=200,
            internal_code="LEASE_NOT_ACQUIRED",
            details={"resource_id": resource_id, "skipped": True} if resource_id else None
        )


class StaleDataError(WorkerException):
    """Revision guard check failed; a newer revision already exists."""
    
    def __init__(
        self,
        entity_type: str = "entity",
        entity_id: str = "",
        stored_rev: int = 0,
        current_rev: int = 0
    ):
        super().__init__(
            message=f"{entity_type} {entity_id} has newer revision ({current_rev} > {stored_rev}); skipping stale processing" if entity_id else "Stale data coalesced",
            http_status=200,
            internal_code="STALE_DATA_COALESCED",
            details={
                "entity_type": entity_type,
                "entity_id": entity_id,
                "stored_revision": stored_rev,
                "current_revision": current_rev,
                "discarded": True
            } if entity_id else None
        )


# ============================================================================
# Document Processing Errors
# ============================================================================

class DocumentValidationError(WorkerException):
    """Document failed validation (e.g., magic bytes check)."""
    
    def __init__(self, reason: str = ""):
        super().__init__(
            message=f"Document validation failed: {reason}" if reason else "Document validation failed",
            http_status=200,
            internal_code="DOCUMENT_VALIDATION_ERROR"
        )


class DocumentExtractionError(WorkerException):
    """Document text extraction failed."""
    
    def __init__(self, reason: str = "", details: Optional[Dict[str, Any]] = None):
        super().__init__(
            message=f"Document extraction failed: {reason}" if reason else "Document extraction failed",
            http_status=200,
            internal_code="DOCUMENT_EXTRACTION_ERROR",
            details=details
        )


class DocumentSizeLimitError(WorkerException):
    """Document exceeds size limits."""
    
    def __init__(self, size_mb: float = 0.0, limit_mb: float = 0.0):
        super().__init__(
            message=f"Document size {size_mb:.2f} MB exceeds limit {limit_mb:.2f} MB",
            http_status=200,
            internal_code="DOCUMENT_SIZE_LIMIT"
        )


class DocumentSecurityError(WorkerException):
    """Document failed security scan (malware, etc)."""
    
    def __init__(self, reason: str = ""):
        super().__init__(
            message=f"Document failed security check: {reason}" if reason else "Document failed security check",
            http_status=200,
            internal_code="DOCUMENT_SECURITY_ERROR"
        )


# ============================================================================
# AI Provider Errors
# ============================================================================

class AIProviderError(WorkerException):
    """AI provider call failed."""
    
    def __init__(self, provider: str = "ai_provider", reason: str = "", retryable: bool = False):
        if not reason and provider:
            reason = provider
            provider = "ai_provider"
        super().__init__(
            message=f"AI provider ({provider}) error: {reason}",
            http_status=503 if retryable else 200,
            internal_code="AI_PROVIDER_ERROR"
        )
        self.retryable = retryable


class AIResponseValidationError(WorkerException):
    """AI provider returned invalid/unparseable response."""
    
    def __init__(self, reason: str = ""):
        super().__init__(
            message=f"AI response validation failed: {reason}" if reason else "AI response validation failed",
            http_status=200,
            internal_code="AI_RESPONSE_INVALID"
        )


class RateLimitError(WorkerException):
    """AI provider rate limit exceeded."""
    
    def __init__(self, provider: str = "ai_provider", retry_after_seconds: Optional[int] = None):
        super().__init__(
            message=f"{provider} rate limit exceeded",
            http_status=503,
            internal_code="RATE_LIMIT_ERROR"
        )


# ============================================================================
# Infrastructure Errors
# ============================================================================

class StorageError(WorkerException):
    """Supabase storage operation failed."""
    
    def __init__(self, operation: str = "operation", error: str = "", retryable: bool = True):
        super().__init__(
            message=f"Storage operation '{operation}' failed: {error}",
            http_status=503 if retryable else 500,
            internal_code="STORAGE_ERROR",
            details={"operation": operation, "retryable": retryable}
        )


class DatabaseConnectionError(WorkerException):
    """Database connection failed."""
    
    def __init__(self, message: str = "Database connection failed"):
        super().__init__(
            message=message,
            http_status=503,
            internal_code="DB_CONNECTION_ERROR"
        )
