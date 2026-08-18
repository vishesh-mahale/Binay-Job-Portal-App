"""Unit tests for request size limiting middleware."""

import pytest
from fastapi.testclient import TestClient
from app.main import create_app
from app.core.config import Settings


def test_payload_too_large_rejected(test_settings):
    """Verify requests exceeding MAX_DOCUMENT_SIZE_BYTES are rejected with 413."""
    app = create_app(settings=test_settings)
    client = TestClient(app)

    # Send request with content-length exceeding max
    headers = {
        "content-length": str(test_settings.MAX_DOCUMENT_SIZE_BYTES + 1000),
    }
    response = client.post("/internal/tasks/resume/parse", json={}, headers=headers)
    assert response.status_code == 413
    assert response.json()["error"]["code"] == "PAYLOAD_TOO_LARGE"
