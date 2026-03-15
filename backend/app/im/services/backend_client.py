import asyncio
import logging
import uuid
from typing import Any

from pydantic import ValidationError

from app.core.database import SessionLocal
from app.core.errors.exceptions import AppException
from app.core.settings import get_settings
from app.schemas.session import SessionResponse, SessionStateResponse, TaskConfig
from app.schemas.task import TaskEnqueueRequest, TaskEnqueueResponse
from app.schemas.user_input_request import UserInputAnswerRequest
from app.services.session_service import SessionService
from app.services.session_title_service import SessionTitleService
from app.services.task_service import TaskService
from app.services.user_input_request_service import UserInputRequestService

logger = logging.getLogger(__name__)

_TASK_SERVICE = TaskService()
_SESSION_SERVICE = SessionService()
_TITLE_SERVICE = SessionTitleService()
_USER_INPUT_SERVICE = UserInputRequestService()


class BackendClientError(RuntimeError):
    pass


class BackendClient:
    def __init__(self) -> None:
        settings = get_settings()
        self.backend_user_id = (
            settings.backend_user_id or "default"
        ).strip() or "default"
        self._task_service = _TASK_SERVICE
        self._session_service = _SESSION_SERVICE
        self._title_service = _TITLE_SERVICE
        self._user_input_service = _USER_INPUT_SERVICE

    async def enqueue_task(
        self,
        *,
        prompt: str,
        session_id: str | None = None,
        project_id: str | None = None,
        config: dict[str, Any] | None = None,
        permission_mode: str = "default",
    ) -> dict[str, Any]:
        task_request = TaskEnqueueRequest(
            prompt=prompt,
            session_id=_parse_uuid(session_id, field_name="session_id"),
            project_id=_parse_uuid(project_id, field_name="project_id"),
            config=TaskConfig.model_validate(config) if config is not None else None,
            permission_mode=permission_mode,
            schedule_mode="immediate",
        )

        result = await self._run_sync(
            self._enqueue_task_sync,
            request=task_request,
        )
        if task_request.session_id is None:
            self._schedule_title_generation(result.session_id, prompt)
        return result.model_dump(mode="json")

    async def list_sessions(
        self,
        *,
        limit: int = 100,
        offset: int = 0,
        kind: str = "chat",
    ) -> list[dict[str, Any]]:
        return await self._run_sync(
            self._list_sessions_sync,
            limit=limit,
            offset=offset,
            kind=kind,
        )

    async def get_session_state(self, *, session_id: str) -> dict[str, Any]:
        return await self._run_sync(
            self._get_session_state_sync,
            session_id=_parse_uuid(session_id, field_name="session_id", required=True),
        )

    async def answer_user_input_request(
        self,
        *,
        request_id: str,
        answers: dict[str, str],
    ) -> dict[str, Any]:
        answer_request = UserInputAnswerRequest(answers=answers)
        return await self._run_sync(
            self._answer_user_input_request_sync,
            request_id=_parse_uuid(request_id, field_name="request_id", required=True),
            answer_request=answer_request,
        )

    async def _run_sync(self, func, /, **kwargs):
        try:
            return await asyncio.to_thread(func, **kwargs)
        except BackendClientError:
            raise
        except AppException as exc:
            raise BackendClientError(exc.message) from exc
        except ValidationError as exc:
            raise BackendClientError(str(exc)) from exc
        except ValueError as exc:
            raise BackendClientError(str(exc)) from exc
        except Exception as exc:
            logger.exception("embedded_backend_client_call_failed")
            raise BackendClientError(f"Internal backend error: {exc}") from exc

    def _enqueue_task_sync(self, *, request: TaskEnqueueRequest) -> TaskEnqueueResponse:
        db = SessionLocal()
        try:
            return self._task_service.enqueue_task(db, self.backend_user_id, request)
        finally:
            db.close()

    def _list_sessions_sync(
        self,
        *,
        limit: int,
        offset: int,
        kind: str,
    ) -> list[dict[str, Any]]:
        db = SessionLocal()
        try:
            kind_filter = kind.strip().lower()
            kind_value = None if kind_filter in {"", "all"} else kind_filter
            sessions = self._session_service.list_sessions(
                db,
                self.backend_user_id,
                limit,
                offset,
                None,
                kind=kind_value,
            )
            return [_serialize_session(session) for session in sessions]
        finally:
            db.close()

    def _get_session_state_sync(self, *, session_id: uuid.UUID) -> dict[str, Any]:
        db = SessionLocal()
        try:
            session = self._session_service.get_session(db, session_id)
            if session.user_id != self.backend_user_id:
                raise BackendClientError("Session does not belong to the IM user")
            return SessionStateResponse.model_validate(session).model_dump(mode="json")
        finally:
            db.close()

    def _answer_user_input_request_sync(
        self,
        *,
        request_id: uuid.UUID,
        answer_request: UserInputAnswerRequest,
    ) -> dict[str, Any]:
        db = SessionLocal()
        try:
            result = self._user_input_service.answer_request(
                db,
                user_id=self.backend_user_id,
                request_id=str(request_id),
                answer_request=answer_request,
            )
            return result.model_dump(mode="json")
        finally:
            db.close()

    def _schedule_title_generation(self, session_id: uuid.UUID, prompt: str) -> None:
        task = asyncio.create_task(
            asyncio.to_thread(
                self._title_service.generate_and_update,
                session_id,
                prompt,
            )
        )
        task.add_done_callback(_log_background_task_exception)


def _parse_uuid(
    value: str | None,
    *,
    field_name: str,
    required: bool = False,
) -> uuid.UUID | None:
    raw = (value or "").strip()
    if not raw:
        if required:
            raise BackendClientError(f"{field_name} cannot be empty")
        return None
    try:
        return uuid.UUID(raw)
    except ValueError as exc:
        raise BackendClientError(f"Invalid {field_name}: {raw}") from exc


def _serialize_session(session: Any) -> dict[str, Any]:
    return SessionResponse.model_validate(session).model_dump(mode="json")


def _log_background_task_exception(task: asyncio.Task[None]) -> None:
    try:
        task.result()
    except Exception:
        logger.exception("embedded_session_title_generation_failed")
