"""
Prometheus Metrics Exporter & Real-Time Observability Collector.
Provides standard OpenMetrics / Prometheus exposition text format.
"""

from __future__ import annotations

import threading
import time
from collections import defaultdict
from typing import Dict, List, Tuple


class MetricsCollector:
    """Thread-safe Prometheus / OpenMetrics collector."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._counters: Dict[Tuple[str, Tuple[Tuple[str, str], ...]], float] = defaultdict(float)
        self._histograms: Dict[Tuple[str, Tuple[Tuple[str, str], ...]], List[float]] = defaultdict(list)
        self._gauges: Dict[Tuple[str, Tuple[Tuple[str, str], ...]], float] = defaultdict(float)

    def inc_counter(self, name: str, value: float = 1.0, labels: Dict[str, str] | None = None) -> None:
        """Increment a counter metric."""
        label_tuple = tuple(sorted((labels or {}).items()))
        with self._lock:
            self._counters[(name, label_tuple)] += value

    def observe_duration(self, name: str, duration_seconds: float, labels: Dict[str, str] | None = None) -> None:
        """Record an observation in seconds."""
        label_tuple = tuple(sorted((labels or {}).items()))
        with self._lock:
            self._histograms[(name, label_tuple)].append(duration_seconds)
            self._counters[(f"{name}_count", label_tuple)] += 1.0
            self._counters[(f"{name}_sum", label_tuple)] += duration_seconds

    def set_gauge(self, name: str, value: float, labels: Dict[str, str] | None = None) -> None:
        """Set a gauge metric."""
        label_tuple = tuple(sorted((labels or {}).items()))
        with self._lock:
            self._gauges[(name, label_tuple)] = value

    def generate_metrics_text(self) -> str:
        """Generate Prometheus exposition text format."""
        lines: List[str] = []
        lines.append("# HELP fastapi_ai_worker_metrics Production metrics for FastAPI AI Worker")
        lines.append("# TYPE fastapi_ai_worker_metrics untyped")

        with self._lock:
            # Output Counters
            for (name, label_tuple), val in sorted(self._counters.items()):
                label_str = ",".join(f'{k}="{v}"' for k, v in label_tuple)
                if label_str:
                    lines.append(f"{name}{{{label_str}}} {val}")
                else:
                    lines.append(f"{name} {val}")

            # Output Gauges
            for (name, label_tuple), val in sorted(self._gauges.items()):
                label_str = ",".join(f'{k}="{v}"' for k, v in label_tuple)
                if label_str:
                    lines.append(f"{name}{{{label_str}}} {val}")
                else:
                    lines.append(f"{name} {val}")

        return "\n".join(lines) + "\n"


_global_metrics = MetricsCollector()


def get_metrics_collector() -> MetricsCollector:
    """Access global metrics singleton."""
    return _global_metrics
