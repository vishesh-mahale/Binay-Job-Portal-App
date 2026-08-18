"""Unit tests for OpenAI provider branches."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch
import pytest

from app.providers.openai import OpenAILLMProvider, OpenAIEmbeddingProvider
from app.providers.base import LLMRequest, EmbeddingResponse


def test_openai_llm_requires_api_key():
    with pytest.raises(ValueError, match="OPENAI_API_KEY is required"):
        OpenAILLMProvider(api_key="")


def test_openai_embedding_requires_api_key():
    with pytest.raises(ValueError, match="OPENAI_API_KEY is required"):
        OpenAIEmbeddingProvider(api_key="")


@pytest.mark.asyncio
async def test_openai_llm_generate():
    provider = OpenAILLMProvider(api_key="test-key")
    mock_response = AsyncMock()
    mock_response.choices = [AsyncMock(message=AsyncMock(content="Hello"))]
    mock_response.usage = AsyncMock(prompt_tokens=10, completion_tokens=5)
    mock_response.choices[0].finish_reason = "stop"

    with patch("openai.AsyncOpenAI") as mock_client:
        mock_client.return_value.chat.completions.create = AsyncMock(return_value=mock_response)
        response = await provider.generate(
            LLMRequest(prompt="Say hello", user_input="Hi", temperature=0.0, max_tokens=100),
        )
    assert response.text == "Hello"
    assert response.model == "gpt-4o-mini"


@pytest.mark.asyncio
async def test_openai_embedding_768_dim():
    provider = OpenAIEmbeddingProvider(api_key="test-key")
    mock_embedding = AsyncMock()
    mock_embedding.data = [AsyncMock(embedding=[0.1] * 768)]
    mock_embedding.usage = AsyncMock(prompt_tokens=10)

    with patch("openai.AsyncOpenAI") as mock_client:
        mock_client.return_value.embeddings.create = AsyncMock(return_value=mock_embedding)
        response = await provider.embed("test text")
    assert len(response) == 768


@pytest.mark.asyncio
async def test_openai_llm_generate_handles_api_error():
    provider = OpenAILLMProvider(api_key="test-key")

    with patch("openai.AsyncOpenAI") as mock_client:
        mock_client.return_value.chat.completions.create = AsyncMock(side_effect=Exception("API error"))
        with pytest.raises(Exception, match="API error"):
            await provider.generate(
                LLMRequest(prompt="Say hello", user_input="Hi", temperature=0.0, max_tokens=100),
            )
