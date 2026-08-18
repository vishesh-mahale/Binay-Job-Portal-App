"""Unit tests for JSONFormatter and configure_logging in app.core.logging."""

import logging
import pytest
from app.core.logging import (
    JSONFormatter,
    PIIRedactor,
    configure_logging,
    set_trace_id,
    set_worker_id,
    get_logger,
)


def test_json_formatter_fields():
    """Verify JSONFormatter injects trace_id, worker_id, and redacts PII."""
    formatter = JSONFormatter()

    set_trace_id("trace-abc-123")
    set_worker_id("worker-xyz-789")

    record = logging.LogRecord(
        name="test_logger",
        level=logging.INFO,
        pathname="test.py",
        lineno=10,
        msg="Contact user at user@example.com",
        args=(),
        exc_info=None,
    )

    log_record = {"message": "Contact user at user@example.com"}
    formatter.add_fields(log_record, record, {"message": "Contact user at user@example.com"})

    assert log_record.get("trace_id") == "trace-abc-123"
    assert log_record.get("worker_id") == "worker-xyz-789"
    assert log_record.get("level") == "INFO"
    assert "[EMAIL_REDACTED]" in log_record.get("message", "")


def test_json_formatter_extra_dict_redaction():
    """Verify JSONFormatter redacts nested dicts in extra properties."""
    formatter = JSONFormatter()

    record = logging.LogRecord(
        name="test_logger",
        level=logging.INFO,
        pathname="test.py",
        lineno=10,
        msg="Processing document",
        args=(),
        exc_info=None,
    )

    log_record = {
        "message": "Processing document",
        "extra_info": "Bearer ya29.testtoken",
        "nested_dict": {"token": "secret-123", "normal": "hello"},
    }
    formatter.add_fields(log_record, record, {})

    assert "[BEARER_REDACTED]" in log_record["extra_info"]
    assert log_record["nested_dict"]["token"] == "[REDACTED]"


def test_configure_logging_formats():
    """Verify configure_logging supports json and text modes."""
    configure_logging(log_level="DEBUG", log_format="json", redact_pii=True)
    logger = get_logger("json_test")
    logger.debug("Testing json logging")

    configure_logging(log_level="INFO", log_format="text", redact_pii=False)
    logger = get_logger("text_test")
    logger.info("Testing text logging")
