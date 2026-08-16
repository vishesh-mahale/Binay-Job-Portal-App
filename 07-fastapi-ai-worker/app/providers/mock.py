"""
Mock AI Provider for deterministic testing.
Returns predictable responses without calling external APIs.
"""

from typing import Any, Dict, List, Optional
import json
import logging

from app.providers.base import LLMProvider, EmbeddingProvider, LLMRequest, LLMResponse, EmbeddingResponse
from app.core.exceptions import AIResponseValidationError


logger = logging.getLogger(__name__)


class MockLLMProvider(LLMProvider):
    """Mock LLM provider for testing."""

    def __init__(self):
        """Initialize mock provider."""
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
            model="mock-llm-v1",
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
                    mock_response[prop_name] = 0.5
                elif prop_type == "integer":
                    mock_response[prop_name] = 0
                elif prop_type == "boolean":
                    mock_response[prop_name] = False
                elif prop_type == "array":
                    mock_response[prop_name] = []
                elif prop_type == "object":
                    mock_response[prop_name] = {}
                else:
                    mock_response[prop_name] = None
        
        return mock_response


class MockEmbeddingProvider(EmbeddingProvider):
    """Mock embedding provider for testing."""

    def __init__(self):
        """Initialize mock provider."""
        self._dimension = 768
        logger.warning("Using MockEmbeddingProvider; set EMBEDDING_PROVIDER != 'mock' for production")

    @property
    def provider_name(self) -> str:
        return "mock"

    @property
    def model_name(self) -> str:
        return "mock-embedding-v1"

    @property
    def dimension(self) -> int:
        return self._dimension

    def validate_embedding(self, embedding: List[float]) -> None:
        """Validate embedding."""
        if len(embedding) != self.dimension:
            raise ValueError(f"Expected {self.dimension}-dimensional vector, got {len(embedding)}")
        if not all(isinstance(x, (int, float)) for x in embedding):
            raise ValueError("All elements must be numbers")

    async def embed(self, text: str) -> List[float]:
        """
        Generate mock embedding.
        
        Returns deterministic vector based on text hash.
        """
        if not text:
            raise ValueError("Text cannot be empty")
        
        # Deterministic mock: hash text and generate vector
        hash_val = hash(text) % 1000
        vector = [(hash_val + i) / 1000.0 for i in range(self.dimension)]
        
        logger.debug("Mock embedding generated", text_len=len(text), dim=self.dimension)
        
        return vector

    async def embed_batch(self, texts: List[str]) -> List[List[float]]:
        """Generate embeddings for batch."""
        return [await self.embed(text) for text in texts]
