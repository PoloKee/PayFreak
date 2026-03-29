import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import fitz
import pdfplumber

from config import TEMPLATE_GALLERY_DIR, UPLOAD_DIR

from ..utils.database import db
from ..models import FieldRegistry, Template, UploadedDocument
from ..services.template_service import TemplateService, build_jinja_env
from .base_agent import BaseAgent
from .types import Task

DOCUMENT_TYPE_TO_GALLERY_SLUG: Dict[str, str] = {
    "pay_stub": "pay-stub-standard",
    "bank_statement": "bank-statement-standard",
}


class PdfProcessorAgent(BaseAgent):
    """Process PDFs: extract text/tables, detect type, render HTML via templates."""

    def __init__(self, config: Optional[Dict[str, Any]] = None):
        super().__init__("pdf_processor", config)
        cfg = config or {}
        self.uploads_path = Path(cfg.get("uploads_path", str(UPLOAD_DIR)))
        self.supported_formats = cfg.get("supported_formats", ["pdf"])
        self.use_ml = cfg.get("use_ml", False)
        self.template_service = TemplateService(
            gallery_root=Path(cfg.get("template_gallery_path", TEMPLATE_GALLERY_DIR))
        )
        self.uploads_path.mkdir(parents=True, exist_ok=True)

    def execute_task(self, task: Task) -> Any:
        if task.task_type == "process_pdf":
            return self._process_pdf(task.data)
        if task.task_type == "batch_process":
            return self._batch_process(task.data)
        if task.task_type == "extract_text":
            return self._extract_text(task.data)
        if task.task_type == "extract_tables":
            return self._extract_tables(task.data)
        if task.task_type == "detect_type":
            return self._detect_type_task(task.data)
        raise ValueError(f"Unknown task type: {task.task_type}")

    def _process_pdf(self, data: Dict[str, Any]) -> Dict[str, Any]:
        file_path = data.get("file_path")
        document_type = data.get("document_type")
        template_id = data.get("template_id")

        if not file_path or not Path(file_path).exists():
            return {"success": False, "error": f"File not found: {file_path}"}

        upload = UploadedDocument(
            original_filename=Path(file_path).name,
            stored_path=str(Path(file_path).resolve()),
            status="processing",
        )
        db.session.add(upload)
        db.session.commit()

        try:
            extracted_data = self._extract_pdf_data(str(file_path))
            if not document_type:
                document_type = self._detect_document_type(extracted_data)
            if not template_id:
                best = self._get_best_template(document_type, extracted_data)
                if best:
                    template_id = best.id

            html_content = self._generate_html_from_data(
                extracted_data, document_type, template_id
            )
            output_path = self._save_generated_files(file_path, html_content, extracted_data)

            upload.document_type = document_type
            upload.processed_html_path = output_path["html_path"]
            upload.processed_json_path = output_path["json_path"]
            upload.extracted_data = extracted_data
            upload.status = "completed"
            db.session.commit()

            return {
                "success": True,
                "upload_id": upload.id,
                "document_type": document_type,
                "html_path": output_path["html_path"],
                "json_path": output_path["json_path"],
                "extracted_data": extracted_data,
            }
        except Exception as e:
            self.logger.exception("PDF processing failed")
            upload.status = "failed"
            upload.extracted_data = {"_error": str(e)}
            db.session.commit()
            return {"success": False, "error": str(e), "upload_id": upload.id}

    def _extract_pdf_data(self, file_path: str) -> Dict[str, Any]:
        extracted: Dict[str, Any] = {
            "text": "",
            "tables": [],
            "metadata": {},
            "fields": {},
        }
        with pdfplumber.open(file_path) as pdf:
            full_text: List[str] = []
            for page in pdf.pages:
                text = page.extract_text()
                if text:
                    full_text.append(text)
                for table in page.extract_tables() or []:
                    if table:
                        extracted["tables"].append(table)
            extracted["text"] = "\n".join(full_text)
            if pdf.metadata:
                extracted["metadata"] = dict(pdf.metadata)

        doc = fitz.open(file_path)
        try:
            extracted["page_count"] = len(doc)
        finally:
            doc.close()

        extracted["fields"] = self._extract_fields_from_text(extracted["text"])
        return extracted

    def _extract_fields_from_text(self, text: str) -> Dict[str, Any]:
        fields: Dict[str, Any] = {}
        patterns = {
            "employee_name": r"(?:Employee|Name)[:\s]+([A-Za-z\s]+)",
            "employee_id": r"(?:Employee ID|ID)[:\s]+([A-Za-z0-9-]+)",
            "pay_period_start": r"(?:Period|Pay Period)[:\s]+(\d{1,2}/\d{1,2}/\d{4})",
            "pay_period_end": r"-\s*(\d{1,2}/\d{1,2}/\d{4})",
            "pay_date": r"(?:Pay Date|Check Date)[:\s]+(\d{1,2}/\d{1,2}/\d{4})",
            "gross_pay": r"(?:Gross Pay|Gross)[:\s$]+([\d,]+\.?\d*)",
            "net_pay": r"(?:Net Pay|Net)[:\s$]+([\d,]+\.?\d*)",
            "hours": r"(?:Hours|Regular Hours)[:\s]+([\d,]+\.?\d*)",
            "rate": r"(?:Rate|Hourly Rate)[:\s$]+([\d,]+\.?\d*)",
        }
        for field, pattern in patterns.items():
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                fields[field] = match.group(1).strip()
        return fields

    def _detect_document_type(self, extracted_data: Dict[str, Any]) -> str:
        text = extracted_data.get("text", "").lower()
        pay_stub_indicators = [
            "pay stub",
            "paystub",
            "pay period",
            "gross pay",
            "net pay",
            "earnings",
            "deductions",
            "hours worked",
            "pay rate",
        ]
        bank_indicators = [
            "bank statement",
            "account statement",
            "statement period",
            "opening balance",
            "closing balance",
            "transaction",
            "account number",
            "deposit",
            "withdrawal",
        ]
        pay_stub_score = sum(1 for i in pay_stub_indicators if i in text)
        bank_score = sum(1 for i in bank_indicators if i in text)
        if pay_stub_score > bank_score:
            return "pay_stub"
        if bank_score > pay_stub_score:
            return "bank_statement"
        return "unknown"

    def _get_best_template(
        self, document_type: str, extracted_data: Dict[str, Any]
    ) -> Optional[Template]:
        templates = Template.query.filter_by(
            type=document_type, is_active=True
        ).all()
        if not templates:
            return None
        extracted_fields = set(extracted_data.get("fields", {}).keys())
        best_template: Optional[Template] = None
        best_match_count = 0
        for template in templates:
            fields = FieldRegistry.query.filter_by(template_id=template.id).all()
            template_fields = {f.field_key.split(".")[-1] for f in fields}
            match_count = len(extracted_fields & template_fields)
            if match_count > best_match_count:
                best_match_count = match_count
                best_template = template
        return best_template

    def _build_render_context(
        self,
        data: Dict[str, Any],
        document_type: str,
        generation_date: str,
    ) -> Dict[str, Any]:
        fields = data.get("fields") or {}
        if document_type == "pay_stub":
            gross = fields.get("gross_pay") or "0"
            net = fields.get("net_pay") or gross
            return {
                "employee": {
                    "name": fields.get("employee_name") or "Unknown",
                    "id": fields.get("employee_id") or "—",
                },
                "employer": {"name": "—", "address": None},
                "pay_date": fields.get("pay_date") or "—",
                "pay_period": {
                    "start": fields.get("pay_period_start") or "—",
                    "end": fields.get("pay_period_end") or "—",
                },
                "earnings": {"gross": gross},
                "deductions": {"federal_tax": 0, "state_tax": 0, "other": 0},
                "net_pay": net,
                "generation_date": generation_date,
                "document_type": document_type,
                "extracted_data": fields,
                "text_content": data.get("text", ""),
                "tables": data.get("tables", []),
                "metadata": data.get("metadata", {}),
            }
        if document_type == "bank_statement":
            return {
                "bank": {"name": "—"},
                "account": {"holder": "—", "number_masked": "—"},
                "period": {"start": "—", "end": "—"},
                "generated_at": generation_date,
                "transactions": [],
                "generation_date": generation_date,
                "document_type": document_type,
                "extracted_data": fields,
                "text_content": data.get("text", ""),
                "tables": data.get("tables", []),
                "metadata": data.get("metadata", {}),
            }
        return {
            "document_type": document_type,
            "extracted_data": fields,
            "text_content": data.get("text", ""),
            "tables": data.get("tables", []),
            "metadata": data.get("metadata", {}),
            "generation_date": generation_date,
        }

    def _generate_html_from_data(
        self,
        data: Dict[str, Any],
        document_type: str,
        template_id: Optional[int],
    ) -> str:
        generation_date = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        context = self._build_render_context(data, document_type, generation_date)
        env = build_jinja_env()

        template = Template.query.get(template_id) if template_id else None
        if template and template.file_path:
            tpl_path = Path(template.file_path)
            if tpl_path.is_file():
                html_template = tpl_path.read_text(encoding="utf-8")
                jinja_template = env.from_string(html_template)
                if template.slug:
                    inline_css = self.template_service.read_inline_css(template.slug)
                else:
                    css_path = tpl_path.parent / "style.css"
                    inline_css = (
                        css_path.read_text(encoding="utf-8")
                        if css_path.is_file()
                        else ""
                    )
                return jinja_template.render(**{**context, "inline_css": inline_css})

        slug = DOCUMENT_TYPE_TO_GALLERY_SLUG.get(document_type)
        if slug and self.template_service.folder_for_slug(slug).joinpath(
            "template.html"
        ).is_file():
            return self.template_service.render_html(slug, context)

        fallback = self._get_default_html_template(document_type)
        return env.from_string(fallback).render(**context)

    def _get_default_html_template(self, document_type: str) -> str:
        if document_type == "pay_stub":
            return """<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>Pay Stub</title>
<style>body{font-family:Arial;padding:40px}.field{margin:10px 0}.label{font-weight:bold}</style>
</head><body>
<h1>Pay Stub</h1>
<h3>Extracted Information</h3>
{% for key, value in extracted_data.items() %}
<div class="field"><span class="label">{{ key }}:</span> {{ value }}</div>
{% endfor %}
<hr/><p>Generated on {{ generation_date }}</p>
</body></html>"""
        if document_type == "bank_statement":
            return """<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>Bank Statement</title>
<style>body{font-family:Arial;padding:40px}.field{margin:10px 0}.label{font-weight:bold}</style>
</head><body>
<h1>Bank Statement</h1>
<h3>Extracted Information</h3>
{% for key, value in extracted_data.items() %}
<div class="field"><span class="label">{{ key }}:</span> {{ value }}</div>
{% endfor %}
<hr/><p>Generated on {{ generation_date }}</p>
</body></html>"""
        return """<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>Document</title></head><body>
<h1>Document</h1>
<pre style="white-space:pre-wrap">{{ text_content[:12000] }}</pre>
<p>Generated on {{ generation_date }}</p>
</body></html>"""

    def _save_generated_files(
        self, source_path: str, html_content: str, data: Dict[str, Any]
    ) -> Dict[str, str]:
        base_name = Path(source_path).stem
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_dir = self.uploads_path / timestamp
        output_dir.mkdir(parents=True, exist_ok=True)
        html_path = output_dir / f"{base_name}.html"
        json_path = output_dir / f"{base_name}.json"
        html_path.write_text(html_content, encoding="utf-8")
        json_path.write_text(json.dumps(data, indent=2, default=str), encoding="utf-8")
        return {"html_path": str(html_path.resolve()), "json_path": str(json_path.resolve())}

    def _batch_process(self, data: Dict[str, Any]) -> Dict[str, Any]:
        file_paths = data.get("file_paths", [])
        results = []
        for path in file_paths:
            results.append(
                self._process_pdf(
                    {
                        "file_path": path,
                        "document_type": data.get("document_type"),
                        "template_id": data.get("template_id"),
                    }
                )
            )
        return {
            "total": len(results),
            "successful": sum(1 for r in results if r.get("success")),
            "failed": sum(1 for r in results if not r.get("success")),
            "results": results,
        }

    def _extract_text(self, data: Dict[str, Any]) -> Dict[str, Any]:
        file_path = data.get("file_path")
        if not file_path or not Path(file_path).exists():
            raise ValueError(f"File not found: {file_path}")
        text: List[str] = []
        page_count = 0
        with pdfplumber.open(file_path) as pdf:
            page_count = len(pdf.pages)
            for page in pdf.pages:
                page_text = page.extract_text()
                if page_text:
                    text.append(page_text)
        return {"success": True, "text": "\n".join(text), "page_count": page_count}

    def _extract_tables(self, data: Dict[str, Any]) -> Dict[str, Any]:
        file_path = data.get("file_path")
        if not file_path or not Path(file_path).exists():
            raise ValueError(f"File not found: {file_path}")
        all_tables: List[Dict[str, Any]] = []
        with pdfplumber.open(file_path) as pdf:
            for page_num, page in enumerate(pdf.pages):
                for table in page.extract_tables() or []:
                    if table:
                        all_tables.append({"page": page_num + 1, "data": table})
        return {"success": True, "tables": all_tables, "table_count": len(all_tables)}

    def _detect_type_task(self, data: Dict[str, Any]) -> Dict[str, Any]:
        file_path = data.get("file_path")
        if not file_path or not Path(file_path).exists():
            raise ValueError(f"File not found: {file_path}")
        extracted = self._extract_pdf_data(str(file_path))
        return {
            "success": True,
            "document_type": self._detect_document_type(extracted),
            "preview_fields": extracted.get("fields", {}),
        }
