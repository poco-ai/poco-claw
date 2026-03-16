import re
from typing import Any

_LEADING_MENTION_RE = re.compile(r"^(?:[@\uff20][^\s]+\s*)+")


def clean_text(text: str) -> str:
    cleaned = _normalize_text(text)
    while True:
        matched = _LEADING_MENTION_RE.match(cleaned)
        if not matched:
            break
        cleaned = cleaned[matched.end() :].strip()
    return cleaned


def has_explicit_mention(
    *,
    conversation_type: str,
    is_in_at_list: Any,
    at_users: Any,
    bot_user_id: str | None,
    raw_text: str,
) -> bool:
    if not requires_explicit_mention(conversation_type):
        return True

    if is_in_at_list is not None:
        return is_truthy(is_in_at_list)

    if _at_users_include_bot(at_users=at_users, bot_user_id=bot_user_id):
        return True

    return _has_leading_mention(raw_text)


def requires_explicit_mention(conversation_type: str) -> bool:
    return str(conversation_type or "").strip() == "2"


def is_truthy(value: Any) -> bool:
    if value is True:
        return True
    if value is False or value is None:
        return False
    if isinstance(value, int):
        return value != 0
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "y"}
    return bool(value)


def _normalize_text(text: str) -> str:
    return (text or "").replace("\u2005", " ").replace("\u2006", " ").strip()


def _has_leading_mention(text: str) -> bool:
    normalized = _normalize_text(text)
    if not normalized:
        return False
    return bool(_LEADING_MENTION_RE.match(normalized))


def _at_users_include_bot(*, at_users: Any, bot_user_id: str | None) -> bool:
    target = (bot_user_id or "").strip()
    if not target or not isinstance(at_users, list):
        return False

    for user in at_users:
        for key in (
            "dingtalkId",
            "dingtalk_id",
            "staffId",
            "staff_id",
            "userId",
            "user_id",
        ):
            value = _read_field(user, key)
            if isinstance(value, str) and value.strip() == target:
                return True

    return False


def _read_field(value: Any, key: str) -> Any:
    if value is None:
        return None
    if isinstance(value, dict):
        return value.get(key)
    return getattr(value, key, None)
