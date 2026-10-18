import datetime as _dt
import json
import logging
import os
import sys
from logging.handlers import TimedRotatingFileHandler
from pathlib import Path
from typing import Any

from app.core.observability.request_context import get_request_id, get_trace_id

_installed_record_factory = False


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "y", "on"}


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        return int(raw.strip())
    except Exception:
        return default


def _parse_level(value: str | None, *, default: int) -> int:
    if not value:
        return default
    candidate = value.strip().upper()
    mapping = logging.getLevelNamesMapping()
    return mapping.get(candidate, default)


def _safe_value(key: str, value: Any) -> str:
    lowered = key.lower()
    if any(
        token in lowered
        for token in ("token", "secret", "password", "authorization", "api_key")
    ):
        return '"***"'

    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return str(value)

    if isinstance(value, (dict, list, tuple)):
        dumped = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
        if len(dumped) > 800:
            dumped = dumped[:800] + "...(truncated)"
        return json.dumps(dumped, ensure_ascii=False)

    text = str(value)
    text = text.replace("\n", "\\n")
    if len(text) > 800:
        text = text[:800] + "...(truncated)"
    return json.dumps(text, ensure_ascii=False)


_STANDARD_ATTRS: set[str] = set(
    logging.LogRecord(
        name="x",
        level=logging.INFO,
        pathname=__file__,
        lineno=1,
        msg="x",
        args=(),
        exc_info=None,
    ).__dict__.keys()
)


class _KeyValueFormatter(logging.Formatter):
    def formatTime(self, record: logging.LogRecord, datefmt: str | None = None) -> str:  # noqa: N802
        dt = _dt.datetime.fromtimestamp(record.created, tz=_dt.timezone.utc)
        return dt.isoformat(timespec="milliseconds").replace("+00:00", "Z")

    def format(self, record: logging.LogRecord) -> str:
        message = record.getMessage()
        service = getattr(record, "service", "-")
        request_id = getattr(record, "request_id", "-")
        trace_id = getattr(record, "trace_id", "-")

        base = (
            f"{self.formatTime(record)} {record.levelname} {service} {record.name} "
            f"[request_id={request_id} trace_id={trace_id}] {message}"
        )

        extras = {
            k: v
            for k, v in record.__dict__.items()
            if k not in _STANDARD_ATTRS
            and not k.startswith("_")
            and k not in {"service", "request_id", "trace_id"}
        }
        if extras:
            extra_kv = " ".join(
                f"{k}={_safe_value(k, v)}" for k, v in sorted(extras.items())
            )
            base = f"{base} {extra_kv}"

        if record.exc_info:
            base = f"{base}\n{self.formatException(record.exc_info)}"

        return base


def _configure_noisy_loggers(*, log_sql: bool, access_log: bool, debug: bool) -> None:
    # Uvicorn access logs are typically redundant once we add our own request logging middleware.
    logging.getLogger("uvicorn.access").setLevel(
        logging.INFO if access_log else logging.WARNING
    )

    # Keep uvicorn logs, but route them through the root handler/formatter.
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        lg = logging.getLogger(name)
        lg.handlers.clear()
        lg.propagate = True

    # SQLAlchemy can be extremely noisy (full SQL + params). Keep it off unless explicitly enabled.
    logging.getLogger("sqlalchemy.engine.Engine").setLevel(
        logging.INFO if log_sql else logging.WARNING
    )
    logging.getLogger("sqlalchemy.pool").setLevel(logging.WARNING)

    # Network clients tend to be noisy in INFO/DEBUG.
    for name in ("httpx", "httpcore", "urllib3", "botocore", "boto3"):
        logging.getLogger(name).setLevel(logging.WARNING)


def _build_file_handler(
    *,
    service_name: str,
    formatter: logging.Formatter,
) -> logging.Handler | None:
    # File logging is opt-in to avoid unexpected disk usage in some deployments.
    if not _env_bool("LOG_TO_FILE", False):
        return None

    log_dir = (os.getenv("LOG_DIR") or "./logs").strip() or "./logs"
    file_name = (
        os.getenv("LOG_FILE_NAME") or f"{service_name}.log"
    ).strip() or f"{service_name}.log"
    backup_count = _env_int("LOG_BACKUP_COUNT", 14)

    try:
        Path(log_dir).mkdir(parents=True, exist_ok=True)
        file_path = str(Path(log_dir) / file_name)
        handler = TimedRotatingFileHandler(
            filename=file_path,
            when="midnight",
            interval=1,
            backupCount=backup_count,
            utc=True,
            encoding="utf-8",
            delay=True,
        )
        handler.setFormatter(formatter)
        return handler
    except Exception:
        logging.getLogger(__name__).exception(
            "file_logging_setup_failed",
            extra={"service": service_name, "log_dir": log_dir, "file_name": file_name},
        )
        return None


def configure_logging(
    *,
    debug: bool,
    service_name: str = "backend",
    log_sql: bool | None = None,
    access_log: bool | None = None,
) -> None:
    """Configure unified logging output (stdout + formatter + context ids + noise reduction)."""
    global _installed_record_factory

    if log_sql is None:
        log_sql = _env_bool("LOG_SQL", False)
    if access_log is None:
        access_log = _env_bool("UVICORN_ACCESS_LOG", False)

    if not _installed_record_factory:
        old_factory = logging.getLogRecordFactory()

        def record_factory(*args, **kwargs):
            record = old_factory(*args, **kwargs)
            record.service = service_name
            record.request_id = get_request_id() or "-"
            record.trace_id = get_trace_id() or "-"
            return record

        logging.setLogRecordFactory(record_factory)
        _installed_record_factory = True

    default_level = logging.DEBUG if debug else logging.INFO
    level = _parse_level(os.getenv("LOG_LEVEL"), default=default_level)

    formatter = _KeyValueFormatter()
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)

    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(level)

    file_handler = _build_file_handler(service_name=service_name, formatter=formatter)
    if file_handler is not None:
        root.addHandler(file_handler)

    _configure_noisy_loggers(
        log_sql=bool(log_sql), access_log=bool(access_log), debug=debug
    )

    # Initialize telemetry for product analytics
    try:
        from app.core.observability import telemetry  # noqa: F401
    except ImportError:
        pass
