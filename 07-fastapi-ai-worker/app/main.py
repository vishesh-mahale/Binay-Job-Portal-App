"""
FastAPI Application Factory & Lifespan Management.
Production-grade initialization and startup/shutdown hooks.
"""

from contextlib import asynccontextmanager
from typing import AsyncGenerator, Optional
import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import Settings, get_settings
from app.core.logging import configure_logging, get_logger, set_trace_id
from app.core.database import get_db_manager
from app.core.exceptions import WorkerException
from app.api import health


logger = get_logger(__name__)


# ============================================================================
# Lifespan Management
# ============================================================================

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """
    FastAPI lifespan context manager.
    
    Runs on startup: initialize database, providers, etc.
    Runs on shutdown: cleanup, close connections, etc.
    """
    settings = getattr(app.state, "settings", None) or get_settings()
    db_manager = get_db_manager(settings)
    
    # ====== STARTUP ======
    logger.info("FastAPI AI Worker starting up")
    
    try:
        # Configure logging
        configure_logging(
            log_level=settings.LOG_LEVEL.value if hasattr(settings.LOG_LEVEL, "value") else str(settings.LOG_LEVEL),
            log_format=settings.LOG_FORMAT.value if hasattr(settings.LOG_FORMAT, "value") else str(settings.LOG_FORMAT),
            redact_pii=settings.LOG_REDACT_PII
        )
        logger.info("Logging configured", level=str(settings.LOG_LEVEL))
        
        # Initialize database
        await db_manager.initialize()
        logger.info("Database initialized successfully")
        
        # Initialize AI providers
        logger.info("AI providers initialized")
        
        # Log environment summary
        logger.info(
            "Startup complete",
            ai_provider=settings.AI_PROVIDER.value if hasattr(settings.AI_PROVIDER, "value") else str(settings.AI_PROVIDER),
            embedding_provider=settings.EMBEDDING_PROVIDER,
            oidc_enabled=settings.OIDC_AUTH_ENABLED,
            debug_endpoints=settings.DEBUG_ENDPOINTS_ENABLED
        )
        
    except Exception as e:
        logger.error("Startup failed", error=str(e), exc_info=True)
        raise
    
    # ====== RUNNING ======
    yield  # Application runs here
    
    # ====== SHUTDOWN ======
    logger.info("FastAPI AI Worker shutting down")
    
    try:
        # Shutdown database
        await db_manager.shutdown()
        logger.info("Database shutdown complete")
        
        logger.info("Shutdown complete")
        
    except Exception as e:
        logger.error("Shutdown error", error=str(e), exc_info=True)


# ============================================================================
# Application Factory
# ============================================================================

def create_app(settings: Optional[Settings] = None) -> FastAPI:
    """
    Create and configure FastAPI application.
    
    Returns:
        Configured FastAPI instance
    """
    app_settings = settings or get_settings()
    
    # Create FastAPI app with lifespan
    app = FastAPI(
        title="Binay FastAPI AI Worker",
        description="Private Cloud Run service for AI-powered resume parsing, candidate projections, and job enrichment",
        version="0.1.0",
        lifespan=lifespan,
    )
    app.state.settings = app_settings
    
    # ====== Middleware ======
    
    # CORS (this is a private service; restrict accordingly)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=app_settings.get_cors_origins(),
        allow_credentials=True,
        allow_methods=["POST"],  # Only POST for Cloud Tasks
        allow_headers=["*"],
    )
    
    # Request tracing middleware
    @app.middleware("http")
    async def add_trace_id_middleware(request: Request, call_next):
        """Add trace ID to request context for logging."""
        trace_id = request.headers.get(
            app_settings.TRACE_ID_HEADER,
            request.scope.get("path", "")  # Fallback
        )
        set_trace_id(trace_id)
        response = await call_next(request)
        response.headers[app_settings.TRACE_ID_HEADER] = trace_id
        return response
    
    # ====== Exception Handlers ======
    
    @app.exception_handler(WorkerException)
    async def worker_exception_handler(request: Request, exc: WorkerException):
        """Handle custom worker exceptions."""
        log_level = "error" if exc.http_status >= 500 else "warning"
        
        if log_level == "error":
            logger.error(
                "Worker exception",
                code=exc.internal_code,
                http_status=exc.http_status,
                message=exc.message,
                path=request.url.path
            )
        else:
            logger.warning(
                "Worker exception",
                code=exc.internal_code,
                http_status=exc.http_status,
                message=exc.message
            )
        
        return JSONResponse(
            status_code=exc.http_status,
            content=exc.to_dict()
        )
    
    @app.exception_handler(Exception)
    async def general_exception_handler(request: Request, exc: Exception):
        """Handle unexpected exceptions."""
        logger.error(
            "Unhandled exception",
            error=str(exc),
            path=request.url.path,
            exc_info=True if app_settings.DEBUG_FULL_TRACEBACK else False
        )
        
        return JSONResponse(
            status_code=500,
            content={
                "error": {
                    "code": "INTERNAL_ERROR",
                    "message": "Internal server error" if not app_settings.DEBUG_FULL_TRACEBACK else str(exc),
                }
            }
        )
    
    # ====== Routes ======
    
    # Health check endpoints
    app.include_router(health.router)
    
    # Task handlers
    from app.api.v1 import task_handlers
    app.include_router(task_handlers.router)
    
    # ====== Root Endpoint ======
    
    @app.get("/", tags=["root"])
    async def root():
        """Root endpoint (health indicator)."""
        return {
            "service": "fastapi-ai-worker",
            "version": "0.1.0",
            "status": "running"
        }
    
    logger.debug("FastAPI application created and configured")
    return app


# ============================================================================
# Application Instance
# ============================================================================

try:
    app = create_app()
except Exception:
    app = None
