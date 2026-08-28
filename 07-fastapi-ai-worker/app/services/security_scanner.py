"""ClamAV scanner adapter used by the dedicated security task handler."""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
import io
import time
from dataclasses import dataclass
from typing import Any

from app.core.config import Settings, get_settings


@dataclass(frozen=True)
class ScanResult:
    verdict: str
    provider: str
    engine_version: str
    signature_version: str
    scanned_at: str
    duration_ms: int
    file_size_bytes: int
    checksum_sha256: str
    threats: list[str]
    error: dict[str, Any] | None = None


class ScannerUnavailable(Exception):
    """Scanner could not be reached; caller must retry and fail closed."""


class ClamAVScannerProvider:
    """Scan bytes through a private clamd TCP endpoint."""

    def __init__(self, settings: Settings | None = None) -> None:
        cfg = settings or get_settings()
        self.host = cfg.CLAMAV_HOST
        self.port = cfg.CLAMAV_PORT
        self.timeout = cfg.CLAMAV_TIMEOUT_SECONDS

    async def scan(self, content: bytes, checksum_sha256: str) -> ScanResult:
        started = time.monotonic()
        try:
            raw = await asyncio.wait_for(
                asyncio.to_thread(self._scan_sync, content), timeout=self.timeout
            )
        except Exception as exc:
            raise ScannerUnavailable(str(exc)) from exc

        duration_ms = int((time.monotonic() - started) * 1000)
        scanned_at = datetime.now(timezone.utc).isoformat()
        verdict = "clean" if raw.get("status") == "OK" else "infected"
        threats = [] if verdict == "clean" else [str(raw.get("signature", "unknown_threat"))[:200]]
        return ScanResult(
            verdict=verdict,
            provider="clamav",
            engine_version=str(raw.get("engine_version", "unknown"))[:100],
            signature_version=str(raw.get("signature_version", "unknown"))[:200],
            scanned_at=scanned_at,
            duration_ms=duration_ms,
            file_size_bytes=len(content),
            checksum_sha256=checksum_sha256,
            threats=threats,
        )

    def _scan_sync(self, content: bytes) -> dict[str, Any]:
        import clamd

        client = clamd.ClamdNetworkSocket(host=self.host, port=self.port)
        client.socket.settimeout(self.timeout)
        response = client.instream(io.BytesIO(content))
        result = response.get("stream") if isinstance(response, dict) else response
        if not isinstance(result, tuple) or len(result) < 2:
            raise ScannerUnavailable("invalid clamd response")
        status, signature = result[0], result[1]
        version = str(client.version())
        return {
            "status": status,
            "signature": signature,
            "engine_version": version,
            "signature_version": version,
        }
