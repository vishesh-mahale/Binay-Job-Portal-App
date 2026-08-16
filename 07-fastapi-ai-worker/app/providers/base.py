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
    dimension: int = Field(..., description="Vector dimension")


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
        """
        Generate text using LLM.
        
        Args:
            request: LLM request
            
        Returns:
            Generated response
            
        Raises:
            AIProviderError: If API call fails
            RateLimitError: If rate limited
            TimeoutError: If call times out
        """
        pass

    @abstractmethod
    async def generate_structured(
        self,
        prompt: str,
        user_input: str,
        response_schema: Dict[str, Any],
        **kwargs: Any
    ) -> Dict[str, Any]:
        """
        Generate structured JSON output.
        
        Args:
            prompt: System prompt
            user_input: User input
            response_schema: JSON Schema for output
            **kwargs: Additional provider-specific options
            
        Returns:
            Parsed JSON response matching schema
            
        Raises:
            AIProviderError: If call fails
            AIResponseValidationError: If response doesn't match schema
        """
        pass

    @abstractmethod
    def validate_request(self, request: LLMRequest) -> None:
        """
        Validate LLM request.
        
        Args:
            request: Request to validate
            
        Raises:
            ValueError: If request is invalid
        """
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

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Get provider name."""
        pass

    @property
    @abstractmethod
    def model_name(self) -> str:
        """Get model name."""
        pass

    @property
    @abstractmethod
    def dimension(self) -> int:
        """Get embedding dimension (must be 768)."""
        return 768

    @abstractmethod
    async def embed(self, text: str) -> List[float]:
        """
        Generate embedding for text.
        
        Args:
            text: Text to embed
            
        Returns:
            768-dimensional vector
            
        Raises:
            AIProviderError: If API call fails
            ValueError: If text exceeds length limits
        """
        pass

    @abstractmethod
    async def embed_batch(self, texts: List[str]) -> List[List[float]]:
        """
        Generate embeddings for multiple texts.
        
        Args:
            texts: Texts to embed
            
        Returns:
            List of 768-dimensional vectors
        """
        pass

    @abstractmethod
    def validate_embedding(self, embedding: List[float]) -> None:
        """
        Validate embedding vector.
        
        Args:
            embedding: Vector to validate
            
        Raises:
            ValueError: If embedding is invalid
        """
        pass


# ============================================================================
# Provider Factory
# ============================================================================

class ProviderFactory:
    """Factory for creating provider instances."""

    _providers: Dict[str, type] = {}

    @classmethod
    def register(cls, name: str, provider_class: type) -> None:
        """Register a provider class."""
        cls._providers[name.lower()] = provider_class

    @classmethod
    def create_llm_provider(cls, provider_name: str, **kwargs: Any) -> LLMProvider:
        """Create LLM provider instance."""
        provider_class = cls._providers.get(provider_name.lower())
        if not provider_class:
            raise ValueError(f"Unknown LLM provider: {provider_name}")
        return provider_class(**kwargs)

    @classmethod
    def create_embedding_provider(cls, provider_name: str, **kwargs: Any) -> EmbeddingProvider:
        """Create embedding provider instance."""
        provider_class = cls._providers.get(provider_name.lower())
        if not provider_class:
            raise ValueError(f"Unknown embedding provider: {provider_name}")
        return provider_class(**kwargs)
