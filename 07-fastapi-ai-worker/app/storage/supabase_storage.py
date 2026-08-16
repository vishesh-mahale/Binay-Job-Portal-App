"""Supabase Storage client for secure document download."""

from __future__ import annotations

import logging
from typing import Optional

from app.core.config import get_settings
from app.core.exceptions import StorageError

logger = logging.getLogger(__name__)


class SupabaseStorageClient:
    """Secure document download from Supabase Storage."""

    def __init__(self) -> None:
        settings = get_settings()
        self._bucket = settings.SUPABASE_STORAGE_BUCKET
        self._project_url = settings.SUPABASE_PROJECT_URL
        self._key = settings.SUPABASE_STORAGE_KEY
        self._signed_url_expiry = settings.SIGNED_URL_EXPIRY_SECONDS

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
        except Exception as exc:
            logger.error("Storage download failed", path=path, error=str(exc))
            raise StorageError("download", str(exc), retryable=True) from exc
