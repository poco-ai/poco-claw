from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass

from app.core.database import SessionLocal
from app.core.settings import get_settings
from app.im.schemas.backend_event import BackendEvent
from app.im.services.backend_event_service import BackendEventService
from app.repositories.im_event_outbox_repository import ImEventOutboxRepository

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class ClaimedEvent:
    id: str
    event_type: str
    attempt_count: int
    payload: dict


class ImEventDispatcher:
    def __init__(self) -> None:
        self.settings = get_settings()
        self._backend_event_service = BackendEventService()

    @property
    def enabled(self) -> bool:
        return bool(self.settings.im_event_dispatch_enabled)

    async def run_forever(self) -> None:
        if not self.enabled:
            logger.info("im_event_dispatcher_disabled")
            return

        interval = max(0.2, float(self.settings.im_event_dispatch_interval_seconds))
        while True:
            try:
                await self._dispatch_once()
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("im_event_dispatcher_iteration_failed")
            await asyncio.sleep(interval)

    async def _dispatch_once(self) -> None:
        batch_size = max(1, int(self.settings.im_event_dispatch_batch_size))
        lease_seconds = max(5, int(self.settings.im_event_dispatch_lease_seconds))
        claimed = await asyncio.to_thread(
            self._claim_due_batch,
            batch_size,
            lease_seconds,
        )
        if not claimed:
            return

        for event in claimed:
            try:
                await self._deliver(event)
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                delay = min(60.0, float(2 ** min(event.attempt_count, 6)))
                await asyncio.to_thread(
                    self._mark_retry,
                    event.id,
                    str(exc),
                    delay,
                )
                logger.warning(
                    "im_event_delivery_failed",
                    extra={
                        "event_id": event.id,
                        "event_type": event.event_type,
                        "attempt_count": event.attempt_count,
                        "error": str(exc),
                    },
                )
            else:
                await asyncio.to_thread(self._mark_delivered, event.id)

    async def _deliver(self, event: ClaimedEvent) -> None:
        parsed = BackendEvent.model_validate(event.payload)
        db = SessionLocal()
        try:
            await self._backend_event_service.process_event(db, event=parsed)
        finally:
            db.close()

    @staticmethod
    def _claim_due_batch(limit: int, lease_seconds: int) -> list[ClaimedEvent]:
        db = SessionLocal()
        try:
            rows = ImEventOutboxRepository.claim_due_batch(
                db,
                limit=limit,
                lease_seconds=lease_seconds,
            )
            claimed: list[ClaimedEvent] = []
            for row in rows:
                payload = row.payload if isinstance(row.payload, dict) else {}
                claimed.append(
                    ClaimedEvent(
                        id=str(row.id),
                        event_type=row.event_type,
                        attempt_count=int(row.attempt_count or 0),
                        payload=payload,
                    )
                )
            return claimed
        finally:
            db.close()

    @staticmethod
    def _mark_delivered(event_id: str) -> None:
        db = SessionLocal()
        try:
            ImEventOutboxRepository.mark_delivered(db, event_id=event_id)
        finally:
            db.close()

    @staticmethod
    def _mark_retry(event_id: str, error_message: str, delay_seconds: float) -> None:
        db = SessionLocal()
        try:
            ImEventOutboxRepository.mark_retry(
                db,
                event_id=event_id,
                error_message=error_message,
                delay_seconds=delay_seconds,
            )
        finally:
            db.close()
