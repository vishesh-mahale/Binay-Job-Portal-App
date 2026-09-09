"""ClamAV scanner adapter used by the dedicated security task handler."""

from __future__ import annotations

from datetime import datetime, timezone
import io
import shutil
import subprocess
import time
from dataclasses import dataclass
from typing import Any

import httpx
from google.oauth2 import id_token
from google.auth.transport.requests import Request

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


def _get_identity_token(audience: str) -> str:
    """Get Google OIDC identity token. Production uses ADC, local falls back to gcloud CLI."""
    try:
        return id_token.fetch_id_token(Request(), audience)
    except Exception:
        gcloud = shutil.which("gcloud")
        if not gcloud:
            raise RuntimeError("gcloud CLI not found — set GOOGLE_APPLICATION_CREDENTIALS or install gcloud")
        return subprocess.check_output([gcloud, "auth", "print-identity-token"], text=True, timeout=30).strip()


class ClamAVScannerProvider:
    """Scan bytes through ClamAV Cloud Run service via HTTP."""

    def __init__(self, settings: Settings | None = None) -> None:
        cfg = settings or get_settings()
        self.host = cfg.CLAMAV_HOST
        self.port = cfg.CLAMAV_PORT
        self.timeout = cfg.CLAMAV_TIMEOUT_SECONDS

    async def scan(self, content: bytes, checksum_sha256: str) -> ScanResult:
        started = time.monotonic()
        raw = await self._scan_http(content)
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

    async def _scan_http(self, content: bytes) -> dict[str, Any]:
        url = f"{self.host}:{self.port}/scan" if self.port not in (443, 80) else f"{self.host}/scan"
        token = _get_identity_token(self.host)
        headers = {"Authorization": f"Bearer {token}"}
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    url,
                    headers=headers,
                    files={"file": ("scan.bin", io.BytesIO(content), "application/octet-stream")},
                )
                response.raise_for_status()
                data = response.json()
                return {
                    "status": "OK" if data.get("verdict") == "clean" else "FOUND",
                    "signature": data.get("reason", ""),
                    "engine_version": "cloud-run",
                    "signature_version": "cloud-run",
                }
        except (httpx.HTTPError, httpx.TimeoutException) as exc:
            raise ScannerUnavailable(str(exc)) from exc
