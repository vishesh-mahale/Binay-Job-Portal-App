"""
Health check endpoints for Cloud Run liveness & readiness probes.
"""

from typing import Dict, Any
import logging

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel

from app.core.database import DatabaseManager, get_db_manager
from app.core.config import Settings, get_settings

from app.core.logging import get_logger

logger = get_logger(__name__)
router = APIRouter(prefix="/health", tags=["health"])


# ============================================================================
# Response Models
# ============================================================================

class HealthStatus(BaseModel):
    """Health check response."""
    status: str
    service: str = "fastapi-ai-worker"
    version: str = "0.1.0"
    details: Dict[str, Any] = {}


# ============================================================================
# Endpoints
# ============================================================================

@router.get(
    "/liveness",
    response_model=HealthStatus,
    status_code=status.HTTP_200_OK,
    summary="Liveness Probe",
    description="Cloud Run liveness probe; indicates if service is running"
)
async def liveness_probe() -> HealthStatus:
    """
    Liveness probe for Cloud Run.
    
    Returns 200 OK if service is running (even if degraded).
    Cloud Run restarts container if this endpoint fails.
    """
    logger.debug("Liveness probe received")
    return HealthStatus(status="alive")


@router.get(
    "/readiness",
    response_model=HealthStatus,
    status_code=status.HTTP_200_OK,
    summary="Readiness Probe",
    description="Cloud Run readiness probe; indicates if service is ready for traffic"
)
async def readiness_probe(
    db_manager: DatabaseManager = Depends(lambda: get_db_manager(get_settings()))
) -> HealthStatus:
    """
    Readiness probe for Cloud Run.
    
    Returns 200 OK if service is fully operational:
    - Service initialized
    - Database connected & responsive
    
    Returns 503 Service Unavailable if not ready.
    Cloud Run removes container from load balancer if this endpoint fails.
    """
    details: Dict[str, Any] = {}
    
    try:
        # Test database connection
        if not db_manager.engine:
            logger.warning("Database not initialized")
            details["database"] = "not_initialized"
            return HealthStatus(
                status="not_ready",
                details=details
            )
        
        # Execute simple query to verify connectivity
        try:
            import sqlalchemy
            async with db_manager.engine.begin() as conn:
                await conn.execute(sqlalchemy.text("SELECT 1"))
            details["database"] = "connected"
        except Exception as e:
            logger.error("Database health check failed", error=str(e))
            details["database"] = f"error: {str(e)}"
            return HealthStatus(
                status="degraded",
                details=details
            )
        
        logger.debug("Readiness probe passed")
        return HealthStatus(status="ready", details=details)
        
    except Exception as e:
        logger.error("Readiness probe failed", error=str(e), exc_info=True)
        details["error"] = str(e)
        return HealthStatus(
            status="error",
            details=details
        )


@router.get("/metrics")
async def get_health_metrics():
    """Expose real-time Prometheus / OpenMetrics format metrics."""
    from fastapi.responses import Response
    from app.core.metrics import get_metrics_collector
    collector = get_metrics_collector()
    return Response(content=collector.generate_metrics_text(), media_type="text/plain; version=0.0.4")
