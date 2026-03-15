import logging

from app.core.database import SessionLocal
from app.init_data.mcp_servers.builtin_mcp import McpServerBootstrapService
from app.init_data.skills.builtin_skills import SkillBootstrapService

logger = logging.getLogger(__name__)


class DataBootstrapService:
    """Bootstrap built-in data that must exist before serving requests."""

    @classmethod
    def bootstrap_all(cls) -> None:
        """Bootstrap all built-in data with a dedicated database session."""
        db = SessionLocal()
        try:
            SkillBootstrapService.bootstrap_builtin_skills(db)
            McpServerBootstrapService.bootstrap_builtin_servers(db)
            db.commit()
        except Exception:
            db.rollback()
            logger.exception("bootstrap_all_failed")
            raise
        finally:
            db.close()
