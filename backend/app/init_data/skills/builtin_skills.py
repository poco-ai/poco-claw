import hashlib
import logging
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy.orm import Session

from app.models.skill import Skill
from app.repositories.skill_repository import SkillRepository
from app.services.storage_service import S3StorageService
from app.utils.markdown_front_matter import parse_yaml_front_matter

logger = logging.getLogger(__name__)

SYSTEM_SKILL_OWNER_USER_ID = "__system__"
_BACKEND_ROOT = Path(__file__).resolve().parents[3]
_BUILTIN_SKILL_ASSETS_ROOT = _BACKEND_ROOT / "assets" / "skills"


@dataclass(frozen=True, slots=True)
class BuiltinSkillDefinition:
    """Static definition for a built-in skill."""

    name: str
    asset_dir_name: str
    description: str
    scope: str = "system"

    @property
    def asset_dir(self) -> Path:
        return _BUILTIN_SKILL_ASSETS_ROOT / self.asset_dir_name

    @property
    def s3_prefix(self) -> str:
        return f"builtin/skills/{self.name}"


BUILTIN_SKILLS: tuple[BuiltinSkillDefinition, ...] = (
    BuiltinSkillDefinition(
        name="skill-creator",
        asset_dir_name="skill-creator",
        description="Built-in skill for creating new skills via agent",
    ),
)


@dataclass(frozen=True, slots=True)
class BuiltinSkillBundle:
    """Resolved bundle metadata for a built-in skill."""

    definition: BuiltinSkillDefinition
    entry: dict[str, object]
    source: dict[str, object]
    description: str
    asset_dir_exists: bool


class SkillBootstrapService:
    """Ensures built-in skills exist in the database."""

    @classmethod
    def bootstrap_builtin_skills(cls, db: Session) -> None:
        """Create or update all built-in skills."""
        storage_service = cls._build_storage_service()
        for definition in BUILTIN_SKILLS:
            bundle = cls._build_bundle(definition)
            existing = SkillRepository.get_by_name_and_scope(
                db, definition.name, definition.scope
            )
            if not bundle.asset_dir_exists and existing is not None:
                logger.info(
                    "builtin_skill_assets_missing_keep_existing",
                    extra={"skill_name": definition.name},
                )
                continue
            cls._sync_bundle_assets(storage_service, bundle, existing)
            cls._ensure_builtin_skill(db, bundle)

    @classmethod
    def _ensure_builtin_skill(cls, db: Session, bundle: BuiltinSkillBundle) -> Skill:
        """Create or update a built-in skill with upsert semantics."""
        definition = bundle.definition
        existing = SkillRepository.get_by_name_and_scope(db, definition.name, definition.scope)

        if existing is None:
            skill = Skill(
                name=definition.name,
                description=bundle.description,
                scope=definition.scope,
                owner_user_id=SYSTEM_SKILL_OWNER_USER_ID,
                entry=dict(bundle.entry),
                source=dict(bundle.source),
            )
            SkillRepository.create(db, skill)
            db.flush()
            return skill

        needs_update = any(
            (
                existing.owner_user_id != SYSTEM_SKILL_OWNER_USER_ID,
                existing.description != bundle.description,
                existing.entry != bundle.entry,
                existing.source != bundle.source,
            )
        )
        if not needs_update:
            return existing

        existing.description = bundle.description
        existing.scope = definition.scope
        existing.owner_user_id = SYSTEM_SKILL_OWNER_USER_ID
        existing.entry = dict(bundle.entry)
        existing.source = dict(bundle.source)
        db.flush()
        return existing

    @classmethod
    def _build_bundle(cls, definition: BuiltinSkillDefinition) -> BuiltinSkillBundle:
        entry: dict[str, object] = {
            "s3_key": f"{definition.s3_prefix}/",
            "is_prefix": True,
        }

        if not definition.asset_dir.exists():
            logger.warning(
                "builtin_skill_assets_missing",
                extra={
                    "skill_name": definition.name,
                    "asset_dir": str(definition.asset_dir),
                },
            )
            return BuiltinSkillBundle(
                definition=definition,
                entry=entry,
                source={
                    "kind": "system",
                    "version": "assets-missing",
                },
                description=definition.description,
                asset_dir_exists=False,
            )

        skill_markdown = cls._read_skill_markdown(definition.asset_dir / "SKILL.md")
        frontmatter = parse_yaml_front_matter(skill_markdown)
        description = cls._normalize_description(frontmatter.get("description")) or definition.description
        version = cls._compute_asset_hash(definition.asset_dir)
        source: dict[str, object] = {
            "kind": "system",
            "version": version,
            "asset_dir": f"skills/{definition.asset_dir_name}",
        }

        return BuiltinSkillBundle(
            definition=definition,
            entry=entry,
            source=source,
            description=description,
            asset_dir_exists=True,
        )

    @classmethod
    def _sync_bundle_assets(
        cls,
        storage_service: S3StorageService | None,
        bundle: BuiltinSkillBundle,
        existing: Skill | None,
    ) -> None:
        if not bundle.asset_dir_exists or storage_service is None:
            return

        key = f"{bundle.definition.s3_prefix}/SKILL.md"
        version = bundle.source.get("version")
        existing_version = None
        existing_source = (
            existing.source
            if existing is not None and isinstance(existing.source, dict)
            else None
        )
        if existing_source is not None:
            raw_version = existing_source.get("version")
            if isinstance(raw_version, str):
                existing_version = raw_version

        needs_upload = existing_version != version or not storage_service.exists(key)

        if not needs_upload:
            logger.info(
                "builtin_skill_assets_already_synced",
                extra={
                    "skill_name": bundle.definition.name,
                    "version": version,
                    "s3_key": key,
                },
            )
            return

        uploaded = storage_service.sync_directory(
            source_dir=bundle.definition.asset_dir,
            prefix=bundle.definition.s3_prefix,
        )
        logger.info(
            "builtin_skill_assets_synced",
            extra={
                "skill_name": bundle.definition.name,
                "version": version,
                "file_count": uploaded,
                "prefix": f"{bundle.definition.s3_prefix}/",
            },
        )

    @staticmethod
    def _build_storage_service() -> S3StorageService | None:
        try:
            return S3StorageService()
        except Exception:
            logger.warning("builtin_skill_storage_unavailable", exc_info=True)
            return None

    @staticmethod
    def _read_skill_markdown(path: Path) -> str:
        try:
            return path.read_text(encoding="utf-8")
        except FileNotFoundError:
            logger.warning("builtin_skill_markdown_missing", extra={"path": str(path)})
            return ""

    @staticmethod
    def _normalize_description(value: object) -> str | None:
        if not isinstance(value, str):
            return None
        normalized = value.strip()
        return normalized[:1000] if normalized else None

    @staticmethod
    def _compute_asset_hash(asset_dir: Path) -> str:
        digest = hashlib.sha256()
        base = asset_dir.resolve()

        for file_path in sorted(asset_dir.rglob("*")):
            if not file_path.is_file() or file_path.is_symlink():
                continue
            if "__pycache__" in file_path.parts or file_path.name == ".DS_Store":
                continue

            relative = file_path.resolve().relative_to(base).as_posix()
            digest.update(relative.encode("utf-8"))
            digest.update(b"\0")
            digest.update(file_path.read_bytes())
            digest.update(b"\0")

        return digest.hexdigest()
