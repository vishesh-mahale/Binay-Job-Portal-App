"""Unit tests for logging PII redaction branches."""

from __future__ import annotations

import pytest
from app.core.logging import PIIRedactor


def test_redact_email():
    text = "Contact john.doe@example.com for details"
    redacted = PIIRedactor.redact(text)
    assert "john.doe@example.com" not in redacted
    assert "[EMAIL_REDACTED]" in redacted


def test_redact_bearer_token():
    text = "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"
    redacted = PIIRedactor.redact(text)
    assert "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9" not in redacted
    assert "[BEARER_REDACTED]" in redacted


def test_redact_api_key():
    text = "api_key=sk-1234567890abcdef"
    redacted = PIIRedactor.redact(text)
    assert "sk-1234567890abcdef" not in redacted
    assert "[API_KEY_REDACTED]" in redacted


def test_redact_phone():
    text = "Call +1-555-123-4567"
    redacted = PIIRedactor.redact(text)
    assert "+1-555-123-4567" not in redacted
    assert "[PHONE_REDACTED]" in redacted


def test_redact_password():
    text = "password = mysecret123"
    redacted = PIIRedactor.redact(text)
    assert "mysecret123" not in redacted
    assert "[PASSWORD_REDACTED]" in redacted


def test_redact_multiple_patterns():
    text = "email: john@example.com password: secret123"
    redacted = PIIRedactor.redact(text)
    assert "john@example.com" not in redacted
    assert "secret123" not in redacted
    assert "[EMAIL_REDACTED]" in redacted
    assert "[PASSWORD_REDACTED]" in redacted


def test_redact_nothing():
    text = "This is a normal sentence without secrets."
    redacted = PIIRedactor.redact(text)
    assert redacted == text


def test_redact_nested_dict():
    obj = {"user": "john", "email": "john@example.com", "token": "secret-token"}
    redacted = PIIRedactor.redact_dict(obj)
    assert "john@example.com" not in str(redacted)
    assert "secret-token" not in str(redacted)


def test_redact_list_of_strings():
    items = ["email: john@example.com", "token: abc123"]
    redacted = [PIIRedactor.redact(item) for item in items]
    assert "john@example.com" not in str(redacted)
    assert "abc123" not in str(redacted)
