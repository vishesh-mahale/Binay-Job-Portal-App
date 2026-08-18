"""Supabase Storage client for secure document download."""

from __future__ import annotations

import logging
from typing import Optional

from app.core.config import Settings, get_settings
from app.core.exceptions import StorageError
from app.core.logging import get_logger

logger = get_logger(__name__)


class SupabaseStorageClient:
    """Secure document download from Supabase Storage."""

    def __init__(self, settings: Optional[Settings] = None) -> None:
        cfg = settings or get_settings()
        self._bucket = cfg.SUPABASE_STORAGE_BUCKET
        self._project_url = cfg.SUPABASE_PROJECT_URL
        self._key = cfg.SUPABASE_STORAGE_KEY
        self._signed_url_expiry = cfg.SIGNED_URL_EXPIRY_SECONDS

    async def download(self, path: str) -> tuple[str, bytes]:
        """
        Download file from Supabase Storage.
        
        Args:
            path: Storage path (not public URL)
            
        Returns:
            Tuple of (filename, bytes)
        """
        if not self._project_url or not self._key:
            raise StorageError(
                "download",
                "Supabase Storage credentials not configured",
                retryable=False,
            )

        try:
            import httpx

            filename = path.split("/")[-1] if "/" in path else path
            signed_url = (
                f"{self._project_url}/storage/v1/object/authenticated/{self._bucket}/{path}"
            )

            async with httpx.AsyncClient() as client:
                response = await client.get(
                    signed_url,
                    headers={"apikey": self._key, "Authorization": f"Bearer {self._key}"},
                    timeout=httpx.Timeout(30.0),
                )
                response.raise_for_status()
                return filename, response.content
        except StorageError:
            raise
        except Exception as exc:
            logger.error("Supabase storage download failed", path=path, error=str(exc))
            raise StorageError("download", str(exc), retryable=True) from exc
