from pydantic import BaseModel
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from app.core.deps import require_callback_token
from app.core.settings import get_settings
from app.schemas.response import Response, ResponseSchema
from app.services.backend_client import BackendClient

router = APIRouter(prefix="/skills", tags=["skills"])
backend_client = BackendClient()


class SkillSubmitRequest(BaseModel):
    session_id: str
    folder_path: str
    skill_name: str | None = None


@router.post("/submit", response_model=ResponseSchema[dict])
async def submit_skill(
    request: SkillSubmitRequest,
    _: None = Depends(require_callback_token),
) -> JSONResponse:
    response = await backend_client._request(
        "POST",
        "/api/v1/internal/skills/submit-from-workspace",
        params={"session_id": request.session_id},
        json={
            "folder_path": request.folder_path,
            "skill_name": request.skill_name,
        },
        headers={
            "X-Internal-Token": get_settings().internal_api_token,
            **BackendClient._trace_headers(),
        },
    )
    payload = response.json()
    return Response.success(
        data=payload.get("data"),
        message=payload.get("message", "Skill submission queued successfully"),
    )
