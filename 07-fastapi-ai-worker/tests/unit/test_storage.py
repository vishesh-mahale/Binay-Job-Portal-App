"""Unit tests for Supabase Storage client."""

from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, patch

from app.storage.supabase_storage import SupabaseStorageClient
from app.core.exceptions import StorageError


def test_storage_client_requires_credentials():
    client = SupabaseStorageClient()
    with pytest.raises(StorageError, match="Supabase Storage credentials not configured"):
        client._project_url = None
        client._key = None
        import asyncio
        asyncio.run(client.download("path/to/file.pdf"))


@pytest.mark.asyncio
async def test_storage_client_download():
    client = SupabaseStorageClient()
    client._project_url = "https://test.supabase.co"
    client._key = "test-key"
    client._bucket = "test-bucket"

    mock_response = AsyncMock()
    mock_response.content = b"file content"
    mock_response.raise_for_status = AsyncMock()

    mock_client = AsyncMock()
    mock_client.get = AsyncMock(return_value=mock_response)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)

    with patch("httpx.AsyncClient", return_value=mock_client):
        filename, content = await client.download("uploads/test.pdf")
    assert filename == "test.pdf"
    assert content == b"file content"
