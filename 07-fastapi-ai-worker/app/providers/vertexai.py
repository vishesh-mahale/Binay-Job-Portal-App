"""
Google Cloud Vertex AI Provider Implementation using official modern google-genai SDK.
Enforces 0-Key IAM Authentication (Workload Identity / Application Default Credentials).
"""

from __future__ import annotations

import asyncio
import json
from typing import Any, Dict, List, Optional

from google import genai
from google.genai import types

from app.core.config import get_settings
from app.core.exceptions import AIProviderError, RateLimitError
from app.core.logging import get_logger
from app.providers.base import (
    EmbeddingProvider,
    EmbeddingRequest,
    EmbeddingResponse,
    LLMProvider,
    LLMRequest,
    LLMResponse,
)

logger = get_logger(__name__)


def _repair_json(raw_text: str) -> Dict[str, Any]:
    """Parse JSON with automated repair for truncated strings, unescaped quotes, or open brackets."""
    cleaned = (raw_text or "").strip()
    if cleaned.startswith("```json"):
        cleaned = cleaned[7:]
    if cleaned.startswith("```"):
        cleaned = cleaned[3:]
    if cleaned.endswith("```"):
        cleaned = cleaned[:-3]
    cleaned = cleaned.strip()

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    in_string = False
    escaped = False
    stack = []

    for char in cleaned:
        if escaped:
            escaped = False
            continue
        if char == '\\':
            escaped = True
            continue
        if char == '"':
            in_string = not in_string
            continue
        if not in_string:
            if char in '{[':
                stack.append('}' if char == '{' else ']')
            elif char in '}]':
                if stack and stack[-1] == char:
                    stack.pop()

    repaired = cleaned
    if in_string:
        repaired += '"'

    while stack:
        repaired += stack.pop()

    try:
        return json.loads(repaired)
    except json.JSONDecodeError:
        pass

    for cutoff in range(len(cleaned) - 1, 0, -1):
        if cleaned[cutoff] in ("}", "]"):
            candidate = cleaned[: cutoff + 1]
            c_stack = []
            c_in_str = False
            c_esc = False
            for ch in candidate:
                if c_esc:
                    c_esc = False
                    continue
                if ch == '\\':
                    c_esc = True
                    continue
                if ch == '"':
                    c_in_str = not c_in_str
                    continue
                if not c_in_str:
                    if ch in '{[':
                        c_stack.append('}' if ch == '{' else ']')
                    elif ch in '}]':
                        if c_stack and c_stack[-1] == ch:
                            c_stack.pop()
            if c_in_str:
                candidate += '"'
            while c_stack:
                candidate += c_stack.pop()
            try:
                return json.loads(candidate)
            except json.JSONDecodeError:
                continue

    raise ValueError("Could not repair malformed JSON")


class VertexAILLMProvider(LLMProvider):
    """Google Cloud Vertex AI LLM Provider with 0-Key IAM authentication."""

    def __init__(
        self,
        project_id: Optional[str] = None,
        location: Optional[str] = None,
        model_name: Optional[str] = None,
    ) -> None:
        settings = get_settings()
        self._project_id = project_id or settings.GOOGLE_CLOUD_PROJECT_ID
        self._location = location or settings.GCP_REGION
        self._model_name = model_name or settings.GEMINI_MODEL or "gemini-2.0-flash"
        self._client: Optional[genai.Client] = None

    @property
    def provider_name(self) -> str:
        return "vertexai"

    @property
    def supported_models(self) -> List[str]:
        return ["gemini-2.0-flash", "gemini-2.5-flash", "gemini-1.5-flash", "gemini-1.5-pro"]

    def _get_client(self) -> genai.Client:
        if self._client is None:
            try:
                self._client = genai.Client(
                    vertexai=True,
                    project=self._project_id,
                    location=self._location,
                )
            except Exception as exc:
                raise AIProviderError(
                    "vertexai", f"Failed to initialize Vertex AI client: {exc}", retryable=False
                ) from exc
        return self._client

    def validate_request(self, request: LLMRequest) -> None:
        if not request.prompt or not request.user_input:
            raise ValueError("Prompt and user_input are required")
        if request.max_tokens < 100:
            raise ValueError("max_tokens must be at least 100")

    async def _run_sync(self, func, *args, **kwargs):
        return await asyncio.wait_for(asyncio.to_thread(func, *args, **kwargs), timeout=120)

    async def generate(self, request: LLMRequest) -> LLMResponse:
        self.validate_request(request)
        client = self._get_client()
        try:
            config = types.GenerateContentConfig(
                temperature=request.temperature,
                max_output_tokens=request.max_tokens,
            )

            def _call():
                resp = client.models.generate_content(
                    model=self._model_name,
                    contents=f"{request.prompt}\n\n{request.user_input}",
                    config=config,
                )
                return getattr(resp, "text", "") or ""

            text = await self._run_sync(_call)
            return LLMResponse(
                text=text,
                model=self._model_name,
                tokens_in=max(len(request.prompt.split()), 1),
                tokens_out=max(len(text.split()), 1),
                stop_reason="stop",
            )
        except Exception as exc:
            if "429" in str(exc) or "ResourceExhausted" in str(type(exc).__name__):
                raise RateLimitError("vertexai") from exc
            raise AIProviderError("vertexai", str(exc), retryable=True) from exc

    async def generate_structured(
        self,
        prompt: str,
        user_input: str,
        response_schema: Dict[str, Any],
        **kwargs: Any,
    ) -> Dict[str, Any]:
        client = self._get_client()
        try:
            max_tokens = kwargs.get("max_tokens", 8192)

            config = types.GenerateContentConfig(
                temperature=kwargs.get("temperature", 0.0),
                max_output_tokens=max_tokens,
                response_mime_type="application/json",
                response_schema=response_schema,
                system_instruction=prompt,
            )

            def _call():
                resp = client.models.generate_content(
                    model=self._model_name,
                    contents=user_input,
                    config=config,
                )
                return getattr(resp, "text", "") or "{}"

            raw_text = await self._run_sync(_call)
            return _repair_json(raw_text)
        except json.JSONDecodeError as exc:
            raise AIProviderError("vertexai", f"Invalid JSON returned: {exc}", retryable=True) from exc
        except ValueError as exc:
            raise AIProviderError("vertexai", f"Invalid JSON returned: {exc}", retryable=True) from exc
        except Exception as exc:
            if "429" in str(exc) or "ResourceExhausted" in str(type(exc).__name__):
                raise RateLimitError("vertexai") from exc
            raise AIProviderError("vertexai", str(exc), retryable=True) from exc


class VertexAIEmbeddingProvider(EmbeddingProvider):
    """Google Cloud Vertex AI 768-dimensional Embedding Provider with 0-Key IAM."""

    def __init__(
        self,
        project_id: Optional[str] = None,
        location: Optional[str] = None,
        model_name: str = "text-embedding-004",
    ) -> None:
        super().__init__(model_name=model_name)
        settings = get_settings()
        self._project_id = project_id or settings.GOOGLE_CLOUD_PROJECT_ID
        self._location = location or settings.GCP_REGION
        self._client: Optional[genai.Client] = None

    @property
    def provider_name(self) -> str:
        return "vertexai"

    @property
    def dimension(self) -> int:
        return 768

    def _get_client(self) -> genai.Client:
        if self._client is None:
            try:
                self._client = genai.Client(
                    vertexai=True,
                    project=self._project_id,
                    location=self._location,
                )
            except Exception as exc:
                raise AIProviderError(
                    "vertexai", f"Failed to initialize Vertex AI Embedding client: {exc}", retryable=False
                ) from exc
        return self._client

    async def _run_sync(self, func, *args, **kwargs):
        return await asyncio.wait_for(asyncio.to_thread(func, *args, **kwargs), timeout=120)

    async def embed(self, request: EmbeddingRequest | str) -> EmbeddingResponse:
        if isinstance(request, str):
            request = EmbeddingRequest(text=request)
        if not request.text:
            raise ValueError("Text cannot be empty")
        client = self._get_client()
        try:
            model_name = request.model or self.model_name

            def _call():
                res = client.models.embed_content(model=model_name, contents=request.text)
                return res.embeddings[0].values if res.embeddings else []

            values = await self._run_sync(_call)

            if len(values) != self.dimension:
                values = (values + [0.0] * self.dimension)[: self.dimension]

            return EmbeddingResponse(
                embedding=values,
                model=model_name,
                dimension=self.dimension,
            )
        except Exception as exc:
            if "429" in str(exc) or "ResourceExhausted" in str(type(exc).__name__):
                raise RateLimitError("vertexai") from exc
            raise AIProviderError("vertexai", f"Vertex AI embedding failed: {exc}", retryable=True) from exc

    async def embed_batch(self, texts: List[str]) -> List[List[float]]:
        if not texts:
            return []
        client = self._get_client()
        try:
            def _call():
                res = client.models.embed_content(model=self.model_name, contents=texts)
                return [emb.values for emb in res.embeddings] if res.embeddings else []

            embeddings = await self._run_sync(_call)
            output = []
            for emb in embeddings:
                if len(emb) != self.dimension:
                    emb = (emb + [0.0] * self.dimension)[: self.dimension]
                output.append(emb)
            return output
        except Exception as exc:
            if "429" in str(exc) or "ResourceExhausted" in str(type(exc).__name__):
                raise RateLimitError("vertexai") from exc
            raise AIProviderError("vertexai", f"Vertex AI batch embedding failed: {exc}", retryable=True) from exc
