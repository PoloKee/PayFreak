import re
from pathlib import Path

from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required
from jinja2 import Template as JinjaTemplate

from config import TEMPLATE_GALLERY_DIR

from ..models import FieldRegistry, Template
from ..services.field_registry_service import FieldRegistryService
from ..services.template_service import TemplateService
from ..utils.database import db
from .auth_utils import roles_required

templates_bp = Blueprint("templates", __name__)


def _template_dict(t: Template) -> dict:
    return {
        "id": t.id,
        "name": t.name,
        "type": t.type,
        "description": t.description,
        "slug": t.slug,
        "file_path": t.file_path,
        "schema_path": t.schema_path,
        "preview_image": t.preview_image,
        "is_active": t.is_active,
        "version": t.version,
    }


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


@templates_bp.get("/")
@jwt_required()
def list_templates():
    rows = Template.query.order_by(Template.name).all()
    return jsonify({"templates": [_template_dict(t) for t in rows]})


@templates_bp.get("/gallery")
@jwt_required()
def gallery():
    ts = TemplateService()
    out: list[dict] = []
    root = Path(TEMPLATE_GALLERY_DIR)
    if not root.is_dir():
        return jsonify({"templates": []})
    for folder in sorted(p for p in root.iterdir() if p.is_dir()):
        slug = folder.name
        schema = ts.load_schema(slug)
        cfg = ts.load_config(slug)
        row = Template.query.filter_by(slug=slug).first()
        preview_url = None
        if (folder / "preview.png").is_file():
            preview_url = f"/template-gallery/{slug}/preview.png"
        out.append(
            {
                "slug": slug,
                "name": schema.get("name") or cfg.get("name") or slug,
                "type": schema.get("type") or cfg.get("type") or "pay_stub",
                "version": schema.get("version") or cfg.get("version") or "1.0",
                "preview_image": preview_url,
                "registered": row is not None,
                "template_id": row.id if row else None,
                "is_active": row.is_active if row else None,
            }
        )
    return jsonify({"templates": out})


def _slugify(label: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", label.lower()).strip("-")
    return (s[:80] if s else "template") or "template"


@templates_bp.post("/validate")
@jwt_required()
def validate_template_payload():
    data = request.get_json(silent=True) or {}
    html = data.get("html_content") or ""
    schema = data.get("schema") or {}
    issues: list[dict] = []
    fields = schema.get("fields") if isinstance(schema, dict) else []
    if isinstance(fields, list):
        for item in fields:
            if not isinstance(item, dict):
                continue
            key = item.get("key") or ""
            if key and key not in html:
                issues.append(
                    {
                        "field": key,
                        "message": "Field key not found as literal substring in HTML",
                    }
                )
    if "{{" not in html and "{%" not in html:
        issues.append({"message": "No Jinja-like placeholders ({{ or {%) found"})
    return jsonify({"valid": len(issues) == 0, "issues": issues})


@templates_bp.post("/")
@roles_required("admin", "employer")
def create_template():
    data = request.get_json(silent=True) or {}
    slug = (data.get("slug") or "").strip()
    name = (data.get("name") or slug).strip()
    ttype = data.get("type") or "pay_stub"
    if ttype not in ("pay_stub", "bank_statement"):
        return jsonify({"error": "type must be pay_stub or bank_statement"}), 400
    if not slug:
        return jsonify({"error": "slug required"}), 400
    if Template.query.filter_by(slug=slug).first():
        return jsonify({"error": "slug already registered"}), 409
    folder = Path(TEMPLATE_GALLERY_DIR) / slug
    if not folder.is_dir():
        return jsonify({"error": "template folder not found in template-gallery"}), 400
    t = Template(
        name=name,
        type=ttype,
        description=data.get("description"),
        slug=slug,
        file_path=str(folder / "template.html"),
        schema_path=str(folder / "schema.json"),
        preview_image=str(folder / "preview.png") if (folder / "preview.png").exists() else None,
        is_active=data.get("is_active", True),
        version=int(data.get("version", 1)),
    )
    db.session.add(t)
    db.session.commit()
    FieldRegistryService().ensure_template_has_schema_fields(t, slug)
    return jsonify(_template_dict(t)), 201


@templates_bp.get("/<int:template_id>")
@jwt_required()
def get_template(template_id: int):
    t = db.session.get(Template, template_id)
    if t is None:
        return jsonify({"error": "Not found"}), 404
    return jsonify(_template_dict(t))


@templates_bp.post("/<int:template_id>/preview")
@jwt_required()
def preview_template_render(template_id: int):
    """Render template HTML with a Jinja context (implimentationRdMap2-style preview)."""
    t = db.session.get(Template, template_id)
    if t is None:
        return jsonify({"error": "Not found"}), 404
    data = request.get_json(silent=True) or {}
    override = data.get("html_content")
    if override:
        src = str(override)
    elif t.file_path and Path(t.file_path).is_file():
        src = Path(t.file_path).read_text(encoding="utf-8")
    else:
        return jsonify({"error": "No template HTML available"}), 400
    ctx = data.get("context") if isinstance(data.get("context"), dict) else {}
    try:
        html = JinjaTemplate(src).render(**ctx)
    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": str(exc)}), 400
    return jsonify({"html": html})


@templates_bp.put("/<int:template_id>")
@roles_required("admin", "employer")
def update_template(template_id: int):
    t = db.session.get(Template, template_id)
    if t is None:
        return jsonify({"error": "Not found"}), 404
    data = request.get_json(silent=True) or {}
    for key in ("name", "description", "is_active", "version"):
        if key in data:
            setattr(t, key, data[key])
    db.session.commit()
    FieldRegistryService().ensure_template_has_schema_fields(t, t.slug)
    return jsonify(_template_dict(t))


@templates_bp.delete("/<int:template_id>")
@roles_required("admin")
def delete_template(template_id: int):
    t = db.session.get(Template, template_id)
    if t is None:
        return jsonify({"error": "Not found"}), 404
    db.session.delete(t)
    db.session.commit()
    return jsonify({"status": "deleted"})


@templates_bp.get("/<int:template_id>/fields")
@jwt_required()
def template_fields(template_id: int):
    t = db.session.get(Template, template_id)
    if t is None:
        return jsonify({"error": "Not found"}), 404
    fields = FieldRegistry.query.filter_by(template_id=template_id).all()
    return jsonify({"fields": [_field_dict(f) for f in fields]})


@templates_bp.post("/<int:template_id>/sync-fields")
@roles_required("admin", "employer")
def sync_template_fields(template_id: int):
    t = db.session.get(Template, template_id)
    if t is None:
        return jsonify({"error": "Not found"}), 404
    n = FieldRegistryService().ensure_template_has_schema_fields(t, t.slug)
    return jsonify({"registered_or_updated_fields": n})


@templates_bp.post("/<int:template_id>/duplicate")
@roles_required("admin", "employer")
def duplicate_template(template_id: int):
    src = db.session.get(Template, template_id)
    if src is None:
        return jsonify({"error": "Not found"}), 404
    data = request.get_json(silent=True) or {}
    new_name = (data.get("new_name") or f"{src.name} (Copy)").strip()
    base = _slugify(new_name)
    slug = base
    i = 0
    while Template.query.filter_by(slug=slug).first():
        i += 1
        slug = f"{base}-{i}"
    folder = Path(TEMPLATE_GALLERY_DIR) / src.slug
    if not folder.is_dir():
        return jsonify({"error": "Source gallery folder missing"}), 400
    new_t = Template(
        name=new_name,
        type=src.type,
        description=src.description,
        slug=slug,
        file_path=str(folder / "template.html"),
        schema_path=str(folder / "schema.json"),
        preview_image=str(folder / "preview.png")
        if (folder / "preview.png").exists()
        else None,
        is_active=bool(data.get("is_active", True)),
        version=int(data.get("version", 1)),
    )
    db.session.add(new_t)
    db.session.flush()
    FieldRegistryService().ensure_template_has_schema_fields(new_t, src.slug)
    db.session.commit()
    return jsonify(_template_dict(new_t)), 201
