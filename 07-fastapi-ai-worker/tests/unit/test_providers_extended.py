"""Unit tests for Gemini and OpenAI provider edge cases and error branches."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.providers.gemini import GeminiLLMProvider, GeminiEmbeddingProvider
from app.providers.openai import OpenAILLMProvider, OpenAIEmbeddingProvider
from app.providers.base import LLMRequest, EmbeddingRequest
from app.core.exceptions import AIProviderError, AIResponseValidationError


@pytest.mark.asyncio
async def test_gemini_generate_structured_success():
    """Verify GeminiLLMProvider generate_structured parses JSON."""
    with patch("google.generativeai.configure"), patch("google.generativeai.GenerativeModel") as mock_gm_cls:
        mock_model = MagicMock()
        mock_response = MagicMock()
        mock_response.text = '{"name": "Alice", "skills": ["Python"]}'
        mock_model.generate_content.return_value = mock_response
        mock_gm_cls.return_value = mock_model

        provider = GeminiLLMProvider(api_key="test-api-key")

        result = await provider.generate_structured(
            prompt="Extract",
            user_input="Alice knows Python",
            response_schema={"type": "object"},
        )
        assert result["name"] == "Alice"
        assert "Python" in result["skills"]


@pytest.mark.asyncio
async def test_gemini_generate_structured_json_error():
    """Verify GeminiLLMProvider raises AIProviderError on invalid JSON."""
    with patch("google.generativeai.configure"), patch("google.generativeai.GenerativeModel") as mock_gm_cls:
        mock_model = MagicMock()
        mock_response = MagicMock()
        mock_response.text = "NOT JSON"
        mock_model.generate_content.return_value = mock_response
        mock_gm_cls.return_value = mock_model

        provider = GeminiLLMProvider(api_key="test-api-key")

        with pytest.raises(AIProviderError):
            await provider.generate_structured(
                prompt="Extract",
                user_input="Text",
                response_schema={"type": "object"},
            )


@pytest.mark.asyncio
async def test_openai_generate_structured_success():
    """Verify OpenAILLMProvider generate_structured parses JSON."""
    with patch("openai.AsyncOpenAI") as mock_openai_cls:
        mock_client = MagicMock()
        mock_choice = MagicMock()
        mock_choice.message.content = '{"match_score": 92.5}'
        mock_completion = MagicMock()
        mock_completion.choices = [mock_choice]
        mock_client.chat.completions.create = AsyncMock(return_value=mock_completion)
        mock_openai_cls.return_value = mock_client

        provider = OpenAILLMProvider(api_key="test-api-key")

        result = await provider.generate_structured(
            prompt="Score candidate",
            user_input="Context",
            response_schema={"type": "object"},
        )
        assert result["match_score"] == 92.5


@pytest.mark.asyncio
async def test_openai_generate_structured_invalid_json():
    """Verify OpenAILLMProvider raises AIProviderError on invalid JSON."""
    with patch("openai.AsyncOpenAI") as mock_openai_cls:
        mock_client = MagicMock()
        mock_choice = MagicMock()
        mock_choice.message.content = 'Invalid JSON <<<'
        mock_completion = MagicMock()
        mock_completion.choices = [mock_choice]
        mock_client.chat.completions.create = AsyncMock(return_value=mock_completion)
        mock_openai_cls.return_value = mock_client

        provider = OpenAILLMProvider(api_key="test-api-key")

        with pytest.raises(AIProviderError):
            await provider.generate_structured(
                prompt="Score candidate",
                user_input="Context",
                response_schema={"type": "object"},
            )
