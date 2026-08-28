import pytest

from app.schemas.tasks import SecurityScanTaskPayload
from app.services.security_scanner import ClamAVScannerProvider, ScannerUnavailable


def test_security_scan_task_payload_is_uniform_identity_payload():
    payload = SecurityScanTaskPayload(
        schema_version=1,
        event_id="11111111-1111-4111-8111-111111111111",
        aggregate_id="22222222-2222-4222-8222-222222222222",
        trace_id="33333333-3333-4333-8333-333333333333",
    )
    assert payload.model_dump() == {
        "schema_version": 1,
        "event_id": "11111111-1111-4111-8111-111111111111",
        "aggregate_id": "22222222-2222-4222-8222-222222222222",
        "trace_id": "33333333-3333-4333-8333-333333333333",
    }


@pytest.mark.asyncio
async def test_clamav_result_maps_clean_response(monkeypatch):
    provider = object.__new__(ClamAVScannerProvider)
    provider.host = "127.0.0.1"
    provider.port = 3310
    provider.timeout = 5
    monkeypatch.setattr(
        provider,
        "_scan_sync",
        lambda content: {
            "status": "OK",
            "signature": None,
            "engine_version": "ClamAV 1.0",
            "signature_version": "daily-1",
        },
    )

    result = await provider.scan(b"safe", "a" * 64)

    assert result.verdict == "clean"
    assert result.threats == []
    assert result.engine_version == "ClamAV 1.0"
    assert result.signature_version == "daily-1"
    assert result.file_size_bytes == 4


@pytest.mark.asyncio
async def test_clamav_unavailable_is_fail_closed(monkeypatch):
    provider = object.__new__(ClamAVScannerProvider)
    provider.timeout = 5
    monkeypatch.setattr(provider, "_scan_sync", lambda content: (_ for _ in ()).throw(ConnectionError("down")))

    with pytest.raises(ScannerUnavailable):
        await provider.scan(b"file", "b" * 64)
