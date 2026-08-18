"""Unit tests for core exceptions."""

from __future__ import annotations

import pytest

from app.core.exceptions import (
    WorkerException,
    TaskValidationError,
    OIDCAuthenticationError,
    OIDCAuthorizationError,
    DuplicateTaskError,
    LockAcquisitionError,
    StaleDataError,
    DocumentValidationError,
    DocumentExtractionError,
    DocumentSizeLimitError,
    DocumentSecurityError,
    AIProviderError,
)


class TestWorkerException:
    def test_base_exception_defaults(self):
        exc = WorkerException("test error")
        assert exc.message == "test error"
        assert exc.http_status == 500
        assert exc.internal_code == "INTERNAL_ERROR"
        assert exc.details == {}

    def test_base_exception_custom(self):
        exc = WorkerException("custom", http_status=400, internal_code="CUSTOM", details={"key": "val"})
        assert exc.http_status == 400
        assert exc.internal_code == "CUSTOM"
        assert exc.details == {"key": "val"}

    def test_to_dict(self):
        exc = WorkerException("test", http_status=400, internal_code="TEST", details={"a": 1})
        result = exc.to_dict()
        assert result == {
            "error": {
                "code": "TEST",
                "message": "test",
                "details": {"a": 1},
            }
        }

    def test_to_dict_no_details(self):
        exc = WorkerException("test")
        result = exc.to_dict()
        assert result["error"]["details"] is None


class TestTaskExceptions:
    def test_task_validation_error(self):
        exc = TaskValidationError("bad payload")
        assert exc.http_status == 400
        assert exc.internal_code == "TASK_VALIDATION_ERROR"

    def test_oidc_auth_error(self):
        exc = OIDCAuthenticationError()
        assert exc.http_status == 401
        assert exc.internal_code == "OIDC_AUTH_ERROR"

    def test_oidc_authz_error(self):
        exc = OIDCAuthorizationError()
        assert exc.http_status == 403
        assert exc.internal_code == "OIDC_AUTHZ_ERROR"

    def test_duplicate_task_error(self):
        exc = DuplicateTaskError()
        assert exc.http_status == 200
        assert exc.internal_code == "DUPLICATE_TASK"

    def test_lock_acquisition_error(self):
        exc = LockAcquisitionError("key-1")
        assert exc.http_status == 200
        assert exc.internal_code == "LEASE_NOT_ACQUIRED"
        assert "key-1" in exc.message

    def test_stale_data_error(self):
        exc = StaleDataError()
        assert exc.http_status == 200
        assert exc.internal_code == "STALE_DATA_COALESCED"


class TestDocumentExceptions:
    def test_document_validation_error(self):
        exc = DocumentValidationError("corrupt file")
        assert exc.http_status == 200
        assert exc.internal_code == "DOCUMENT_VALIDATION_ERROR"

    def test_document_extraction_error(self):
        exc = DocumentExtractionError("ocr failed")
        assert exc.http_status == 200
        assert exc.internal_code == "DOCUMENT_EXTRACTION_ERROR"

    def test_document_size_limit_error(self):
        exc = DocumentSizeLimitError(10.5, 10.0)
        assert exc.http_status == 200
        assert exc.internal_code == "DOCUMENT_SIZE_LIMIT"
        assert "10.50" in exc.message
        assert "10.00" in exc.message

    def test_document_security_error(self):
        exc = DocumentSecurityError("malware detected")
        assert exc.http_status == 200
        assert exc.internal_code == "DOCUMENT_SECURITY_ERROR"
        assert "malware detected" in exc.message


class TestAIProviderError:
    def test_retryable_error(self):
        exc = AIProviderError("openai", "rate limit", retryable=True)
        assert exc.http_status == 503
        assert exc.internal_code == "AI_PROVIDER_ERROR"

    def test_non_retryable_error(self):
        exc = AIProviderError("openai", "bad request", retryable=False)
        assert exc.http_status == 200
        assert exc.internal_code == "AI_PROVIDER_ERROR"
