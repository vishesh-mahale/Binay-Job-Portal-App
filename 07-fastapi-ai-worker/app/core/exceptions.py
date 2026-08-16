"""
Custom exception hierarchy for FastAPI AI Worker.
Provides structured error handling and HTTP status code mapping.
"""

from typing import Optional, Any, Dict


class WorkerException(Exception):
    """Base exception for all worker errors."""
    
    def __init__(
        self,
        message: str,
        http_status: int = 500,
        internal_code: str = "INTERNAL_ERROR",
        details: Optional[Dict[str, Any]] = None
    ):
        """
        Initialize exception.
        
        Args:
            message: User-friendly error message
            http_status: HTTP status code to return
            internal_code: Internal error code for logging
            details: Additional error details (redacted in responses)
        """
        super().__init__(message)
        self.message = message
        self.http_status = http_status
        self.internal_code = internal_code
        self.details = details or {}

    def to_dict(self) -> Dict[str, Any]:
        """Convert to JSON response dict."""
        return {
            "error": {
                "code": self.internal_code,
                "message": self.message,
                "details": self.details if self.details else None,
            }
        }


# ============================================================================
# Task Processing Errors
# ============================================================================

class TaskValidationError(WorkerException):
    """Invalid task payload or schema."""
    
    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None):
        super().__init__(
            message=message,
            http_status=400,
            internal_code="TASK_VALIDATION_ERROR",
            details=details
        )


class OIDCAuthenticationError(WorkerException):
    """OIDC token validation failed."""
    
    def __init__(self, message: str = "Authentication failed"):
        super().__init__(
            message=message,
            http_status=401,
            internal_code="OIDC_AUTH_ERROR"
        )


class OIDCAuthorizationError(WorkerException):
    """OIDC token valid but service account not authorized."""
    
    def __init__(self, message: str = "Not authorized"):
        super().__init__(
            message=message,
            http_status=403,
            internal_code="OIDC_AUTHZ_ERROR"
        )


class DuplicateTaskError(WorkerException):
    """Task already processed (idempotent skip)."""
    
    def __init__(self, message: str = "Task already processed"):
        super().__init__(
            message=message,
            http_status=200,  # Return 200 OK for idempotent skip
            internal_code="DUPLICATE_TASK"
        )


class LockAcquisitionError(WorkerException):
    """Failed to acquire processing lease (concurrent duplicate suppressed)."""
    
    def __init__(self, lease_key: str):
        super().__init__(
            message=f"Processing lease already held for {lease_key}",
            http_status=200,  # Return 200 OK; task will be skipped
            internal_code="LEASE_NOT_ACQUIRED"
        )


class StaleDataError(WorkerException):
    """Source data has been updated; projection coalesced."""
    
    def __init__(self, message: str = "Stale data; projection coalesced"):
        super().__init__(
            message=message,
            http_status=200,  # Return 200 OK; coalescing is intentional
            internal_code="STALE_DATA_COALESCED"
        )


# ============================================================================
# Document Processing Errors
# ============================================================================

class DocumentValidationError(WorkerException):
    """Document failed validation (hostile, corrupt, or invalid)."""
    
    def __init__(self, reason: str, details: Optional[Dict[str, Any]] = None):
        super().__init__(
            message=f"Document validation failed: {reason}",
            http_status=200,  # Return 200; terminal error for this task
            internal_code="DOCUMENT_VALIDATION_ERROR",
            details=details
        )


class DocumentExtractionError(WorkerException):
    """Document text extraction failed."""
    
    def __init__(self, reason: str, details: Optional[Dict[str, Any]] = None):
        super().__init__(
            message=f"Document extraction failed: {reason}",
            http_status=200,  # Return 200; terminal error
            internal_code="DOCUMENT_EXTRACTION_ERROR",
            details=details
        )


class DocumentSizeLimitError(WorkerException):
    """Document exceeds size limits."""
    
    def __init__(self, size_mb: float, limit_mb: float):
        super().__init__(
            message=f"Document size {size_mb:.2f} MB exceeds limit {limit_mb:.2f} MB",
            http_status=200,  # Return 200; terminal error
            internal_code="DOCUMENT_SIZE_LIMIT"
        )


class DocumentSecurityError(WorkerException):
    """Document failed security scan (malware, etc)."""
    
    def __init__(self, reason: str):
        super().__init__(
            message=f"Document failed security check: {reason}",
            http_status=200,  # Return 200; terminal error
            internal_code="DOCUMENT_SECURITY_ERROR"
        )


# ============================================================================
# AI Provider Errors
# ============================================================================

class AIProviderError(WorkerException):
    """AI provider call failed."""
    
    def __init__(self, provider: str, reason: str, retryable: bool = False):
        super().__init__(
            message=f"AI provider ({provider}) error: {reason}",
            http_status=503 if retryable else 200,
            internal_code="AI_PROVIDER_ERROR"
        )


class AIResponseValidationError(WorkerException):
    """AI provider returned invalid/unparseable response."""
    
    def __init__(self, reason: str):
        super().__init__(
            message=f"AI response validation failed: {reason}",
            http_status=200,  # Return 200; terminal error
            internal_code="AI_RESPONSE_INVALID"
        )


class RateLimitError(WorkerException):
    """AI provider rate limit exceeded."""
    
    def __init__(self, provider: str, retry_after_seconds: Optional[int] = None):
        super().__init__(
            message=f"{provider} rate limit exceeded",
            http_status=503,  # Retryable
            internal_code="RATE_LIMIT_ERROR"
        )


# ============================================================================
# Database Errors
# ============================================================================

class DatabaseError(WorkerException):
    """Database operation failed."""
    
    def __init__(self, operation: str, reason: str, retryable: bool = True):
        super().__init__(
            message=f"Database {operation} failed: {reason}",
            http_status=503 if retryable else 500,
            internal_code="DATABASE_ERROR"
        )


class ConstraintViolationError(WorkerException):
    """Database constraint violation."""
    
    def __init__(self, constraint: str):
        super().__init__(
            message=f"Constraint violation: {constraint}",
            http_status=500,
            internal_code="CONSTRAINT_VIOLATION"
        )


# ============================================================================
# Infrastructure Errors
# ============================================================================

class StorageError(WorkerException):
    """Cloud Storage operation failed."""
    
    def __init__(self, operation: str, reason: str, retryable: bool = True):
        super().__init__(
            message=f"Storage {operation} failed: {reason}",
            http_status=503 if retryable else 500,
            internal_code="STORAGE_ERROR"
        )


class TimeoutError(WorkerException):
    """Operation timeout (document extraction, AI call, etc)."""
    
    def __init__(self, operation: str, timeout_seconds: int):
        super().__init__(
            message=f"{operation} exceeded timeout of {timeout_seconds}s",
            http_status=503,  # Retryable
            internal_code="TIMEOUT"
        )
