from datetime import date, datetime
from decimal import Decimal
from pathlib import Path

from flask import Blueprint, abort, current_app, jsonify, request, send_file
from flask_jwt_extended import jwt_required

from config import OUTPUT_PDF_DIR, ROOT

from ..models import Employee, GenerationHistory, PayStub, Template
from ..services.audit_service import record_audit
from ..services.paystub_service import PaystubService, paystub_profiles_from_employee
from ..utils.database import db
from .auth_utils import current_role, current_user_id, roles_required

paystubs_bp = Blueprint("paystubs", __name__)


def _can_access_stub(stub: PayStub) -> bool:
    role = current_role()
    if role in ("admin", "employer"):
        return True
    emp = db.session.get(Employee, stub.employee_id)
    return emp is not None and emp.user_id == current_user_id()


def _stub_dict(s: PayStub) -> dict:
    return {
        "id": s.id,
        "employee_id": s.employee_id,
        "template_id": s.template_id,
        "pay_period_start": s.pay_period_start.isoformat() if s.pay_period_start else None,
        "pay_period_end": s.pay_period_end.isoformat() if s.pay_period_end else None,
        "pay_date": s.pay_date.isoformat() if s.pay_date else None,
        "gross_pay": float(s.gross_pay) if s.gross_pay is not None else None,
        "net_pay": float(s.net_pay) if s.net_pay is not None else None,
        "html_path": s.html_path,
        "json_path": s.json_path,
        "pdf_path": s.pdf_path,
    }


@paystubs_bp.get("/")
@jwt_required()
def list_paystubs():
    q = PayStub.query
    role = current_role()
    uid = current_user_id()
    if role not in ("admin", "employer"):
        emp_ids = [e.id for e in Employee.query.filter_by(user_id=uid).all()]
        if not emp_ids:
            return jsonify({"paystubs": []})
        q = q.filter(PayStub.employee_id.in_(emp_ids))
    rows = q.order_by(PayStub.created_at.desc()).limit(200).all()
    return jsonify({"paystubs": [_stub_dict(s) for s in rows]})


@paystubs_bp.post("/generate")
@jwt_required()
def generate_paystub():
    data = request.get_json(silent=True) or {}
    employee_id = data.get("employee_id")
    template_slug = (data.get("template_slug") or "pay-stub-standard").strip()
    if not employee_id:
        return jsonify({"error": "employee_id required"}), 400
    emp = db.session.get(Employee, int(employee_id))
    if emp is None:
        return jsonify({"error": "Employee not found"}), 404
    if current_role() not in ("admin", "employer") and emp.user_id != current_user_id():
        return jsonify({"error": "Forbidden"}), 403
    tpl_row = Template.query.filter_by(slug=template_slug, is_active=True).first()
    if tpl_row is None:
        return jsonify({"error": "Template not found"}), 404

    pay_start = data.get("pay_period_start") or "2000-01-01"
    pay_end = data.get("pay_period_end") or "2000-01-14"
    pay_date = data.get("pay_date") or pay_end
    gross = float(data.get("gross_pay", 0))

    pay_data = data.get("pay_data")
    if not isinstance(pay_data, dict):
        pay_data = {}
    if "gross_pay" not in pay_data and gross:
        pay_data = {**pay_data, "gross_pay": gross}
    if "pay_period_start" not in pay_data:
        pay_data = {**pay_data, "pay_period_start": pay_start}
    if "pay_period_end" not in pay_data:
        pay_data = {**pay_data, "pay_period_end": pay_end}
    if "pay_date" not in pay_data:
        pay_data = {**pay_data, "pay_date": pay_date}

    emp_prof, er_prof, employer_name, employer_addr = paystub_profiles_from_employee(emp)
    if not employer_name:
        employer_name = "Employer"

    svc = PaystubService()
    stub = PayStub(
        employee_id=emp.id,
        template_id=tpl_row.id,
        pay_period_start=date.fromisoformat(str(pay_start)[:10]),
        pay_period_end=date.fromisoformat(str(pay_end)[:10]),
        pay_date=date.fromisoformat(str(pay_date)[:10]),
        gross_pay=Decimal("0"),
        net_pay=Decimal("0"),
        deductions={},
        data={},
    )
    db.session.add(stub)
    db.session.flush()

    ctx = svc.build_context(
        employee_name=emp_prof["name"],
        employee_code=emp_prof["employee_id"],
        employer_name=employer_name,
        employer_address=employer_addr,
        pay_period_start=str(pay_start)[:10],
        pay_period_end=str(pay_end)[:10],
        pay_date=str(pay_date)[:10],
        gross_pay=gross,
        federal_tax=data.get("federal_tax"),
        state_tax=data.get("state_tax"),
        other_deductions=float(data.get("other_deductions", 0)),
        pay_data=pay_data,
        employee_profile=emp_prof,
        employer_profile=er_prof,
        stub_id=stub.id,
    )
    stub.gross_pay = Decimal(str(ctx["earnings"]["gross"]))
    stub.net_pay = Decimal(str(ctx["net_pay"]))
    stub.deductions = ctx["deductions"]
    stub.data = ctx
    paths = svc.generate_files(stub.id, template_slug, ctx)
    stub.html_path = paths.get("html_path")
    stub.json_path = paths.get("json_path")
    stub.pdf_path = paths.get("pdf_path")
    now = datetime.utcnow()
    db.session.add(
        GenerationHistory(
            user_id=current_user_id(),
            document_type="pay_stub",
            template_id=tpl_row.id,
            employee_ids=[emp.id],
            generation_params={
                "template_slug": template_slug,
                "pay_period_start": str(pay_start)[:10],
                "pay_period_end": str(pay_end)[:10],
                "pay_date": str(pay_date)[:10],
                "gross_pay": gross,
            },
            documents_generated=1,
            status="completed",
            started_at=now,
            completed_at=now,
        )
    )
    db.session.commit()
    try:
        from ..services.email_service import schedule_paystub_notification

        schedule_paystub_notification(current_app._get_current_object(), stub.id)
    except Exception:
        current_app.logger.exception("Pay stub email notification hook failed")
    return jsonify({"paystub": _stub_dict(stub), "paths": paths})


def _stub_storage_path(rel: str | None) -> Path | None:
    if not rel:
        return None
    p = Path(rel)
    return p.resolve() if p.is_absolute() else (ROOT / p).resolve()


def _stub_path_allowed(full: Path) -> bool:
    root = ROOT.resolve()
    try:
        full.relative_to(root)
        return True
    except ValueError:
        pass
    try:
        full.relative_to(OUTPUT_PDF_DIR.resolve())
        return True
    except ValueError:
        return False


def _unlink_stub_files(stub: PayStub) -> None:
    for rel in (stub.html_path, stub.json_path, stub.pdf_path):
        full = _stub_storage_path(rel)
        if full is None or not full.is_file() or not _stub_path_allowed(full):
            continue
        try:
            full.unlink()
        except OSError:
            pass


@paystubs_bp.delete("/<int:stub_id>")
@roles_required("admin")
def delete_paystub(stub_id: int):
    s = db.session.get(PayStub, stub_id)
    if s is None:
        return jsonify({"error": "Not found"}), 404
    record_audit(
        user_id=current_user_id(),
        action="paystub.delete",
        entity_type="pay_stub",
        entity_id=s.id,
        old_data={
            "employee_id": s.employee_id,
            "template_id": s.template_id,
        },
    )
    _unlink_stub_files(s)
    db.session.delete(s)
    db.session.commit()
    return jsonify({"status": "deleted"})


@paystubs_bp.get("/<int:stub_id>")
@jwt_required()
def get_paystub(stub_id: int):
    s = db.session.get(PayStub, stub_id)
    if s is None:
        return jsonify({"error": "Not found"}), 404
    if not _can_access_stub(s):
        return jsonify({"error": "Forbidden"}), 403
    out = _stub_dict(s)
    if s.data:
        out["data"] = s.data
    return jsonify(out)


def _paystub_download_response(stub_id: int, fmt: str):
    fmt = (fmt or "html").lower()
    s = db.session.get(PayStub, stub_id)
    if s is None:
        return jsonify({"error": "Not found"}), 404
    if not _can_access_stub(s):
        return jsonify({"error": "Forbidden"}), 403
    rel = s.html_path if fmt == "html" else s.json_path
    if fmt == "pdf":
        rel = s.pdf_path
    if not rel:
        return jsonify({"error": "File not available"}), 404
    full = _stub_storage_path(rel)
    if full is None or not _stub_path_allowed(full):
        abort(400)
    if not full.is_file():
        return jsonify({"error": "Missing file on disk"}), 404
    return send_file(full, as_attachment=True)


@paystubs_bp.get("/<int:stub_id>/download")
@jwt_required()
def download_paystub(stub_id: int):
    return _paystub_download_response(stub_id, request.args.get("format") or "html")


@paystubs_bp.get("/<int:stub_id>/download/<string:fmt>")
@jwt_required()
def download_paystub_format(stub_id: int, fmt: str):
    return _paystub_download_response(stub_id, fmt)
