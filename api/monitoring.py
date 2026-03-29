"""Health and optional system metrics (admin-protected where noted)."""

from __future__ import annotations

import platform
from datetime import datetime, timezone

from flask import Blueprint, current_app, jsonify
from sqlalchemy import text

from ..utils.database import db
from .auth_utils import roles_required

monitoring_bp = Blueprint("monitoring", __name__)


@monitoring_bp.get("/health")
def monitoring_health():
    return jsonify(
        {
            "status": "healthy",
            "service": "payright-api",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
    )


@monitoring_bp.get("/ready")
def monitoring_ready():
    """DB connectivity check for orchestrators / load balancers."""
    try:
        db.session.execute(text("SELECT 1"))
        return jsonify(
            {
                "status": "ready",
                "database": "ok",
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
        )
    except Exception as e:
        return (
            jsonify(
                {
                    "status": "not_ready",
                    "database": "error",
                    "error": str(e)[:200],
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                }
            ),
            503,
        )


@monitoring_bp.get("/system")
@roles_required("admin")
def monitoring_system():
    try:
        import psutil
    except ImportError:
        return jsonify(
            {
                "error": "psutil not installed",
                "platform": platform.platform(),
                "python_version": platform.python_version(),
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
        )

    try:
        du = psutil.disk_usage(str(current_app.root_path))
    except OSError:
        du = None

    mem = psutil.virtual_memory()
    return jsonify(
        {
            "platform": platform.platform(),
            "python_version": platform.python_version(),
            "cpu_count": psutil.cpu_count() or 0,
            "cpu_percent": psutil.cpu_percent(interval=0.2),
            "memory": {
                "total": mem.total,
                "available": mem.available,
                "percent": mem.percent,
            },
            "disk_app_root": (
                {
                    "total": du.total,
                    "used": du.used,
                    "free": du.free,
                    "percent": round(100 * du.used / du.total, 2) if du.total else None,
                }
                if du
                else None
            ),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
    )


@monitoring_bp.get("/database")
@roles_required("admin")
def monitoring_database():
    try:
        db.session.execute(text("SELECT 1"))
        uri = current_app.config.get("SQLALCHEMY_DATABASE_URI") or ""
        scheme = uri.split(":", 1)[0] if uri else "unknown"
        return jsonify(
            {
                "status": "connected",
                "scheme": scheme,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
        )
    except Exception as e:
        return (
            jsonify(
                {
                    "status": "error",
                    "error": str(e)[:300],
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                }
            ),
            500,
        )
