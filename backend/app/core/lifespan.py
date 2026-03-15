import logging
import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.core.database import engine
from app.services.im_event_dispatcher import ImEventDispatcher

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan management for database connections."""
    # Startup
    logger.info("Starting application...")
    logger.info("Database engine initialized")
    dispatcher = ImEventDispatcher()
    tasks: list[asyncio.Task[None]] = []
    try:
        if dispatcher.enabled:
            tasks.append(asyncio.create_task(dispatcher.run_forever()))
        yield
    finally:
        for task in tasks:
            task.cancel()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
    # Shutdown
    logger.info("Shutting down database engine...")
    engine.dispose()
    logger.info("Database engine disposed")
