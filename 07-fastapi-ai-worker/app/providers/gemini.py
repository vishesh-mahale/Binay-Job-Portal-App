"""Google Gemini AI provider implementation."""

from __future__ import annotations

import asyncio
import json
from typing import Any, Dict, List, Optional

import google.generativeai as genai

from app.core.config import get_settings
from app.core.exceptions import AIProviderError, RateLimitError
from app.providers.base import EmbeddingProvider, LLMProvider, LLMRequest, LLMResponse


class GeminiLLMProvider(LLMProvider):
    """Google Gemini provider for structured resume parsing."""

    def __init__(self, api_key: Optional[str] = None, model: str = "gemini-2.5-flash") -> None:
        settings = get_settings()
        self._api_key = api_key or settings.GEMINI_API_KEY
        self._model = model or settings.GEMINI_MODEL
        if not self._api_key:
            raise ValueError("GEMINI_API_KEY is required")
        genai.configure(api_key=self._api_key)

    @property
    def provider_name(self) -> str:
        return "gemini"

    @property
    def supported_models(self) -> List[str]:
        return ["gemini-2.5-flash", "gemini-2.5-pro"]

    def validate_request(self, request: LLMRequest) -> None:
        if not request.prompt or not request.user_input:
            raise ValueError("Prompt and user_input are required")
        if request.max_tokens < 100:
            raise ValueError("max_tokens must be at least 100")

    async def _run_sync(self, func, *args, **kwargs):
        return await asyncio.to_thread(func, *args, **kwargs)

    async def generate(self, request: LLMRequest) -> LLMResponse:
        self.validate_request(request)
        try:
            model = genai.GenerativeModel(self._model)

            def _generate():
                response = model.generate_content(
                    request.prompt + "\n\n" + request.user_input,
                    generation_config={
                        "temperature": request.temperature,
                        "max_output_tokens": request.max_tokens,
                    },
                )
                text = getattr(response, "text", "") or ""
                return text

            text = await self._run_sync(_generate)
            return LLMResponse(
                text=text,
                model=self._model,
                tokens_in=max(len(request.prompt), 1),
                tokens_out=max(len(text.split()), 1),
                stop_reason="stop",
            )
        except Exception as exc:  # pragma: no cover - external dependency
            raise AIProviderError("gemini", str(exc), retryable=True) from exc

    async def generate_structured(
        self,
        prompt: str,
        user_input: str,
        response_schema: Dict[str, Any],
        **kwargs: Any,
    ) -> Dict[str, Any]:
        try:
            model = genai.GenerativeModel(self._model)
            payload = {
                "prompt": prompt,
                "user_input": user_input,
                "response_schema": response_schema,
            }

            def _generate():
                return model.generate_content(
                    json.dumps(payload, ensure_ascii=False),
                    generation_config={
                        "temperature": kwargs.get("temperature", 0.2),
                        "max_output_tokens": kwargs.get("max_tokens", 2048),
                        "response_mime_type": "application/json",
                    },
                )

            response = await self._run_sync(_generate)
            text = getattr(response, "text", "") or "{}"
            return json.loads(text)
        except json.JSONDecodeError as exc:  # pragma: no cover - external dependency
            raise AIProviderError("gemini", f"Invalid JSON response: {exc}", retryable=False) from exc
        except Exception as exc:  # pragma: no cover - external dependency
            if "429" in str(exc):
                raise RateLimitError("gemini") from exc
            raise AIProviderError("gemini", str(exc), retryable=True) from exc


class GeminiEmbeddingProvider(EmbeddingProvider):
    """Google Gemini embedding provider."""

    def __init__(self, api_key: Optional[str] = None, model: str = "text-embedding-004") -> None:
        settings = get_settings()
        self._api_key = api_key or settings.GEMINI_API_KEY
        self._model = model or settings.EMBEDDING_MODEL
        if not self._api_key:
            raise ValueError("GEMINI_API_KEY is required")
        genai.configure(api_key=self._api_key)

    @property
    def provider_name(self) -> str:
        return "gemini"

    @property
    def model_name(self) -> str:
        return self._model

    @property
    def dimension(self) -> int:
        return 768

    def validate_embedding(self, embedding: List[float]) -> None:
        if len(embedding) != self.dimension:
            raise ValueError(f"Expected 768-dimensional vector, got {len(embedding)}")

    async def _run_sync(self, func, *args, **kwargs):
        return await asyncio.to_thread(func, *args, **kwargs)

    async def embed(self, text: str) -> List[float]:
        if not text:
            raise ValueError("Text cannot be empty")
        try:
            def _embed():
                result = genai.embed_content(model=self._model, content=text, task_type="RETRIEVAL_DOCUMENT")
                value = result["embedding"] if isinstance(result, dict) else result
                return value if isinstance(value, list) else []

            embedding = await self._run_sync(_embed)
            self.validate_embedding(embedding)
            return embedding
        except Exception as exc:  # pragma: no cover - external dependency
            raise AIProviderError("gemini", f"Embedding failed: {exc}", retryable=True) from exc

    async def embed_batch(self, texts: List[str]) -> List[List[float]]:
        return [await self.embed(text) for text in texts]
