import html.parser
import json
import re
import shutil
import uuid
import zipfile
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any, Dict, List, Optional

from config import TEMPLATE_GALLERY_DIR

from ..utils.database import db
from ..models import FieldRegistry, Template
from .base_agent import BaseAgent
from .types import Task


class TemplateAgent(BaseAgent):
    """Agent responsible for managing templates and field registry."""

    def __init__(self, config: Optional[Dict[str, Any]] = None):
        super().__init__("template", config)
        raw = (config or {}).get("template_gallery_path")
        self.template_gallery_path = Path(raw) if raw else Path(TEMPLATE_GALLERY_DIR)
        self.auto_validate = (config or {}).get("auto_validate", True)

    def execute_task(self, task: Task) -> Any:
        if task.task_type == "create_template":
            return self._create_template(task.data)
        if task.task_type == "update_template":
            return self._update_template(task.data)
        if task.task_type == "delete_template":
            return self._delete_template(task.data)
        if task.task_type == "import_template":
            return self._import_template(task.data)
        if task.task_type == "validate_template":
            return self._validate_template(task.data)
        if task.task_type == "sync_field_registry":
            return self._sync_field_registry(task.data)
        if task.task_type == "duplicate_template":
            return self._duplicate_template(task.data)

        raise ValueError(f"Unknown task type: {task.task_type}")

    def _create_template(self, data: Dict[str, Any]) -> Dict[str, Any]:
        try:
            name = data.get("name")
            template_type = data.get("type")
            html_content = data.get("html_content")
            schema = data.get("schema", {})
            style_content = data.get("style_content", "")
            preview_image = data.get("preview_image")

            if not name or not template_type or html_content is None:
                raise ValueError("name, type, and html_content are required")

            if self.auto_validate:
                v = self._validate_template(
                    {"html_content": html_content, "schema": schema}
                )
                if not v.get("valid"):
                    return {
                        "success": False,
                        "error": "Validation failed",
                        "validation": v,
                    }

            slug = self._unique_slug(name)
            template_folder = self.template_gallery_path / slug
            template_folder.mkdir(parents=True, exist_ok=True)

            html_path = template_folder / "template.html"
            html_path.write_text(html_content, encoding="utf-8")

            schema_path = template_folder / "schema.json"
            schema_path.write_text(json.dumps(schema, indent=2), encoding="utf-8")

            if style_content:
                (template_folder / "style.css").write_text(
                    style_content, encoding="utf-8"
                )

            template = Template(
                name=name,
                type=template_type,
                description=data.get("description"),
                slug=slug,
                file_path=str(html_path.resolve()),
                schema_path=str(schema_path.resolve()),
                preview_image=preview_image,
                version=1,
                is_active=data.get("is_active", True),
            )
            db.session.add(template)
            db.session.flush()

            if schema.get("fields"):
                self._register_fields(template.id, schema.get("fields", []))

            db.session.commit()

            return {
                "success": True,
                "template_id": template.id,
                "slug": slug,
                "folder": str(template_folder),
                "message": f"Template {name} created successfully",
            }
        except Exception as e:
            db.session.rollback()
            self.logger.error("Error creating template: %s", e)
            return {"success": False, "error": str(e)}

    def _update_template(self, data: Dict[str, Any]) -> Dict[str, Any]:
        try:
            template_id = data.get("template_id")
            template = db.session.get(Template, template_id)
            if not template:
                raise ValueError(f"Template {template_id} not found")

            if self.auto_validate and (
                data.get("html_content") is not None or data.get("schema") is not None
            ):
                v = self._validate_template(
                    {
                        "html_content": data.get("html_content"),
                        "schema": data.get("schema") if data.get("schema") is not None else {},
                    }
                )
                if not v.get("valid"):
                    return {
                        "success": False,
                        "error": "Validation failed",
                        "validation": v,
                    }

            if "name" in data:
                template.name = data["name"]
            if "description" in data:
                template.description = data["description"]
            if "is_active" in data:
                template.is_active = data["is_active"]

            if data.get("html_content") and template.file_path:
                Path(template.file_path).write_text(
                    data["html_content"], encoding="utf-8"
                )

            if data.get("schema") is not None and template.schema_path:
                Path(template.schema_path).write_text(
                    json.dumps(data["schema"], indent=2), encoding="utf-8"
                )
                if data["schema"].get("fields") is not None:
                    self._update_field_registry(
                        template.id, data["schema"]["fields"]
                    )

            if data.get("style_content") is not None and template.file_path:
                style_path = Path(template.file_path).parent / "style.css"
                if data["style_content"]:
                    style_path.write_text(data["style_content"], encoding="utf-8")
                elif style_path.is_file():
                    style_path.unlink()

            template.version = (template.version or 1) + 1
            db.session.commit()

            return {
                "success": True,
                "template_id": template.id,
                "version": template.version,
                "message": f"Template {template.name} updated successfully",
            }
        except Exception as e:
            db.session.rollback()
            self.logger.error("Error updating template: %s", e)
            return {"success": False, "error": str(e)}

    def _delete_template(self, data: Dict[str, Any]) -> Dict[str, Any]:
        try:
            template_id = data.get("template_id")
            hard_delete = data.get("hard_delete", False)

            template = db.session.get(Template, template_id)
            if not template:
                raise ValueError(f"Template {template_id} not found")

            label = template.name
            folder = Path(template.file_path).parent if template.file_path else None

            if hard_delete:
                db.session.delete(template)
                db.session.commit()
                if folder and folder.exists():
                    shutil.rmtree(folder)
                message = f"Template {label} permanently deleted"
            else:
                template.is_active = False
                db.session.commit()
                message = f"Template {label} deactivated"

            return {"success": True, "message": message}
        except Exception as e:
            db.session.rollback()
            self.logger.error("Error deleting template: %s", e)
            return {"success": False, "error": str(e)}

    def _import_template(self, data: Dict[str, Any]) -> Dict[str, Any]:
        try:
            source_path = data.get("source_path")
            source_type = data.get("source_type", "folder")
            if not source_path:
                raise ValueError("source_path is required")

            path = Path(source_path)
            if source_type == "zip":
                with TemporaryDirectory() as tmpdir:
                    with zipfile.ZipFile(path, "r") as zip_ref:
                        zip_ref.extractall(tmpdir)
                    extracted = list(Path(tmpdir).iterdir())
                    if len(extracted) == 1 and extracted[0].is_dir():
                        template_folder = extracted[0]
                    else:
                        template_folder = Path(tmpdir)
                    return self._import_from_folder(template_folder, data)

            if source_type == "folder":
                return self._import_from_folder(path, data)

            raise ValueError(f"Unsupported source type: {source_type}")
        except Exception as e:
            self.logger.error("Error importing template: %s", e)
            return {"success": False, "error": str(e)}

    def _import_from_folder(
        self, folder_path: Path, data: Dict[str, Any]
    ) -> Dict[str, Any]:
        html_path = folder_path / "template.html"
        if not html_path.exists():
            raise ValueError("template.html not found in import folder")
        html_content = html_path.read_text(encoding="utf-8")

        schema_path = folder_path / "schema.json"
        schema = {}
        if schema_path.exists():
            schema = json.loads(schema_path.read_text(encoding="utf-8"))

        style_content = ""
        sp = folder_path / "style.css"
        if sp.exists():
            style_content = sp.read_text(encoding="utf-8")

        return self._create_template(
            {
                "name": data.get("name", folder_path.name),
                "type": data.get("type", schema.get("type", "pay_stub")),
                "description": data.get("description", schema.get("description", "")),
                "html_content": html_content,
                "schema": schema,
                "style_content": style_content,
            }
        )

    def _validate_template(self, data: Dict[str, Any]) -> Dict[str, Any]:
        try:
            html_content = data.get("html_content")
            schema = data.get("schema", {})
            errors: List[str] = []
            warnings: List[str] = []

            if html_content:
                parser = html.parser.HTMLParser()
                try:
                    parser.feed(html_content)
                except Exception as e:
                    errors.append(f"HTML parsing error: {e}")

            if schema:
                for field in ("name", "type"):
                    if field not in schema:
                        errors.append(f"Schema missing required field: {field}")
                if "fields" in schema:
                    for field in schema["fields"]:
                        if "key" not in field:
                            errors.append(f"Field missing key: {field}")
                        if "label" not in field:
                            warnings.append(
                                f"Field {field.get('key', 'unknown')} missing label"
                            )

            return {
                "success": len(errors) == 0,
                "errors": errors,
                "warnings": warnings,
                "valid": len(errors) == 0,
            }
        except Exception as e:
            return {"success": False, "errors": [str(e)], "valid": False}

    def _sync_field_registry(self, data: Dict[str, Any]) -> Dict[str, Any]:
        try:
            template_id = data.get("template_id")
            template = db.session.get(Template, template_id)
            if not template:
                raise ValueError(f"Template {template_id} not found")
            if not template.schema_path:
                raise ValueError("Template has no schema_path")
            schema_path = Path(template.schema_path)
            if not schema_path.exists():
                raise ValueError(f"Schema file not found: {schema_path}")
            schema = json.loads(schema_path.read_text(encoding="utf-8"))
            updated = self._update_field_registry(
                template.id, schema.get("fields", [])
            )
            db.session.commit()
            return {
                "success": True,
                "template_id": template_id,
                "fields_updated": updated,
                "message": f"Field registry synced for template {template.name}",
            }
        except Exception as e:
            self.logger.error("Error syncing field registry: %s", e)
            return {"success": False, "error": str(e)}

    def _duplicate_template(self, data: Dict[str, Any]) -> Dict[str, Any]:
        try:
            source_id = data.get("source_id")
            new_name = data.get("new_name")
            source = db.session.get(Template, source_id)
            if not source:
                raise ValueError(f"Source template {source_id} not found")
            if not source.file_path:
                raise ValueError("Source template has no file_path")

            html_content = Path(source.file_path).read_text(encoding="utf-8")
            schema = {}
            if source.schema_path and Path(source.schema_path).exists():
                schema = json.loads(
                    Path(source.schema_path).read_text(encoding="utf-8")
                )
            style_content = ""
            style_file = Path(source.file_path).parent / "style.css"
            if style_file.is_file():
                style_content = style_file.read_text(encoding="utf-8")

            return self._create_template(
                {
                    "name": new_name or f"{source.name} (Copy)",
                    "type": source.type,
                    "description": f"Duplicate of {source.name}",
                    "html_content": html_content,
                    "schema": schema,
                    "style_content": style_content,
                    "is_active": source.is_active,
                }
            )
        except Exception as e:
            self.logger.error("Error duplicating template: %s", e)
            return {"success": False, "error": str(e)}

    def _register_fields(self, template_id: int, fields: List[Dict]) -> int:
        count = 0
        for field in fields:
            reg = FieldRegistry(
                template_id=template_id,
                field_key=field.get("key"),
                field_label=field.get("label"),
                field_type=field.get("type", "text"),
                validation_rules=field.get("validation_rules"),
                is_required=field.get("required", False),
                mapping_path=field.get("mapping_path"),
            )
            db.session.add(reg)
            count += 1
        return count

    def _update_field_registry(self, template_id: int, fields: List[Dict]) -> int:
        FieldRegistry.query.filter_by(template_id=template_id).delete()
        return self._register_fields(template_id, fields)

    def _sanitize_filename(self, name: str) -> str:
        s = re.sub(r"[^a-zA-Z0-9_-]", "-", (name or "").lower())
        return re.sub(r"-+", "-", s).strip("-") or "template"

    def _unique_slug(self, name: str) -> str:
        base = self._sanitize_filename(name)[:80]
        candidate = base
        n = 2
        while db.session.query(Template.id).filter_by(slug=candidate).first():
            candidate = f"{base}-{n}"
            n += 1
            if n > 10000:
                candidate = f"{base}-{uuid.uuid4().hex[:8]}"
                break
        return candidate
