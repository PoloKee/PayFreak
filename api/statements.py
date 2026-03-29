from datetime import date
from decimal import Decimal
from typing import Any, List

from flask import Blueprint, abort, jsonify, request, send_file
from flask_jwt_extended import jwt_required

from config import ROOT

from ..models import BankStatement, Employee, Template
from ..services.bank_statement_service import BankStatementService
from ..utils.database import db
from .auth_utils import current_role, current_user_id

statements_bp = Blueprint("statements", __name__)


def _can_access_statement(row: BankStatement) -> bool:
    role = current_role()
    if role in ("admin", "employer"):
        return True
    if row.employee_id is None:
        return role == "admin"
    emp = db.session.get(Employee, row.employee_id)
    return emp is not None and emp.user_id == current_user_id()


def _stmt_dict(s: BankStatement) -> dict:
    return {
        "id": s.id,
        "employee_id": s.employee_id,
        "template_id": s.template_id,
        "account_number": s.account_number,
        "statement_start": s.statement_start.isoformat() if s.statement_start else None,
        "statement_end": s.statement_end.isoformat() if s.statement_end else None,
        "opening_balance": float(s.opening_balance) if s.opening_balance is not None else None,
        "closing_balance": float(s.closing_balance) if s.closing_balance is not None else None,
        "html_path": s.html_path,
        "json_path": s.json_path,
        "pdf_path": s.pdf_path,
    }


@statements_bp.get("/")
@jwt_required()
def list_statements():
    q = BankStatement.query
    role = current_role()
    uid = current_user_id()
    if role not in ("admin", "employer"):
        emp_ids = [e.id for e in Employee.query.filter_by(user_id=uid).all()]
        if not emp_ids:
            return jsonify({"statements": []})
        q = q.filter(BankStatement.employee_id.in_(emp_ids))
    rows = q.order_by(BankStatement.created_at.desc()).limit(200).all()
    return jsonify({"statements": [_stmt_dict(s) for s in rows]})


@statements_bp.post("/generate")
@jwt_required()
def generate_statement():
    data = request.get_json(silent=True) or {}
    template_slug = (data.get("template_slug") or "bank-statement-standard").strip()
    tpl_row = Template.query.filter_by(slug=template_slug, is_active=True).first()
    if tpl_row is None:
        return jsonify({"error": "Template not found"}), 404

    employee_id = data.get("employee_id")
    emp = None
    if employee_id is not None:
        emp = db.session.get(Employee, int(employee_id))
        if emp is None:
            return jsonify({"error": "Employee not found"}), 404
        if current_role() not in ("admin", "employer") and emp.user_id != current_user_id():
            return jsonify({"error": "Forbidden"}), 403

    transactions: List[dict[str, Any]] = data.get("transactions") or []
    period_start = str(data.get("period_start") or "2000-01-01")[:10]
    period_end = str(data.get("period_end") or "2000-01-31")[:10]
    svc = BankStatementService()
    ctx = svc.build_context(
        holder=data.get("holder") or (emp and f"{emp.first_name} {emp.last_name}") or "Account holder",
        account_masked=data.get("account_number") or "****",
        bank_name=data.get("bank_name") or "Bank",
        period_start=period_start,
        period_end=period_end,
        opening=float(data.get("opening_balance", 0)),
        closing=float(data.get("closing_balance", 0)),
        transactions=transactions,
    )

    row = BankStatement(
        employee_id=emp.id if emp else None,
        template_id=tpl_row.id,
        account_number=data.get("account_number"),
        statement_start=date.fromisoformat(period_start),
        statement_end=date.fromisoformat(period_end),
        opening_balance=Decimal(str(ctx["balances"]["opening"])),
        closing_balance=Decimal(str(ctx["balances"]["closing"])),
        transactions=transactions,
        data=ctx,
    )
    db.session.add(row)
    db.session.flush()
    paths = svc.generate_files(row.id, template_slug, ctx)
    row.html_path = paths.get("html_path")
    row.json_path = paths.get("json_path")
    row.pdf_path = paths.get("pdf_path")
    db.session.commit()
    return jsonify({"statement": _stmt_dict(row), "paths": paths})


@statements_bp.get("/<int:statement_id>")
@jwt_required()
def get_statement(statement_id: int):
    s = db.session.get(BankStatement, statement_id)
    if s is None:
        return jsonify({"error": "Not found"}), 404
    if not _can_access_statement(s):
        return jsonify({"error": "Forbidden"}), 403
    out = _stmt_dict(s)
    if s.data:
        out["data"] = s.data
    return jsonify(out)


def _statement_download_response(statement_id: int, fmt: str):
    fmt = (fmt or "html").lower()
    s = db.session.get(BankStatement, statement_id)
    if s is None:
        return jsonify({"error": "Not found"}), 404
    if not _can_access_statement(s):
        return jsonify({"error": "Forbidden"}), 403
    rel = s.html_path if fmt == "html" else s.json_path
    if fmt == "pdf":
        rel = s.pdf_path
    if not rel:
        return jsonify({"error": "File not available"}), 404
    full = (ROOT / rel).resolve()
    try:
        full.relative_to(ROOT.resolve())
    except ValueError:
        abort(400)
    if not full.is_file():
        return jsonify({"error": "Missing file on disk"}), 404
    return send_file(full, as_attachment=True)


@statements_bp.get("/<int:statement_id>/download")
@jwt_required()
def download_statement(statement_id: int):
    return _statement_download_response(statement_id, request.args.get("format") or "html")


@statements_bp.get("/<int:statement_id>/download/<string:fmt>")
@jwt_required()
def download_statement_format(statement_id: int, fmt: str):
    return _statement_download_response(statement_id, fmt)
