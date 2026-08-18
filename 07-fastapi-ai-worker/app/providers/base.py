"""
Abstract base classes for AI providers.
Defines contract for LLM and Embedding providers.
"""

from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


# ============================================================================
# Schema Definitions
# ============================================================================

class LLMRequest(BaseModel):
    """LLM API request."""
    prompt: str = Field(..., description="System prompt")
    user_input: str = Field(..., description="User input / context")
    temperature: float = Field(default=0.2, ge=0.0, le=2.0)
    max_tokens: int = Field(default=2048, ge=100, le=8192)
    response_schema: Optional[Dict[str, Any]] = Field(
        default=None,
        description="JSON Schema for structured output"
    )


class LLMResponse(BaseModel):
    """LLM API response."""
    text: str = Field(..., description="Generated text")
    model: str = Field(..., description="Model name used")
    tokens_in: int = Field(..., description="Input tokens")
    tokens_out: int = Field(..., description="Output tokens")
    stop_reason: Optional[str] = Field(None, description="Stop reason (e.g., max_tokens, stop_sequence)")


class EmbeddingRequest(BaseModel):
    """Embedding API request."""
    text: str = Field(..., description="Text to embed")
    model: Optional[str] = Field(None, description="Model override")


class EmbeddingResponse(BaseModel):
    """Embedding API response."""
    embedding: List[float] = Field(..., description="768-dimensional vector")
    model: str = Field(..., description="Model name")
    dimension: int = Field(default=768, description="Vector dimension")


# ============================================================================
# Abstract Base Classes
# ============================================================================

class LLMProvider(ABC):
    """
    Abstract base class for Language Model providers.
    
    Implementations must handle:
    - API authentication
    - Request/response serialization
    - Error handling & retries
    - Rate limiting
    - Token counting
    """

    def __init__(self, model_name: str = "gemini-2.0-flash"):
        self.model_name = model_name

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Get provider name (e.g., 'gemini', 'openai')."""
        pass

    @property
    @abstractmethod
    def supported_models(self) -> List[str]:
        """Get list of supported model names."""
        pass

    @abstractmethod
    async def generate(self, request: LLMRequest) -> LLMResponse:
        """Generate text using LLM."""
        pass

    @abstractmethod
    async def generate_structured(
        self,
        prompt: str,
        user_input: str,
        response_schema: Dict[str, Any],
        **kwargs: Any
    ) -> Dict[str, Any]:
        """Generate structured JSON output."""
        pass

    @abstractmethod
    def validate_request(self, request: LLMRequest) -> None:
        """Validate LLM request."""
        pass


class EmbeddingProvider(ABC):
    """
    Abstract base class for Embedding providers.
    
    Implementations must ensure:
    - Consistent 768-dimensional output
    - Symmetric text encoding (same text = same embedding)
    - Error handling & retries
    - Rate limiting
    """

    def __init__(self, model_name: str = "text-embedding-004"):
        self.model_name = model_name

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Get provider name."""
        pass

    @property
    def dimension(self) -> int:
        """Get embedding dimension (must be 768)."""
        return 768

    @abstractmethod
    async def embed(self, request: EmbeddingRequest) -> EmbeddingResponse:
        """Generate embedding for text."""
        pass
