__all__ = ["SessionService", "CallbackService"]


def __getattr__(name: str) -> object:
    if name == "CallbackService":
        from app.services.callback_service import CallbackService

        return CallbackService
    if name == "SessionService":
        from app.services.session_service import SessionService

        return SessionService
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
