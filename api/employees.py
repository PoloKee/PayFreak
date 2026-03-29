from datetime import date

from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required

from ..models import Employee
from ..utils.database import db
from .auth_utils import current_role, current_user_id, roles_required

employees_bp = Blueprint("employees", __name__)


def _employee_dict(e: Employee) -> dict:
    return {
        "id": e.id,
        "user_id": e.user_id,
        "employee_id": e.employee_id,
        "first_name": e.first_name,
        "last_name": e.last_name,
        "email": e.email,
        "phone": e.phone,
        "hire_date": e.hire_date.isoformat() if e.hire_date else None,
        "pay_rate": float(e.pay_rate) if e.pay_rate is not None else None,
        "pay_frequency": e.pay_frequency,
        "employment_status": e.employment_status,
        "employer_id": e.employer_id,
        "address_line1": e.address_line1,
        "address_line2": e.address_line2,
        "city": e.city,
        "state": e.state,
        "zip_code": e.zip_code,
        "ssn_last4": e.ssn_last4,
        "banking_notes": e.banking_notes,
    }


def _can_view_employee(e: Employee) -> bool:
    role = current_role()
    uid = current_user_id()
    if role in ("admin", "employer"):
        return True
    return e.user_id is not None and e.user_id == uid


@employees_bp.get("/")
@jwt_required()
def list_employees():
    role = current_role()
    uid = current_user_id()
    if role in ("admin", "employer"):
        rows = Employee.query.order_by(Employee.id).all()
    else:
        rows = Employee.query.filter_by(user_id=uid).all()
    return jsonify({"employees": [_employee_dict(e) for e in rows]})


@employees_bp.post("/")
@roles_required("admin", "employer")
def create_employee():
    data = request.get_json(silent=True) or {}
    code = (data.get("employee_id") or "").strip()
    if not code:
        return jsonify({"error": "employee_id required"}), 400
    if Employee.query.filter_by(employee_id=code).first():
        return jsonify({"error": "employee_id already exists"}), 409
    raw_ssn = data.get("ssn_last4") or data.get("ssn")
    ssn_last4 = None
    if raw_ssn:
        digits = "".join(c for c in str(raw_ssn) if c.isdigit())
        if digits:
            ssn_last4 = digits[-4:]
    emp = Employee(
        user_id=data.get("user_id"),
        employee_id=code,
        first_name=data.get("first_name"),
        last_name=data.get("last_name"),
        email=data.get("email"),
        phone=data.get("phone"),
        employer_id=data.get("employer_id"),
        pay_frequency=data.get("pay_frequency"),
        employment_status=data.get("employment_status", "active"),
        pay_rate=data.get("pay_rate"),
        address_line1=data.get("address_line1"),
        address_line2=data.get("address_line2"),
        city=data.get("city"),
        state=data.get("state"),
        zip_code=data.get("zip_code"),
        ssn_last4=ssn_last4,
        banking_notes=data.get("banking_notes"),
    )
    hd = data.get("hire_date")
    if hd:
        emp.hire_date = date.fromisoformat(str(hd)[:10])
    db.session.add(emp)
    db.session.commit()
    return jsonify(_employee_dict(emp)), 201


@employees_bp.get("/<int:employee_pk>")
@jwt_required()
def get_employee(employee_pk: int):
    e = db.session.get(Employee, employee_pk)
    if e is None:
        return jsonify({"error": "Not found"}), 404
    if not _can_view_employee(e):
        return jsonify({"error": "Forbidden"}), 403
    return jsonify(_employee_dict(e))


@employees_bp.put("/<int:employee_pk>")
@jwt_required()
def update_employee(employee_pk: int):
    e = db.session.get(Employee, employee_pk)
    if e is None:
        return jsonify({"error": "Not found"}), 404
    role = current_role()
    if role not in ("admin", "employer") and e.user_id != current_user_id():
        return jsonify({"error": "Forbidden"}), 403
    data = request.get_json(silent=True) or {}
    for key in (
        "first_name",
        "last_name",
        "email",
        "phone",
        "pay_frequency",
        "employment_status",
        "employer_id",
        "address_line1",
        "address_line2",
        "city",
        "state",
        "zip_code",
        "banking_notes",
    ):
        if key in data:
            setattr(e, key, data[key])
    if "pay_rate" in data:
        e.pay_rate = data["pay_rate"]
    raw_ssn = data.get("ssn_last4")
    if raw_ssn is not None or "ssn" in data:
        src = raw_ssn if raw_ssn is not None else data.get("ssn")
        if src in ("", None):
            e.ssn_last4 = None
        else:
            digits = "".join(c for c in str(src) if c.isdigit())
            e.ssn_last4 = digits[-4:] if digits else None
    if "hire_date" in data:
        hd = data["hire_date"]
        e.hire_date = date.fromisoformat(str(hd)[:10]) if hd else None
    if "user_id" in data and role in ("admin", "employer"):
        e.user_id = data["user_id"]
    db.session.commit()
    return jsonify(_employee_dict(e))


@employees_bp.delete("/<int:employee_pk>")
@roles_required("admin")
def delete_employee(employee_pk: int):
    e = db.session.get(Employee, employee_pk)
    if e is None:
        return jsonify({"error": "Not found"}), 404
    db.session.delete(e)
    db.session.commit()
    return jsonify({"status": "deleted"})
