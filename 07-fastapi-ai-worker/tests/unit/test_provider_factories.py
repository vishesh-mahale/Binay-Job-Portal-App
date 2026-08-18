"""Unit tests for task handler provider factories."""

from __future__ import annotations

import pytest
from unittest.mock import patch

from app.api.v1.task_handlers import _get_llm_provider, _get_embedding_provider
from app.providers.mock import MockLLMProvider, MockEmbeddingProvider


class MockSettings:
    def __init__(self, ai_provider="mock", mock_ai_provider=False, embedding_provider=None):
        self.AI_PROVIDER = ai_provider
        self.MOCK_AI_PROVIDER = mock_ai_provider
        self.EMBEDDING_PROVIDER = embedding_provider or "mock"


def test_get_llm_provider_mock():
    settings = MockSettings(ai_provider="mock", mock_ai_provider=True)
    provider = _get_llm_provider(settings)
    assert isinstance(provider, MockLLMProvider)


def test_get_llm_provider_fallback():
    settings = MockSettings(ai_provider="unknown")
    provider = _get_llm_provider(settings)
    assert isinstance(provider, MockLLMProvider)


def test_get_embedding_provider_mock():
    settings = MockSettings(ai_provider="mock", embedding_provider="mock")
    provider = _get_embedding_provider(settings)
    assert isinstance(provider, MockEmbeddingProvider)


def test_get_embedding_provider_fallback():
    settings = MockSettings(ai_provider="unknown", embedding_provider="unknown")
    provider = _get_embedding_provider(settings)
    assert isinstance(provider, MockEmbeddingProvider)
