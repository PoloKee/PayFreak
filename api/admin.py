from datetime import date, datetime
from decimal import Decimal

from flask import Blueprint, current_app, jsonify, request
from sqlalchemy import inspect as sa_inspect

from ..models import (
    AgentConversation,
    AgentMemory,
    AgentMessage,
    AuditLog,
    BankStatement,
    Employee,
    Employer,
    FieldRegistry,
    GenerationHistory,
    PayStub,
    SystemSetting,
    Template,
    UploadedDocument,
    User,
)
from ..utils.database import db
from .auth_utils import current_user_id, roles_required

admin_bp = Blueprint("admin", __name__)


@admin_bp.get("/stats")
@roles_required("admin")
def admin_stats():
    today = date.today()
    month_start = datetime(today.year, today.month, 1)
    stubs_m = PayStub.query.filter(PayStub.created_at >= month_start).count()
    return jsonify(
        {
            "users": User.query.count(),
            "employees": Employee.query.count(),
            "templates_active": Template.query.filter_by(is_active=True).count(),
            "pay_stubs_total": PayStub.query.count(),
            "bank_statements_total": BankStatement.query.count(),
            "documents_this_month": stubs_m,
            "uploaded_documents": UploadedDocument.query.count(),
            "generation_history_total": GenerationHistory.query.count(),
            "audit_log_total": AuditLog.query.count(),
            "system_settings_total": SystemSetting.query.count(),
        }
    )


@admin_bp.post("/backup")
@roles_required("admin")
def admin_backup():
    """Operational guidance: backups run on the host or DBA tooling (Phase 7)."""
    _ = request.get_json(silent=True)
    return jsonify(
        {
            "status": "client_or_ops",
            "message": "Run pg_dump on the database host or use repo backup scripts; POST does not stream a dump.",
            "scripts": [
                "scripts/backup_payright.ps1",
                "scripts/backup_payright.sh",
            ],
            "pg_dump_example": "pg_dump -U payright payright > backup.sql",
            "docker_example": "docker compose exec -T db pg_dump -U payright payright",
        }
    )


@admin_bp.post("/restore")
@roles_required("admin")
def admin_restore():
    return jsonify(
        {
            "status": "client_or_ops",
            "message": "Restore is manual: psql/pg_restore from a trusted dump by a DBA; not executed via this API.",
            "psql_example": "psql -U payright payright < backup.sql",
        }
    )


@admin_bp.get("/health/db")
@roles_required("admin")
def admin_db_ping():
    from sqlalchemy import text

    from ..utils.database import db as dbo

    dbo.session.execute(text("SELECT 1"))
    return jsonify({"database": "ok"})


@admin_bp.post("/sync-gallery-templates")
@roles_required("admin")
def admin_sync_gallery_templates():
    """Register missing folders from template-gallery (same as ``flask init-templates``)."""
    from ..services.template_sync import reindex_gallery_templates

    n = reindex_gallery_templates()
    return jsonify({"registered_new": n})


@admin_bp.post("/upload-gallery-zip")
@roles_required("admin")
def admin_upload_gallery_zip():
    """Upload a ZIP into ``template-gallery/<slug>/`` and register the template row."""
    if "file" not in request.files:
        return jsonify({"error": "file required"}), 400
    f = request.files["file"]
    if not f.filename:
        return jsonify({"error": "empty filename"}), 400
    raw = f.read()
    explicit = (request.form.get("slug") or "").strip() or None
    try:
        from .templates import _template_dict
        from ..services.gallery_zip_install import install_gallery_zip

        result = install_gallery_zip(raw, explicit_slug=explicit)
        tid = result.get("template_id")
        t = db.session.get(Template, tid) if tid else None
        out = {**result}
        if t is not None:
            out["template"] = _template_dict(t)
        return jsonify(out), 201
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except FileExistsError as e:
        return jsonify({"error": str(e)}), 409
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 500


def _setting_dict(s: SystemSetting) -> dict:
    return {
        "id": s.id,
        "setting_key": s.setting_key,
        "setting_value": s.setting_value,
        "setting_type": s.setting_type,
        "description": s.description,
        "updated_by": s.updated_by,
        "updated_at": s.updated_at.isoformat() + "Z" if s.updated_at else None,
    }


@admin_bp.get("/settings")
@roles_required("admin")
def list_system_settings():
    rows = SystemSetting.query.order_by(SystemSetting.setting_key).all()
    return jsonify({"settings": [_setting_dict(s) for s in rows]})


@admin_bp.put("/settings/<string:setting_key>")
@roles_required("admin")
def upsert_system_setting(setting_key: str):
    key = (setting_key or "").strip()
    if not key or len(key) > 100:
        return jsonify({"error": "invalid setting_key"}), 400
    data = request.get_json(silent=True) or {}
    raw_val = data.get("value")
    val = None if raw_val is None else str(raw_val)
    row = SystemSetting.query.filter_by(setting_key=key).first()
    uid = current_user_id()
    if row is None:
        row = SystemSetting(
            setting_key=key,
            setting_value=val,
            setting_type=(data.get("setting_type") or "string")[:50] or "string",
            description=data.get("description"),
            updated_by=uid,
        )
        db.session.add(row)
    else:
        row.setting_value = val
        if "setting_type" in data and data["setting_type"] is not None:
            row.setting_type = str(data["setting_type"])[:50]
        if "description" in data:
            row.description = data["description"]
        row.updated_by = uid
        row.updated_at = datetime.utcnow()
    db.session.commit()
    return jsonify({"setting": _setting_dict(row)})


def _generation_dict(g: GenerationHistory) -> dict:
    return {
        "id": g.id,
        "user_id": g.user_id,
        "document_type": g.document_type,
        "template_id": g.template_id,
        "employee_ids": g.employee_ids,
        "generation_params": g.generation_params,
        "documents_generated": g.documents_generated,
        "status": g.status,
        "started_at": g.started_at.isoformat() + "Z" if g.started_at else None,
        "completed_at": g.completed_at.isoformat() + "Z" if g.completed_at else None,
    }


@admin_bp.get("/generation-history")
@roles_required("admin")
def list_generation_history():
    try:
        limit = int(request.args.get("limit") or 50)
    except ValueError:
        limit = 50
    limit = max(1, min(limit, 200))
    rows = (
        GenerationHistory.query.order_by(GenerationHistory.started_at.desc())
        .limit(limit)
        .all()
    )
    return jsonify({"history": [_generation_dict(g) for g in rows]})


def _audit_dict(a: AuditLog) -> dict:
    return {
        "id": a.id,
        "user_id": a.user_id,
        "action": a.action,
        "entity_type": a.entity_type,
        "entity_id": a.entity_id,
        "old_data": a.old_data,
        "new_data": a.new_data,
        "ip_address": a.ip_address,
        "user_agent": a.user_agent,
        "created_at": a.created_at.isoformat() + "Z" if a.created_at else None,
    }


@admin_bp.get("/audit-log")
@roles_required("admin")
def list_audit_log():
    try:
        limit = int(request.args.get("limit") or 100)
    except ValueError:
        limit = 100
    try:
        offset = int(request.args.get("offset") or 0)
    except ValueError:
        offset = 0
    limit = max(1, min(limit, 500))
    offset = max(0, offset)
    total = AuditLog.query.count()
    rows = (
        AuditLog.query.order_by(AuditLog.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return jsonify(
        {
            "total": total,
            "offset": offset,
            "limit": limit,
            "entries": [_audit_dict(a) for a in rows],
        }
    )


# --- Database browser (admin, whitelist only) ---

TABLE_MODEL_MAP: dict[str, type] = {
    "users": User,
    "employers": Employer,
    "employees": Employee,
    "templates": Template,
    "field_registry": FieldRegistry,
    "pay_stubs": PayStub,
    "bank_statements": BankStatement,
    "uploaded_documents": UploadedDocument,
    "agent_conversations": AgentConversation,
    "agent_messages": AgentMessage,
    "agent_memory": AgentMemory,
    "generation_history": GenerationHistory,
    "system_settings": SystemSetting,
    "audit_log": AuditLog,
}


def _serialize_cell(val):
    if val is None:
        return None
    if isinstance(val, datetime):
        return val.isoformat() + "Z"
    if isinstance(val, date):
        return val.isoformat()
    if isinstance(val, Decimal):
        return float(val)
    if isinstance(val, (bytes, bytearray)):
        return f"<{len(val)} bytes>"
    return val


def _model_row_dict(model_cls, inst, redact: dict | None = None) -> dict:
    redact = redact or {}
    out: dict = {}
    mapper = sa_inspect(inst).mapper
    for col in mapper.column_attrs:
        key = col.key
        v = getattr(inst, key)
        if key in redact:
            out[key] = redact[key]
        else:
            out[key] = _serialize_cell(v)
    return out


def _table_column_meta(model_cls) -> list[dict]:
    mapper = sa_inspect(model_cls).mapper
    cols = []
    for col in mapper.column_attrs:
        c = col.columns[0]
        cols.append({"name": col.key, "type": str(c.type)})
    return cols


@admin_bp.get("/database/overview")
@roles_required("admin")
def admin_database_overview():
    from sqlalchemy import text

    db.session.execute(text("SELECT 1"))
    uri = current_app.config.get("SQLALCHEMY_DATABASE_URI") or ""
    scheme = "unknown"
    if uri:
        scheme = (uri.split(":", 1)[0] if ":" in uri else uri).lower()
    tables = []
    for name in sorted(TABLE_MODEL_MAP.keys()):
        model_cls = TABLE_MODEL_MAP[name]
        count = db.session.query(model_cls).count()
        tables.append(
            {
                "name": name,
                "count": count,
                "columns": _table_column_meta(model_cls),
            }
        )
    stats = {
        "users": User.query.count(),
        "employers": Employer.query.count(),
        "employees": Employee.query.count(),
        "pay_stubs": PayStub.query.count(),
        "bank_statements": BankStatement.query.count(),
        "audit_log": AuditLog.query.count(),
    }
    return jsonify(
        {
            "database_scheme": scheme,
            "tables": tables,
            "stats": stats,
        }
    )


@admin_bp.get("/database/tables/<string:table_name>")
@roles_required("admin")
def admin_database_table_rows(table_name: str):
    key = (table_name or "").strip().lower()
    model_cls = TABLE_MODEL_MAP.get(key)
    if model_cls is None:
        return jsonify({"error": "Unknown table"}), 404
    try:
        limit = int(request.args.get("limit") or 50)
    except ValueError:
        limit = 50
    try:
        offset = int(request.args.get("offset") or 0)
    except ValueError:
        offset = 0
    limit = max(1, min(limit, 200))
    offset = max(0, offset)
    total = db.session.query(model_cls).count()
    redact = {}
    if key == "users":
        redact["password_hash"] = "—redacted—"
    q = db.session.query(model_cls)
    if hasattr(model_cls, "id"):
        q = q.order_by(model_cls.id)
    rows = q.offset(offset).limit(limit).all()
    return jsonify(
        {
            "table": key,
            "total": total,
            "offset": offset,
            "limit": limit,
            "rows": [_model_row_dict(model_cls, r, redact) for r in rows],
        }
    )


# --- Analytics, email test, backup (EMAIL-FEATURES / ops) ---


@admin_bp.get("/analytics/dashboard")
@roles_required("admin")
def admin_analytics_dashboard():
    from ..services.analytics_service import get_dashboard_stats, get_payroll_trends

    months = 6
    raw = request.args.get("trend_months")
    if raw and str(raw).isdigit():
        months = max(1, min(int(raw), 36))
    return jsonify(
        {
            "dashboard": get_dashboard_stats(),
            "payroll_trends": get_payroll_trends(months),
        }
    )


@admin_bp.get("/analytics/employee/<int:employee_id>")
@roles_required("admin")
def admin_analytics_employee(employee_id: int):
    from ..services.analytics_service import get_employee_paystub_summary

    s = get_employee_paystub_summary(employee_id)
    if s is None:
        return jsonify({"error": "Not found"}), 404
    return jsonify(s)


@admin_bp.get("/analytics/tax-summary")
@roles_required("admin")
def admin_analytics_tax_summary():
    from ..services.analytics_service import get_tax_summary

    raw = request.args.get("year")
    year = int(raw) if raw and str(raw).isdigit() else None
    return jsonify(get_tax_summary(year))


@admin_bp.post("/email/test")
@roles_required("admin")
def admin_email_test():
    from ..services.email_service import (
        build_multipart_message,
        send_message_sync,
        smtp_credentials_ok,
    )

    data = request.get_json(silent=True) or {}
    to = (data.get("to") or "").strip()
    if not to:
        return jsonify({"error": "to required"}), 400
    app = current_app._get_current_object()
    if not app.config.get("EMAIL_LOG_ONLY") and not smtp_credentials_ok(app):
        return jsonify(
            {
                "error": "SMTP not configured (set SMTP_USER/SMTP_PASSWORD or EMAIL_LOG_ONLY=true)",
            }
        ), 400
    try:
        msg = build_multipart_message(
            app,
            subject="PayRight — SMTP test",
            recipients=[to],
            html_body="<p>If you received this, SMTP settings are working.</p>",
            text_body="If you received this, SMTP settings are working.",
            attachment_paths=None,
        )
        send_message_sync(app, msg)
    except Exception as e:
        return jsonify({"error": str(e)}), 502
    return jsonify({"status": "sent", "to": to})


@admin_bp.post("/backup/run")
@roles_required("admin")
def admin_backup_run():
    from ..services.backup_service import run_backup_bundle

    try:
        out = run_backup_bundle(current_app._get_current_object())
    except OSError as e:
        return jsonify({"error": str(e)}), 500
    return jsonify(out)
