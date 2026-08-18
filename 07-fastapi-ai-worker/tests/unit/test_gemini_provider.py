"""Unit tests for Gemini provider async wrapper."""

from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, patch

from app.providers.gemini import GeminiLLMProvider, GeminiEmbeddingProvider
from app.providers.base import LLMRequest


def test_gemini_llm_requires_api_key():
    with pytest.raises(ValueError, match="GEMINI_API_KEY is required"):
        GeminiLLMProvider(api_key="")


def test_gemini_embedding_requires_api_key():
    with pytest.raises(ValueError, match="GEMINI_API_KEY is required"):
        GeminiEmbeddingProvider(api_key="")


@pytest.mark.asyncio
async def test_gemini_llm_generate():
    provider = GeminiLLMProvider(api_key="test-key")

    with patch.object(provider, "_run_sync", new_callable=AsyncMock) as mock_run:
        mock_run.return_value = "Hello"
        response = await provider.generate(
            request=LLMRequest(prompt="Say hello", user_input="Hi", temperature=0.0, max_tokens=100)
        )
    assert response.text == "Hello"


@pytest.mark.asyncio
async def test_gemini_embedding_768_dim():
    provider = GeminiEmbeddingProvider(api_key="test-key")
    mock_result = {"embedding": [0.1] * 768}

    with patch("google.generativeai.embed_content", return_value=mock_result):
        embedding = await provider.embed("test text")
    assert len(embedding) == 768
