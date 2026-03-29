from pathlib import Path

from flask import Blueprint, current_app, jsonify, request
from flask_jwt_extended import jwt_required
from werkzeug.utils import secure_filename

from config import ROOT

from ..models import UploadedDocument
from ..services.pdf_processor import PDFProcessor
from ..utils.database import db
from .auth_utils import roles_required

process_bp = Blueprint("process", __name__)


@process_bp.post("/pdf")
@jwt_required()
def upload_pdf():
    if "file" not in request.files:
        return jsonify({"error": "file required"}), 400
    f = request.files["file"]
    if not f.filename:
        return jsonify({"error": "empty filename"}), 400
    name = secure_filename(f.filename)
    upload_dir = Path(current_app.config["UPLOADS_PATH"])
    upload_dir.mkdir(parents=True, exist_ok=True)
    dest = upload_dir / name
    f.save(dest)
    try:
        rel = str(dest.resolve().relative_to(ROOT.resolve()))
    except ValueError:
        rel = str(dest)
    doc = UploadedDocument(
        original_filename=f.filename,
        stored_path=rel,
        document_type=request.form.get("document_type"),
        status="pending",
    )
    db.session.add(doc)
    db.session.flush()
    proc = PDFProcessor()
    result = proc.process(dest, document_type=doc.document_type, basename=f"doc_{doc.id}")
    doc.extracted_data = result
    doc.status = "completed" if "error" not in result else "failed"
    if result.get("html_path"):
        doc.processed_html_path = result["html_path"]
    if result.get("json_path"):
        doc.processed_json_path = result["json_path"]
    if result.get("document_type"):
        doc.document_type = result["document_type"]
    db.session.commit()
    return jsonify({"id": doc.id, "status": doc.status, "stored_path": rel, "result": result}), 201


@process_bp.post("/pdf/<int:doc_id>/run")
@jwt_required()
def run_pdf_process(doc_id: int):
    doc = db.session.get(UploadedDocument, doc_id)
    if doc is None:
        return jsonify({"error": "Not found"}), 404
    path = ROOT / doc.stored_path
    if not path.is_file():
        doc.status = "error"
        db.session.commit()
        return jsonify({"error": "file missing"}), 400
    proc = PDFProcessor()
    result = proc.process(path, document_type=doc.document_type, basename=f"doc_{doc_id}")
    doc.extracted_data = result
    doc.status = "completed" if "error" not in result else "failed"
    if result.get("html_path"):
        doc.processed_html_path = result["html_path"]
    if result.get("json_path"):
        doc.processed_json_path = result["json_path"]
    if result.get("document_type"):
        doc.document_type = result["document_type"]
    db.session.commit()
    return jsonify({"id": doc.id, "status": doc.status, "result": result})


@process_bp.get("/status/<int:doc_id>")
@jwt_required()
def process_status(doc_id: int):
    doc = db.session.get(UploadedDocument, doc_id)
    if doc is None:
        return jsonify({"error": "Not found"}), 404
    return jsonify(
        {
            "id": doc.id,
            "status": doc.status,
            "document_type": doc.document_type,
            "extracted_data": doc.extracted_data,
            "processed_html_path": doc.processed_html_path,
            "processed_json_path": doc.processed_json_path,
        }
    )


@process_bp.post("/reindex-templates")
@roles_required("admin")
def reindex_templates():
    """Optional: batch-register gallery templates into DB + field_registry."""
    from ..services.template_sync import reindex_gallery_templates

    added = reindex_gallery_templates()
    return jsonify({"registered_templates": added})
