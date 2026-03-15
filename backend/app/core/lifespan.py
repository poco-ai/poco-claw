import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from starlette.concurrency import run_in_threadpool

from app.core.database import engine
from app.core.settings import get_settings

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan management for database connections."""
    # Startup
    logger.info("Starting application...")
    logger.info("Database engine initialized")
    settings = get_settings()
    if settings.bootstrap_on_startup:
        from app.init_data.bootstrap import DataBootstrapService

        await run_in_threadpool(DataBootstrapService.bootstrap_all)
        logger.info("Built-in data bootstrap completed")
    yield
    # Shutdown
    logger.info("Shutting down database engine...")
    engine.dispose()
    logger.info("Database engine disposed")
