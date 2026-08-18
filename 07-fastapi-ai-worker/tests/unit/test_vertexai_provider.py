"""Unit tests for Vertex AI 0-Key IAM provider."""

from __future__ import annotations

import json
import sys
from unittest.mock import AsyncMock, MagicMock, patch
import pytest

from app.core.exceptions import AIProviderError, RateLimitError
from app.providers.base import EmbeddingRequest, LLMRequest
from app.providers.vertexai import VertexAIEmbeddingProvider, VertexAILLMProvider


@pytest.fixture(autouse=True)
def mock_vertexai_modules():
    """Mock the vertexai SDK modules in sys.modules for isolated unit testing."""
    mock_vertexai = MagicMock()
    mock_gen_models = MagicMock()
    mock_lang_models = MagicMock()

    with patch.dict(
        sys.modules,
        {
            "vertexai": mock_vertexai,
            "vertexai.generative_models": mock_gen_models,
            "vertexai.language_models": mock_lang_models,
        },
    ):
        yield {
            "vertexai": mock_vertexai,
            "generative_models": mock_gen_models,
            "language_models": mock_lang_models,
        }


def test_vertexai_llm_metadata():
    provider = VertexAILLMProvider(project_id="test-project", location="asia-south1", model_name="gemini-2.0-flash")
    assert provider.provider_name == "vertexai"
    assert "gemini-2.0-flash" in provider.supported_models


def test_vertexai_embedding_metadata():
    provider = VertexAIEmbeddingProvider(project_id="test-project", location="asia-south1")
    assert provider.provider_name == "vertexai"
    assert provider.dimension == 768


@pytest.mark.asyncio
async def test_vertexai_llm_generate():
    provider = VertexAILLMProvider(project_id="test-project", location="asia-south1", model_name="gemini-2.0-flash")
    provider._initialized = True

    with patch.object(provider, "_run_sync", new_callable=AsyncMock) as mock_run:
        mock_run.return_value = "Vertex AI generated response"
        response = await provider.generate(
            request=LLMRequest(prompt="Say hello", user_input="Hi", temperature=0.2, max_tokens=2048)
        )
    assert response.text == "Vertex AI generated response"
    assert response.model == "gemini-2.0-flash"
    assert response.stop_reason == "stop"


@pytest.mark.asyncio
async def test_vertexai_llm_generate_structured():
    provider = VertexAILLMProvider(project_id="test-project", location="asia-south1", model_name="gemini-2.0-flash")
    provider._initialized = True

    sample_json = {"name": "Test Candidate", "skills": ["Python", "FastAPI"]}
    with patch.object(provider, "_run_sync", new_callable=AsyncMock) as mock_run:
        mock_run.return_value = f"```json\n{json.dumps(sample_json)}\n```"
        result = await provider.generate_structured(
            prompt="Extract resume details",
            user_input="Resume text...",
            response_schema={"type": "object"},
        )
    assert result == sample_json
    assert result["name"] == "Test Candidate"


@pytest.mark.asyncio
async def test_vertexai_embedding_768_dim():
    provider = VertexAIEmbeddingProvider(project_id="test-project", location="asia-south1")
    provider._initialized = True

    mock_emb = [0.05] * 768
    with patch.object(provider, "_run_sync", new_callable=AsyncMock) as mock_run:
        mock_run.return_value = mock_emb
        response = await provider.embed(EmbeddingRequest(text="Software engineer with Python experience"))
    assert len(response.embedding) == 768
    assert response.dimension == 768
    assert response.model == "text-embedding-004"


@pytest.mark.asyncio
async def test_vertexai_embedding_batch():
    provider = VertexAIEmbeddingProvider(project_id="test-project", location="asia-south1")
    provider._initialized = True

    mock_embeddings = [[0.01] * 768, [0.02] * 768]
    with patch.object(provider, "_run_sync", new_callable=AsyncMock) as mock_run:
        mock_run.return_value = mock_embeddings
        results = await provider.embed_batch(["text 1", "text 2"])
    assert len(results) == 2
    assert len(results[0]) == 768
    assert len(results[1]) == 768


@pytest.mark.asyncio
async def test_vertexai_rate_limit_handling():
    provider = VertexAILLMProvider(project_id="test-project", location="asia-south1")
    provider._initialized = True

    with patch.object(provider, "_run_sync", new_callable=AsyncMock) as mock_run:
        mock_run.side_effect = Exception("429 ResourceExhausted: Quota exceeded")
        with pytest.raises(RateLimitError):
            await provider.generate(
                request=LLMRequest(prompt="Test", user_input="Test input", temperature=0.2, max_tokens=100)
            )
