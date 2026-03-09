import os
from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.core.settings import Settings, get_settings
from app.models.env_var import UserEnvVar
from app.repositories.env_var_repository import EnvVarRepository
from app.schemas.model_config import (
    ModelConfigResponse,
    ModelDefinitionResponse,
    ModelProviderResponse,
)
from app.services.env_var_service import SYSTEM_USER_ID
from app.utils.crypto import decrypt_value


@dataclass(frozen=True)
class ProviderSpec:
    provider_id: str
    display_name: str
    api_key_env_key: str
    base_url_env_key: str
    default_base_url: str
    builtin_models: tuple[tuple[str, str], ...]


PROVIDER_SPECS: tuple[ProviderSpec, ...] = (
    ProviderSpec(
        provider_id="anthropic",
        display_name="Anthropic",
        api_key_env_key="ANTHROPIC_API_KEY",
        base_url_env_key="ANTHROPIC_BASE_URL",
        default_base_url="https://api.anthropic.com",
        builtin_models=(
            ("claude-sonnet-4-20250514", "Claude Sonnet 4"),
            ("claude-opus-4-20250514", "Claude Opus 4"),
        ),
    ),
    ProviderSpec(
        provider_id="openai",
        display_name="OpenAI",
        api_key_env_key="OPENAI_API_KEY",
        base_url_env_key="OPENAI_BASE_URL",
        default_base_url="https://api.openai.com/v1",
        builtin_models=(
            ("gpt-4.1", "GPT-4.1"),
            ("gpt-4.1-mini", "GPT-4.1 Mini"),
        ),
    ),
    ProviderSpec(
        provider_id="glm",
        display_name="GLM",
        api_key_env_key="GLM_API_KEY",
        base_url_env_key="GLM_BASE_URL",
        default_base_url="https://open.bigmodel.cn/api/paas/v4/",
        builtin_models=(
            ("GLM-4.7", "GLM-4.7"),
            ("glm-5", "GLM-5"),
        ),
    ),
    ProviderSpec(
        provider_id="minimax",
        display_name="MiniMax",
        api_key_env_key="MINIMAX_API_KEY",
        base_url_env_key="MINIMAX_BASE_URL",
        default_base_url="https://api.minimaxi.com/v1",
        builtin_models=(
            ("MiniMax-M2.5", "MiniMax M2.5"),
            ("MiniMax-M2", "MiniMax M2"),
        ),
    ),
    ProviderSpec(
        provider_id="deepseek",
        display_name="DeepSeek",
        api_key_env_key="DEEPSEEK_API_KEY",
        base_url_env_key="DEEPSEEK_BASE_URL",
        default_base_url="https://api.deepseek.com",
        builtin_models=(
            ("deepseek-chat", "DeepSeek Chat"),
            ("deepseek-reasoner", "DeepSeek Reasoner"),
        ),
    ),
)

MODEL_NAME_INDEX = {
    model_id: display_name
    for spec in PROVIDER_SPECS
    for model_id, display_name in spec.builtin_models
}


def infer_provider_id(model_id: str) -> str | None:
    value = (model_id or "").strip()
    if not value:
        return None

    lowered = value.lower()
    if lowered.startswith("claude-"):
        return "anthropic"
    if lowered.startswith(("gpt-", "o1", "o3", "o4")):
        return "openai"
    if lowered.startswith("glm-"):
        return "glm"
    if lowered.startswith("minimax-"):
        return "minimax"
    if lowered.startswith("deepseek-"):
        return "deepseek"

    if value.startswith("GLM-"):
        return "glm"
    if value.startswith("MiniMax-"):
        return "minimax"
    return None


def humanize_model_name(model_id: str) -> str:
    known = MODEL_NAME_INDEX.get(model_id)
    if known:
        return known

    value = (model_id or "").strip()
    if not value:
        return model_id

    parts = value.replace("_", "-").split("-")
    return " ".join(
        part.upper() if part.isalpha() and len(part) <= 4 else part
        for part in parts
    )


def get_allowed_model_ids(settings: Settings | None = None) -> list[str]:
    active_settings = settings or get_settings()
    ordered: list[str] = []
    seen: set[str] = set()

    def push(value: str | None) -> None:
        clean = (value or "").strip()
        if not clean or clean in seen:
            return
        seen.add(clean)
        ordered.append(clean)

    push(active_settings.default_model)
    for item in active_settings.model_list or []:
        push(item)
    for spec in PROVIDER_SPECS:
        for model_id, _ in spec.builtin_models:
            push(model_id)

    return ordered


def _decrypt_ciphertext(ciphertext: str, secret_key: str) -> str:
    if not ciphertext:
        return ""
    return decrypt_value(ciphertext, secret_key).strip()


class ModelConfigService:
    def __init__(self) -> None:
        self.settings = get_settings()

    def list_model_definitions(self) -> list[ModelDefinitionResponse]:
        models: list[ModelDefinitionResponse] = []
        for model_id in get_allowed_model_ids(self.settings):
            provider_id = infer_provider_id(model_id)
            if not provider_id:
                continue
            models.append(
                ModelDefinitionResponse(
                    model_id=model_id,
                    display_name=humanize_model_name(model_id),
                    provider_id=provider_id,
                )
            )
        return models

    def get_model_config(self, db: Session, user_id: str) -> ModelConfigResponse:
        model_defs = self.list_model_definitions()
        relevant_env_keys = {
            spec.api_key_env_key for spec in PROVIDER_SPECS
        } | {spec.base_url_env_key for spec in PROVIDER_SPECS}

        system_items = self._load_env_values(
            EnvVarRepository.list_by_user_and_scope(
                db, user_id=SYSTEM_USER_ID, scope="system"
            ),
            relevant_env_keys,
        )
        user_items = self._load_env_values(
            EnvVarRepository.list_by_user_and_scope(db, user_id=user_id, scope="user"),
            relevant_env_keys,
        )

        providers: list[ModelProviderResponse] = []
        for spec in PROVIDER_SPECS:
            user_key = user_items.get(spec.api_key_env_key, "")
            process_key = (os.getenv(spec.api_key_env_key) or "").strip()

            if user_key:
                credential_state = "user"
            elif system_items.get(spec.api_key_env_key, "") or process_key:
                credential_state = "system"
            else:
                credential_state = "none"

            user_base_url = user_items.get(spec.base_url_env_key, "")
            system_base_url = system_items.get(spec.base_url_env_key, "")
            process_base_url = (os.getenv(spec.base_url_env_key) or "").strip()

            if user_base_url:
                effective_base_url = user_base_url
                base_url_source = "user"
            elif system_base_url or process_base_url:
                effective_base_url = system_base_url or process_base_url
                base_url_source = "system"
            else:
                effective_base_url = spec.default_base_url
                base_url_source = "default"

            provider_models = [
                model for model in model_defs if model.provider_id == spec.provider_id
            ]
            providers.append(
                ModelProviderResponse(
                    provider_id=spec.provider_id,
                    display_name=spec.display_name,
                    api_key_env_key=spec.api_key_env_key,
                    base_url_env_key=spec.base_url_env_key,
                    credential_state=credential_state,
                    default_base_url=spec.default_base_url,
                    effective_base_url=effective_base_url,
                    base_url_source=base_url_source,
                    models=provider_models,
                )
            )

        return ModelConfigResponse(
            default_model=(self.settings.default_model or "").strip(),
            model_list=[model.model_id for model in model_defs],
            mem0_enabled=self.settings.mem0_enabled,
            models=model_defs,
            providers=providers,
        )

    def _load_env_values(
        self, env_vars: list[UserEnvVar], relevant_keys: set[str]
    ) -> dict[str, str]:
        values: dict[str, str] = {}
        for item in env_vars:
            if item.key not in relevant_keys:
                continue
            try:
                values[item.key] = _decrypt_ciphertext(
                    item.value_ciphertext, self.settings.secret_key
                )
            except Exception:
                continue
        return values
