"""
Async Circuit Breaker Implementation.
Prevents cascading failures by fast-failing calls to failing external dependencies (AI providers, LLMs).
"""

from __future__ import annotations

import asyncio
import enum
import time
from typing import Any, Callable, Coroutine, Dict, Optional, TypeVar

from app.core.exceptions import WorkerException
from app.core.logging import get_logger

logger = get_logger(__name__)

T = TypeVar("T")


class CircuitState(str, enum.Enum):
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


class CircuitBreakerOpenError(WorkerException):
    """Raised when an operation is attempted while the circuit breaker is OPEN."""

    def __init__(self, name: str, recovery_seconds_remaining: float):
        super().__init__(
            message=f"Circuit breaker '{name}' is OPEN. Fast-failing downstream call. Retry in {recovery_seconds_remaining:.1f}s.",
            internal_code="CIRCUIT_BREAKER_OPEN",
            http_status=503,
            details={"circuit_name": name, "recovery_seconds_remaining": recovery_seconds_remaining, "retryable": True},
        )


class CircuitBreaker:
    """
    State machine for circuit breaker pattern:
    - CLOSED: Normal operation. Errors increment failure counter. Transitions to OPEN on reaching failure threshold.
    - OPEN: Fast-fails all requests with 503 retryable. Transitions to HALF_OPEN after recovery timeout.
    - HALF_OPEN: Allows limited probe requests. Transitions to CLOSED on success, or back to OPEN on failure.
    """

    def __init__(
        self,
        name: str,
        failure_threshold: int = 5,
        recovery_timeout_seconds: float = 30.0,
        half_open_success_threshold: int = 2,
    ) -> None:
        self.name = name
        self.failure_threshold = failure_threshold
        self.recovery_timeout_seconds = recovery_timeout_seconds
        self.half_open_success_threshold = half_open_success_threshold

        self._state: CircuitState = CircuitState.CLOSED
        self._failure_count: int = 0
        self._consecutive_successes: int = 0
        self._last_state_change: float = time.monotonic()
        self._lock = asyncio.Lock()

    @property
    def state(self) -> CircuitState:
        return self._state

    @property
    def failure_count(self) -> int:
        return self._failure_count

    async def call(self, func: Callable[..., Coroutine[Any, Any, T]], *args: Any, **kwargs: Any) -> T:
        """Execute async function guarded by circuit breaker."""
        async with self._lock:
            now = time.monotonic()
            if self._state == CircuitState.OPEN:
                elapsed = now - self._last_state_change
                if elapsed >= self.recovery_timeout_seconds:
                    logger.info("Circuit breaker transitioning to HALF_OPEN", circuit=self.name)
                    self._state = CircuitState.HALF_OPEN
                    self._consecutive_successes = 0
                    self._last_state_change = now
                else:
                    remaining = self.recovery_timeout_seconds - elapsed
                    logger.warning("Circuit breaker fast-failing request (OPEN)", circuit=self.name, remaining_seconds=remaining)
                    raise CircuitBreakerOpenError(self.name, remaining)

        try:
            result = await func(*args, **kwargs)
        except Exception as exc:
            await self._on_failure(exc)
            raise

        await self._on_success()
        return result

    async def _on_success(self) -> None:
        async with self._lock:
            if self._state == CircuitState.HALF_OPEN:
                self._consecutive_successes += 1
                if self._consecutive_successes >= self.half_open_success_threshold:
                    logger.info("Circuit breaker reset to CLOSED after successful probe", circuit=self.name)
                    self._state = CircuitState.CLOSED
                    self._failure_count = 0
                    self._consecutive_successes = 0
                    self._last_state_change = time.monotonic()
            elif self._state == CircuitState.CLOSED:
                self._failure_count = 0

    async def _on_failure(self, exc: Exception) -> None:
        async with self._lock:
            self._failure_count += 1
            now = time.monotonic()
            if self._state == CircuitState.HALF_OPEN or self._failure_count >= self.failure_threshold:
                if self._state != CircuitState.OPEN:
                    logger.error(
                        "Circuit breaker tripped to OPEN state",
                        circuit=self.name,
                        failures=self._failure_count,
                        error=str(exc),
                    )
                self._state = CircuitState.OPEN
                self._last_state_change = now


_circuit_registry: Dict[str, CircuitBreaker] = {}


def get_circuit_breaker(
    name: str,
    failure_threshold: int = 5,
    recovery_timeout_seconds: float = 30.0,
) -> CircuitBreaker:
    """Retrieve or initialize a global circuit breaker by name."""
    if name not in _circuit_registry:
        _circuit_registry[name] = CircuitBreaker(
            name=name,
            failure_threshold=failure_threshold,
            recovery_timeout_seconds=recovery_timeout_seconds,
        )
    return _circuit_registry[name]
