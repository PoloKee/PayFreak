from flask import Blueprint, jsonify, request

from ..models import FieldRegistry, Template
from ..services.field_registry_service import FieldRegistryService
from ..utils.database import db
from .auth_utils import roles_required

fields_bp = Blueprint("fields", __name__)


def _field_dict(f: FieldRegistry) -> dict:
    return {
        "id": f.id,
        "template_id": f.template_id,
        "field_key": f.field_key,
        "field_label": f.field_label,
        "field_type": f.field_type,
        "validation_rules": f.validation_rules,
        "is_required": f.is_required,
        "mapping_path": f.mapping_path,
    }


@fields_bp.get("/")
@roles_required("admin", "employer")
def list_all_fields():
    rows = FieldRegistry.query.order_by(
        FieldRegistry.template_id, FieldRegistry.field_key
    ).limit(500).all()
    return jsonify({"fields": [_field_dict(f) for f in rows]})


@fields_bp.get("/template/<int:template_id>")
@roles_required("admin", "employer")
def fields_by_template(template_id: int):
    t = db.session.get(Template, template_id)
    if t is None:
        return jsonify({"error": "Not found"}), 404
    rows = FieldRegistry.query.filter_by(template_id=template_id).all()
    return jsonify({"fields": [_field_dict(f) for f in rows]})


@fields_bp.post("/")
@roles_required("admin", "employer")
def register_field():
    data = request.get_json(silent=True) or {}
    tid = data.get("template_id")
    key = (data.get("field_key") or "").strip()
    if not tid or not key:
        return jsonify({"error": "template_id and field_key required"}), 400
    t = db.session.get(Template, int(tid))
    if t is None:
        return jsonify({"error": "Template not found"}), 404
    if FieldRegistry.query.filter_by(template_id=t.id, field_key=key).first():
        return jsonify({"error": "field_key already exists"}), 409
    f = FieldRegistry(
        template_id=t.id,
        field_key=key,
        field_label=data.get("field_label"),
        field_type=data.get("field_type", "text"),
        validation_rules=data.get("validation_rules"),
        is_required=bool(data.get("is_required", False)),
        mapping_path=data.get("mapping_path"),
    )
    db.session.add(f)
    db.session.commit()
    return jsonify(_field_dict(f)), 201


@fields_bp.post("/sync/<int:template_id>")
@roles_required("admin", "employer")
def sync_schema(template_id: int):
    t = db.session.get(Template, template_id)
    if t is None:
        return jsonify({"error": "Not found"}), 404
    n = FieldRegistryService().ensure_template_has_schema_fields(t, t.slug)
    return jsonify({"status": "ok", "added_or_updated": n})
