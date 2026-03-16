from typing import Any

from fastapi import APIRouter, Query, Request

from app.core.settings import get_settings
from app.im.schemas.im_message import InboundMessage
from app.im.services.dingtalk_event_parser import clean_text, has_explicit_mention
from app.im.services.inbound_message_service import InboundMessageService
from app.schemas.response import Response

router = APIRouter(prefix="/webhooks/dingtalk", tags=["dingtalk"])


@router.post("")
async def webhook(
    request: Request,
    token: str | None = Query(default=None),
):
    payload = await request.json()
    if not isinstance(payload, dict):
        return Response.error(code=400, message="Invalid payload", status_code=400)

    settings = get_settings()
    if not settings.dingtalk_enabled:
        return Response.success(data={"ok": True, "ignored": "provider_disabled"})

    expected = (settings.dingtalk_webhook_token or "").strip()
    provided = _extract_token(request=request, payload=payload, query_token=token)
    if expected and provided != expected:
        return Response.error(code=403, message="Invalid token", status_code=403)

    inbound = _parse_dingtalk_event(payload)
    if inbound is None:
        return Response.success(data={"ok": True, "ignored": True})

    service = InboundMessageService()
    await service.handle_message(message=inbound)
    return Response.success(data={"ok": True})


def _extract_token(
    *,
    request: Request,
    payload: dict[str, Any],
    query_token: str | None,
) -> str:
    if query_token:
        return query_token

    header_token = request.headers.get("X-DingTalk-Token")
    if header_token:
        return header_token

    payload_token = payload.get("token")
    if isinstance(payload_token, str):
        return payload_token

    return ""


def _parse_dingtalk_event(payload: dict[str, Any]) -> InboundMessage | None:
    msg_type = str(payload.get("msgtype") or payload.get("msgType") or "").strip()
    if msg_type and msg_type.lower() != "text":
        return None

    raw_text = _extract_text(payload)
    conversation_type = str(payload.get("conversationType") or "").strip()
    bot_user_id = str(payload.get("chatbotUserId") or "").strip() or None
    if not has_explicit_mention(
        conversation_type=conversation_type,
        is_in_at_list=payload.get("isInAtList"),
        at_users=payload.get("atUsers"),
        bot_user_id=bot_user_id,
        raw_text=raw_text,
    ):
        return None

    text = clean_text(raw_text)
    if not text:
        text = "/help"

    conversation_id = str(
        payload.get("openConversationId") or payload.get("conversationId") or ""
    ).strip()
    session_webhook = str(payload.get("sessionWebhook") or "").strip()
    destination = conversation_id or session_webhook
    if not destination:
        return None

    message_id = str(
        payload.get("msgId")
        or payload.get("messageId")
        or payload.get("createAt")
        or ""
    ).strip()
    raw_sender_uid = str(
        payload.get("senderStaffId") or payload.get("senderId") or ""
    ).strip()
    if raw_sender_uid and bot_user_id and raw_sender_uid == bot_user_id:
        return None

    sender_id = (
        str(
            payload.get("senderStaffId")
            or payload.get("senderId")
            or payload.get("senderNick")
            or ""
        ).strip()
        or None
    )

    return InboundMessage(
        provider="dingtalk",
        destination=destination,
        send_address=session_webhook or None,
        message_id=message_id,
        sender_id=sender_id,
        text=text,
        raw=payload,
    )


def _extract_text(payload: dict[str, Any]) -> str:
    text_obj = payload.get("text")
    if isinstance(text_obj, dict):
        content = text_obj.get("content")
        if isinstance(content, str):
            return content.strip()

    content = payload.get("content")
    if isinstance(content, str):
        return content.strip()

    return ""
