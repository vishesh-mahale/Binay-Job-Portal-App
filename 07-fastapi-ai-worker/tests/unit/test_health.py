"""Unit tests for health endpoints."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from tests.conftest import _build_test_settings


@pytest.fixture
def test_app():
    return create_app(settings=_build_test_settings())


def test_liveness_endpoint(test_app):
    client = TestClient(test_app)
    response = client.get("/health/liveness")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "alive"


def test_root_endpoint(test_app):
    client = TestClient(test_app)
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["service"] == "fastapi-ai-worker"
    assert data["status"] == "running"
