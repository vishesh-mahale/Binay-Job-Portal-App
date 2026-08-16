"""
Structured JSON logging with PII/credential redaction.
Uses structlog + pythonjsonlogger for production-grade observability.
"""

import logging
import json
import re
from typing import Any, Dict
from contextvars import ContextVar

import structlog
from pythonjsonlogger import jsonlogger


# Context variables for tracking
_trace_id_var: ContextVar[str] = ContextVar("trace_id", default="")
_worker_id_var: ContextVar[str] = ContextVar("worker_id", default="")


class PIIRedactor:
    """
    Redacts sensitive data from log records.
    
    Targets:
    - Email addresses
    - Phone numbers
    - Passwords/tokens/API keys
    - Bearer tokens
    - Raw resume/document text
    """

    # Patterns for sensitive data detection
    PATTERNS = {
        "email": re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}"),
        "phone": re.compile(r"(?:\+\d{1,3}[-.\s]?)?\(?(\d{3})\)?[-.\s]?(\d{3})[-.\s]?(\d{4})"),
        "bearer": re.compile(r"Bearer\s+[a-zA-Z0-9\-._~+/]+=*", re.IGNORECASE),
        "api_key": re.compile(r"(?:api[_-]?key|token|secret)[\"']?\s*[:=]\s*[\"']?[a-zA-Z0-9\-._~+/]+=*[\"']?", re.IGNORECASE),
        "password": re.compile(r"(?:password|passwd|pwd)[\"']?\s*[:=]\s*[\"']?[^\s\"']+[\"']?", re.IGNORECASE),
        "resume_text": re.compile(r"extracted_text|raw_ai_output|document_content"),
    }

    @classmethod
    def redact(cls, text: str) -> str:
        """
        Redact sensitive patterns from text.
        
        Args:
            text: Input text
            
        Returns:
            Redacted text
        """
        if not isinstance(text, str):
            return text

        redacted = text
        
        # Email
        redacted = cls.PATTERNS["email"].sub("[EMAIL_REDACTED]", redacted)
        
        # Phone
        redacted = cls.PATTERNS["phone"].sub("[PHONE_REDACTED]", redacted)
        
        # Bearer token
        redacted = cls.PATTERNS["bearer"].sub("[BEARER_REDACTED]", redacted)
        
        # API Key / Secret
        redacted = cls.PATTERNS["api_key"].sub("[API_KEY_REDACTED]", redacted)
        
        # Password
        redacted = cls.PATTERNS["password"].sub("[PASSWORD_REDACTED]", redacted)
        
        return redacted

    @classmethod
    def redact_dict(cls, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Recursively redact sensitive keys and values in dictionary.
        
        Args:
            data: Input dictionary
            
        Returns:
            Dictionary with redacted values
        """
        if not isinstance(data, dict):
            return data

        redacted = {}
        sensitive_keys = {
            "password", "passwd", "pwd", "api_key", "apikey", "api_secret",
            "token", "secret", "credentials", "auth", "authorization",
            "bearer", "jwt", "private_key", "access_token", "refresh_token",
            "extracted_text", "raw_ai_output", "document_content", "resume_text"
        }

        for key, value in data.items():
            key_lower = key.lower()
            
            # Check if key itself is sensitive
            if any(sensitive in key_lower for sensitive in sensitive_keys):
                redacted[key] = "[REDACTED]"
                continue
            
            # Recursively process nested structures
            if isinstance(value, dict):
                redacted[key] = cls.redact_dict(value)
            elif isinstance(value, list):
                redacted[key] = [
                    cls.redact_dict(item) if isinstance(item, dict) else cls.redact(str(item))
                    for item in value
                ]
            elif isinstance(value, str):
                redacted[key] = cls.redact(value)
            else:
                redacted[key] = value

        return redacted


class JSONFormatter(jsonlogger.JsonFormatter):
    """Custom JSON formatter with PII redaction and context injection."""

    def add_fields(self, log_record: Dict[str, Any], record: logging.LogRecord, message_dict: Dict[str, Any]) -> None:
        """Add custom fields to log record."""
        super().add_fields(log_record, record, message_dict)
        
        # Add trace ID if available
        trace_id = _trace_id_var.get()
        if trace_id:
            log_record["trace_id"] = trace_id
        
        # Add worker ID if available
        worker_id = _worker_id_var.get()
        if worker_id:
            log_record["worker_id"] = worker_id
        
        # Add log level name
        log_record["level"] = record.levelname
        
        # Redact sensitive data
        if "message" in log_record and isinstance(log_record["message"], str):
            log_record["message"] = PIIRedactor.redact(log_record["message"])
        
        # Redact any extra fields
        for key in list(log_record.keys()):
            if key not in {"message", "timestamp", "level", "trace_id", "worker_id"}:
                if isinstance(log_record[key], str):
                    log_record[key] = PIIRedactor.redact(log_record[key])
                elif isinstance(log_record[key], dict):
                    log_record[key] = PIIRedactor.redact_dict(log_record[key])


def configure_logging(log_level: str = "INFO", log_format: str = "json", redact_pii: bool = True) -> None:
    """
    Configure structured logging for the application.
    
    Args:
        log_level: Logging level (DEBUG, INFO, WARNING, ERROR, CRITICAL)
        log_format: Format (json or text)
        redact_pii: Whether to enable PII redaction
    """
    # Configure structlog
    structlog.configure(
        processors=[
            structlog.stdlib.filter_by_level,
            structlog.stdlib.add_logger_name,
            structlog.stdlib.add_log_level,
            structlog.stdlib.PositionalArgumentsFormatter(),
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.UnicodeDecoder(),
            structlog.processors.JSONRenderer()
        ],
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )
    
    # Configure root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(getattr(logging, log_level.upper()))
    
    # Remove existing handlers
    for handler in root_logger.handlers[:]:
        root_logger.removeHandler(handler)
    
    # Create console handler
    console_handler = logging.StreamHandler()
    
    if log_format.lower() == "json":
        formatter = JSONFormatter()
    else:
        formatter = logging.Formatter(
            fmt="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
        )
    
    console_handler.setFormatter(formatter)
    root_logger.addHandler(console_handler)
    
    # Suppress verbose library logs
    logging.getLogger("asyncpg").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("google.auth").setLevel(logging.WARNING)


def get_logger(name: str) -> structlog.BoundLogger:
    """
    Get a logger instance.
    
    Args:
        name: Logger name (typically __name__)
        
    Returns:
        structlog logger instance
    """
    return structlog.get_logger(name)


def set_trace_id(trace_id: str) -> None:
    """Set trace ID for current context."""
    _trace_id_var.set(trace_id)


def set_worker_id(worker_id: str) -> None:
    """Set worker ID for current context."""
    _worker_id_var.set(worker_id)


def get_trace_id() -> str:
    """Get current trace ID."""
    return _trace_id_var.get()
