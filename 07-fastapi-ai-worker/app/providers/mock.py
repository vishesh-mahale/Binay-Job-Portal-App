"""
Mock AI Provider for deterministic testing.
Returns predictable responses without calling external APIs.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional
import json
import logging

from app.providers.base import (
    LLMProvider,
    EmbeddingProvider,
    LLMRequest,
    LLMResponse,
    EmbeddingRequest,
    EmbeddingResponse,
)
from app.core.exceptions import AIResponseValidationError
from app.core.logging import get_logger

logger = get_logger(__name__)


class MockLLMProvider(LLMProvider):
    """Mock LLM provider for testing."""

    def __init__(self, model_name: str = "mock-llm-v1"):
        """Initialize mock provider."""
        super().__init__(model_name=model_name)
        self.model_name = model_name
        logger.warning("Using MockLLMProvider; set AI_PROVIDER != 'mock' for production")

    @property
    def provider_name(self) -> str:
        return "mock"

    @property
    def supported_models(self) -> List[str]:
        return ["mock-llm-v1"]

    def validate_request(self, request: LLMRequest) -> None:
        """Validate request."""
        if not request.prompt or not request.user_input:
            raise ValueError("Prompt and user_input required")

    async def generate(self, request: LLMRequest) -> LLMResponse:
        """
        Generate mock response.
        
        Returns deterministic response based on input.
        """
        self.validate_request(request)
        
        logger.debug("Mock LLM generation", prompt_len=len(request.prompt))
        
        # Deterministic mock response
        mock_text = "Mock LLM response for testing"
        
        return LLMResponse(
            text=mock_text,
            model=self.model_name,
            tokens_in=len(request.prompt.split()),
            tokens_out=len(mock_text.split()),
            stop_reason="stop_sequence"
        )

    async def generate_structured(
        self,
        prompt: str,
        user_input: str,
        response_schema: Dict[str, Any],
        **kwargs: Any
    ) -> Dict[str, Any]:
        """
        Generate mock structured response.
        
        Returns mock JSON matching schema properties.
        """
        logger.debug("Mock structured generation", schema_keys=list(response_schema.get("properties", {}).keys()))
        
        # Generate mock response matching schema
        properties = response_schema.get("properties", {})
        mock_response: Dict[str, Any] = {}
        
        for prop_name, prop_schema in properties.items():
            if isinstance(prop_schema, dict):
                prop_type = prop_schema.get("type")
                if prop_type == "string":
                    mock_response[prop_name] = f"Mock {prop_name}"
                elif prop_type == "number":
                    mock_response[prop_name] = 85.0
                elif prop_type == "integer":
                    mock_response[prop_name] = 1
                elif prop_type == "boolean":
                    mock_response[prop_name] = True
                elif prop_type == "array":
                    mock_response[prop_name] = []
                elif prop_type == "object":
                    mock_response[prop_name] = {}
                else:
                    mock_response[prop_name] = None
        
        return mock_response


class MockEmbeddingProvider(EmbeddingProvider):
    """Mock embedding provider for testing."""

    def __init__(self, model_name: str = "mock-embedding-v1"):
        """Initialize mock provider."""
        super().__init__(model_name=model_name)
        self.model_name = model_name

    @property
    def provider_name(self) -> str:
        return "mock"

    @property
    def embedding_dimensions(self) -> int:
        return 768

    async def embed(self, text_or_request: Any) -> List[float]:
        """
        Generate mock 768-dim embedding.
        
        Returns deterministic normalized vector of 768 floats.
        """
        import hashlib
        import math
        
        text_str = text_or_request.text if hasattr(text_or_request, "text") else str(text_or_request)
        hash_bytes = hashlib.sha256(text_str.encode()).digest()
        
        # Create 768-dim vector from hash bytes (repeat to reach 768)
        raw_vector = []
        for i in range(768):
            byte_idx = i % len(hash_bytes)
            raw_vector.append(float(hash_bytes[byte_idx]) / 255.0 - 0.5)
        
        # Normalize vector
        magnitude = math.sqrt(sum(x * x for x in raw_vector))
        if magnitude > 0:
            normalized = [x / magnitude for x in raw_vector]
        else:
            normalized = [0.0] * 768
            normalized[0] = 1.0
        
        return normalized
