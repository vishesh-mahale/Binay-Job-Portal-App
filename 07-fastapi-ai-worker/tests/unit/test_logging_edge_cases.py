"""Unit tests for logging PII redaction edge cases."""

from __future__ import annotations

import pytest
from app.core.logging import PIIRedactor


def test_redact_empty_string():
    assert PIIRedactor.redact("") == ""


def test_redact_non_string():
    assert PIIRedactor.redact(123) == 123
    assert PIIRedactor.redact(None) is None


def test_redact_multiple_emails():
    text = "Contact john@example.com or jane@test.com"
    redacted = PIIRedactor.redact(text)
    assert "john@example.com" not in redacted
    assert "jane@test.com" not in redacted
    assert redacted.count("[EMAIL_REDACTED]") == 2


def test_redact_email_and_token():
    text = "user=john@example.com token=abc123xyz"
    redacted = PIIRedactor.redact(text)
    assert "john@example.com" not in redacted
    assert "abc123xyz" not in redacted


def test_redact_bearer_with_newline():
    text = "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\n"
    redacted = PIIRedactor.redact(text)
    assert "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9" not in redacted


def test_redact_dict_sensitive_key():
    data = {"password": "secret123", "user": "john"}
    redacted = PIIRedactor.redact_dict(data)
    assert redacted["password"] == "[REDACTED]"
    assert redacted["user"] == "john"


def test_redact_dict_nested():
    data = {"outer": {"api_key": "key123", "value": "ok"}}
    redacted = PIIRedactor.redact_dict(data)
    assert redacted["outer"]["api_key"] == "[REDACTED]"
    assert redacted["outer"]["value"] == "ok"


def test_redact_list_returns_unchanged():
    data = ["email: a@b.com", "token: xyz"]
    result = PIIRedactor.redact(data)
    assert result == data
