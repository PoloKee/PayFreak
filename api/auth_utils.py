from functools import wraps
from typing import Any, Callable, Optional, TypeVar

from flask import jsonify
from flask_jwt_extended import get_jwt, get_jwt_identity, jwt_required

from ..models import User
from ..utils.database import db

F = TypeVar("F", bound=Callable[..., Any])


def current_user_id() -> Optional[int]:
    identity = get_jwt_identity()
    if identity is None:
        return None
    if isinstance(identity, dict):
        raw = identity.get("user_id")
        if raw is None:
            return None
        try:
            return int(raw)
        except (TypeError, ValueError):
            return None
    try:
        return int(identity)
    except (TypeError, ValueError):
        return None


def current_user() -> Optional[User]:
    uid = current_user_id()
    if uid is None:
        return None
    return db.session.get(User, uid)


def current_role() -> Optional[str]:
    claims = get_jwt()
    return claims.get("role")


def roles_required(*roles: str) -> Callable[[F], F]:
    def decorator(fn: F) -> F:
        @wraps(fn)
        @jwt_required()
        def wrapped(*args: Any, **kwargs: Any):
            role = current_role()
            if role not in roles:
                return jsonify({"error": "Forbidden"}), 403
            return fn(*args, **kwargs)

        return wrapped  # type: ignore[return-value]

    return decorator
