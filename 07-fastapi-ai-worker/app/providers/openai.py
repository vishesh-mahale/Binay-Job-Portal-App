"""OpenAI provider implementation."""

from __future__ import annotations

import json
from typing import Any, Dict, List, Optional

from app.core.config import get_settings
from app.core.exceptions import AIProviderError, RateLimitError
from app.providers.base import EmbeddingProvider, LLMProvider, LLMRequest, LLMResponse


from app.core.circuit_breaker import get_circuit_breaker


class OpenAILLMProvider(LLMProvider):
    """OpenAI provider for structured resume parsing."""

    def __init__(self, api_key: Optional[str] = None, model: str = "gpt-4o-mini") -> None:
        settings = get_settings()
        self._api_key = api_key or settings.OPENAI_API_KEY
        self._model = model or settings.OPENAI_MODEL
        if not self._api_key:
            raise ValueError("OPENAI_API_KEY is required")
        self._cb = get_circuit_breaker("openai_llm")

    @property
    def provider_name(self) -> str:
        return "openai"

    @property
    def supported_models(self) -> List[str]:
        return ["gpt-4o-mini", "gpt-4o", "gpt-4-turbo"]

    def validate_request(self, request: LLMRequest) -> None:
        if not request.prompt or not request.user_input:
            raise ValueError("Prompt and user_input are required")
        if request.max_tokens < 100:
            raise ValueError("max_tokens must be at least 100")

    async def generate(self, request: LLMRequest) -> LLMResponse:
        self.validate_request(request)
        try:
            from openai import AsyncOpenAI

            client = AsyncOpenAI(api_key=self._api_key)
            response = await client.chat.completions.create(
                model=self._model,
                messages=[
                    {"role": "system", "content": request.prompt},
                    {"role": "user", "content": request.user_input},
                ],
                temperature=request.temperature,
                max_tokens=request.max_tokens,
            )
            choice = response.choices[0] if response.choices else None
            text = choice.message.content if choice and choice.message else ""
            return LLMResponse(
                text=text or "",
                model=self._model,
                tokens_in=response.usage.prompt_tokens if response.usage else 0,
                tokens_out=response.usage.completion_tokens if response.usage else 0,
                stop_reason=choice.finish_reason if choice else None,
            )
        except Exception as exc:  # pragma: no cover - external dependency
            raise AIProviderError("openai", str(exc), retryable=True) from exc

    async def generate_structured(
        self,
        prompt: str,
        user_input: str,
        response_schema: Dict[str, Any],
        **kwargs: Any,
    ) -> Dict[str, Any]:
        try:
            from openai import AsyncOpenAI

            client = AsyncOpenAI(api_key=self._api_key)
            response = await client.chat.completions.create(
                model=self._model,
                response_format={"type": "json_schema", "json_schema": response_schema},
                messages=[
                    {"role": "system", "content": prompt},
                    {"role": "user", "content": user_input},
                ],
                temperature=kwargs.get("temperature", 0.2),
                max_tokens=kwargs.get("max_tokens", 2048),
            )
            choice = response.choices[0] if response.choices else None
            text = choice.message.content if choice and choice.message else "{}"
            return json.loads(text)
        except json.JSONDecodeError as exc:  # pragma: no cover - external dependency
            raise AIProviderError("openai", f"Invalid JSON response: {exc}", retryable=False) from exc
        except Exception as exc:  # pragma: no cover - external dependency
            if "429" in str(exc):
                raise RateLimitError("openai") from exc
            raise AIProviderError("openai", str(exc), retryable=True) from exc


class OpenAIEmbeddingProvider(EmbeddingProvider):
    """OpenAI embedding provider."""

    def __init__(self, api_key: Optional[str] = None, model: str = "text-embedding-3-large") -> None:
        settings = get_settings()
        self._api_key = api_key or settings.OPENAI_API_KEY
        self._model = model
        if not self._api_key:
            raise ValueError("OPENAI_API_KEY is required")

    @property
    def provider_name(self) -> str:
        return "openai"

    @property
    def model_name(self) -> str:
        return self._model

    @property
    def dimension(self) -> int:
        return 768

    def validate_embedding(self, embedding: List[float]) -> None:
        if len(embedding) != self.dimension:
            raise ValueError(f"Expected 768-dimensional vector, got {len(embedding)}")

    async def embed(self, text: str) -> List[float]:
        if not text:
            raise ValueError("Text cannot be empty")
        try:
            from openai import AsyncOpenAI

            client = AsyncOpenAI(api_key=self._api_key)
            response = await client.embeddings.create(
                model=self._model,
                input=text,
                dimensions=768,
            )
            embedding = response.data[0].embedding if response.data else []
            if len(embedding) != 768:
                embedding = (embedding + [0.0] * 768)[:768]
            return embedding
        except Exception as exc:  # pragma: no cover - external dependency
            raise AIProviderError("openai", f"Embedding failed: {exc}", retryable=True) from exc

    async def embed_batch(self, texts: List[str]) -> List[List[float]]:
        return [await self.embed(text) for text in texts]
