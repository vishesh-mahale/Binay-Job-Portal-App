"""Unit tests for CircuitBreaker async state machine."""

import pytest
import asyncio
from unittest.mock import AsyncMock

from app.core.circuit_breaker import CircuitBreaker, CircuitState, CircuitBreakerOpenError, get_circuit_breaker


@pytest.mark.asyncio
async def test_circuit_breaker_normal_closed_operation():
    """Verify normal operation when circuit is CLOSED."""
    cb = CircuitBreaker("test_cb_1", failure_threshold=3, recovery_timeout_seconds=1.0)
    assert cb.state == CircuitState.CLOSED
    assert cb.failure_count == 0

    mock_func = AsyncMock(return_value="success_result")
    res = await cb.call(mock_func, "arg1")

    assert res == "success_result"
    assert cb.state == CircuitState.CLOSED
    assert cb.failure_count == 0


@pytest.mark.asyncio
async def test_circuit_breaker_trips_to_open():
    """Verify circuit trips to OPEN upon reaching failure threshold."""
    cb = CircuitBreaker("test_cb_2", failure_threshold=2, recovery_timeout_seconds=0.5)

    fail_func = AsyncMock(side_effect=RuntimeError("AI provider down"))

    # Failure 1
    with pytest.raises(RuntimeError):
        await cb.call(fail_func)
    assert cb.state == CircuitState.CLOSED
    assert cb.failure_count == 1

    # Failure 2 -> Trips to OPEN
    with pytest.raises(RuntimeError):
        await cb.call(fail_func)
    assert cb.state == CircuitState.OPEN

    # Subsequent call fast-fails with CircuitBreakerOpenError (503)
    with pytest.raises(CircuitBreakerOpenError) as exc_info:
        await cb.call(fail_func)
    assert exc_info.value.http_status == 503
    assert exc_info.value.internal_code == "CIRCUIT_BREAKER_OPEN"


@pytest.mark.asyncio
async def test_circuit_breaker_half_open_recovery():
    """Verify circuit recovers from OPEN -> HALF_OPEN -> CLOSED."""
    cb = CircuitBreaker("test_cb_3", failure_threshold=1, recovery_timeout_seconds=0.1, half_open_success_threshold=1)

    fail_func = AsyncMock(side_effect=RuntimeError("Failed"))
    success_func = AsyncMock(return_value="recovered")

    # Trip to OPEN
    with pytest.raises(RuntimeError):
        await cb.call(fail_func)
    assert cb.state == CircuitState.OPEN

    # Wait for recovery timeout
    await asyncio.sleep(0.15)

    # Next call transitions to HALF_OPEN and succeeds -> transitions to CLOSED
    res = await cb.call(success_func)
    assert res == "recovered"
    assert cb.state == CircuitState.CLOSED
    assert cb.failure_count == 0


def test_get_circuit_breaker_singleton():
    """Verify get_circuit_breaker returns cached instances."""
    cb1 = get_circuit_breaker("global_llm")
    cb2 = get_circuit_breaker("global_llm")
    assert cb1 is cb2
