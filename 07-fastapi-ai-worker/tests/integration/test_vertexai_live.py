"""
Live Integration Tests for Vertex AI 0-Key IAM Authentication.
Runs real live requests against Google Cloud Vertex AI if valid Application Default Credentials (ADC) exist.
Automatically skips if running in an unauthenticated CI/CD environment.
"""

from __future__ import annotations

import os
import pytest

from app.providers.base import EmbeddingRequest, LLMRequest
from app.providers.vertexai import VertexAIEmbeddingProvider, VertexAILLMProvider


def _has_gcp_credentials() -> bool:
    """Check if real Google Cloud Application Default Credentials exist."""
    try:
        import google.auth
        credentials, project = google.auth.default()
        return credentials is not None and bool(project or os.getenv("GOOGLE_CLOUD_PROJECT_ID"))
    except Exception:
        return False


GCP_CREDENTIALS_AVAILABLE = _has_gcp_credentials()


@pytest.mark.integration
@pytest.mark.skipif(
    not GCP_CREDENTIALS_AVAILABLE,
    reason="Live Vertex AI integration test skipped: No Google Cloud ADC found on machine. Run `gcloud auth application-default login` to enable."
)
@pytest.mark.asyncio
async def test_live_vertexai_llm_generation():
    project_id = os.getenv("GOOGLE_CLOUD_PROJECT_ID", "binay-job-portal-dev")
    region = os.getenv("GCP_REGION", "asia-south1")

    provider = VertexAILLMProvider(project_id=project_id, location=region, model_name="gemini-2.0-flash")

    response = await provider.generate(
        LLMRequest(
            prompt="You are a helpful assistant.",
            user_input="Reply with the single word 'CONFIRMED'.",
            temperature=0.0,
            max_tokens=100,
        )
    )

    assert response.text is not None
    assert len(response.text) > 0
    assert response.model == "gemini-2.0-flash"


@pytest.mark.integration
@pytest.mark.skipif(
    not GCP_CREDENTIALS_AVAILABLE,
    reason="Live Vertex AI integration test skipped: No Google Cloud ADC found on machine. Run `gcloud auth application-default login` to enable."
)
@pytest.mark.asyncio
async def test_live_vertexai_embedding_768():
    project_id = os.getenv("GOOGLE_CLOUD_PROJECT_ID", "binay-job-portal-dev")
    region = os.getenv("GCP_REGION", "asia-south1")

    provider = VertexAIEmbeddingProvider(project_id=project_id, location=region)

    response = await provider.embed(
        EmbeddingRequest(text="Software Engineer with Python, PostgreSQL, and FastAPI expertise")
    )

    assert len(response.embedding) == 768
    assert response.dimension == 768
    assert response.model == "text-embedding-004"
