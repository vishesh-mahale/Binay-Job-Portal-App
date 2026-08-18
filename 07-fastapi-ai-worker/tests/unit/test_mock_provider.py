"""Unit tests for Mock provider branches."""

from __future__ import annotations

import pytest
from unittest.mock import AsyncMock

from app.providers.mock import MockLLMProvider, MockEmbeddingProvider
from app.providers.base import LLMRequest, EmbeddingResponse


def test_mock_llm_provider_defaults():
    provider = MockLLMProvider()
    assert provider.provider_name == "mock"
    assert provider.supported_models == ["mock-llm-v1"]


def test_mock_embedding_provider_defaults():
    provider = MockEmbeddingProvider()
    assert provider.provider_name == "mock"
    assert provider.model_name == "mock-embedding-v1"


@pytest.mark.asyncio
async def test_mock_llm_generate():
    provider = MockLLMProvider()
    response = await provider.generate(
        LLMRequest(prompt="Say hello", user_input="Hi", temperature=0.0, max_tokens=100)
    )
    assert response.text == "Mock LLM response for testing"
    assert response.model == "mock-llm-v1"


@pytest.mark.asyncio
async def test_mock_embedding():
    provider = MockEmbeddingProvider()
    response = await provider.embed("test text")
    assert isinstance(response, list)
    assert len(response) == 768
