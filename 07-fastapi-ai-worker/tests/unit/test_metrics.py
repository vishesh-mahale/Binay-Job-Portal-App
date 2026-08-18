"""Unit tests for Prometheus MetricsCollector and /metrics endpoints."""

import pytest
from fastapi.testclient import TestClient
from app.core.metrics import MetricsCollector, get_metrics_collector


def test_metrics_collector_counter_and_gauge():
    """Verify counter and gauge recording and Prometheus formatting."""
    collector = MetricsCollector()
    collector.inc_counter("ai_tasks_total", 1.0, labels={"task": "resume_parse", "status": "success"})
    collector.inc_counter("ai_tasks_total", 2.0, labels={"task": "resume_parse", "status": "success"})
    collector.set_gauge("circuit_state", 0.0, labels={"name": "gemini"})
    collector.observe_duration("ai_task_duration_seconds", 0.42, labels={"task": "resume_parse"})

    text = collector.generate_metrics_text()
    assert 'ai_tasks_total{status="success",task="resume_parse"} 3.0' in text
    assert 'circuit_state{name="gemini"} 0.0' in text
    assert 'ai_task_duration_seconds_count{task="resume_parse"} 1.0' in text


def test_metrics_endpoints(test_app):
    """Verify GET /metrics and GET /health/metrics return 200 with text/plain."""
    client = TestClient(test_app)

    res1 = client.get("/metrics")
    assert res1.status_code == 200
    assert "fastapi_ai_worker_metrics" in res1.text

    res2 = client.get("/health/metrics")
    assert res2.status_code == 200
    assert "fastapi_ai_worker_metrics" in res2.text


def test_get_metrics_collector_singleton():
    """Verify global collector singleton."""
    c1 = get_metrics_collector()
    c2 = get_metrics_collector()
    assert c1 is c2
