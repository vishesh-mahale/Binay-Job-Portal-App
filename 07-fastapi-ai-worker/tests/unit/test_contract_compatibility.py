import json
from pathlib import Path

from app.schemas.tasks import SecurityScanTaskPayload


def test_security_scan_schema_and_worker_model_have_same_required_identity_fields():
    repo_root = Path(__file__).resolve().parents[3]
    schema_path = repo_root / "contracts" / "tasks" / "security-scan-task.v1.json"
    schema = json.loads(schema_path.read_text(encoding="utf-8"))

    expected = {"schema_version", "event_id", "aggregate_id", "trace_id"}
    assert set(schema["required"]) == expected
    assert schema["additionalProperties"] is False

    sample = {
        "schema_version": 1,
        "event_id": "11111111-1111-4111-8111-111111111111",
        "aggregate_id": "22222222-2222-4222-8222-222222222222",
        "trace_id": "33333333-3333-4333-8333-333333333333",
    }
    parsed = SecurityScanTaskPayload.model_validate(sample)
    assert set(parsed.model_dump()) == expected


def test_security_scan_worker_model_rejects_payload_content_or_storage_url():
    sample = {
        "schema_version": 1,
        "event_id": "11111111-1111-4111-8111-111111111111",
        "aggregate_id": "22222222-2222-4222-8222-222222222222",
        "trace_id": "33333333-3333-4333-8333-333333333333",
        "storage_url": "must-not-cross-service-boundary",
    }
    parsed = SecurityScanTaskPayload.model_validate(sample)
    assert "storage_url" not in parsed.model_dump()
