from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required

from ..models import Employee, Employer, SystemSetting
from ..utils.database import db
from .auth_utils import roles_required

employers_bp = Blueprint("employers", __name__)


def _employer_dict(e: Employer) -> dict:
    return {
        "id": e.id,
        "company_name": e.company_name,
        "address": e.address,
        "city": e.city,
        "state": e.state,
        "zip_code": e.zip_code,
        "tax_id": e.tax_id,
        "phone": e.phone,
        "email": e.email,
        "logo_path": e.logo_path,
    }


@employers_bp.get("/")
@jwt_required()
@roles_required("admin", "employer")
def list_employers():
    rows = Employer.query.order_by(Employer.company_name).all()
    return jsonify({"employers": [_employer_dict(e) for e in rows]})


@employers_bp.get("/default")
@jwt_required()
@roles_required("admin", "employer")
def get_default_employer():
    """Employer id from ``system_settings.default_employer_id`` (admin-managed)."""
    row = SystemSetting.query.filter_by(setting_key="default_employer_id").first()
    if not row or not (row.setting_value or "").strip():
        return jsonify({"employer": None})
    try:
        eid = int(str(row.setting_value).strip())
    except ValueError:
        return jsonify({"employer": None})
    e = db.session.get(Employer, eid)
    if e is None:
        return jsonify({"employer": None})
    return jsonify({"employer": _employer_dict(e)})


@employers_bp.post("/")
@roles_required("admin", "employer")
def create_employer():
    data = request.get_json(silent=True) or {}
    name = (data.get("company_name") or data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "company_name required"}), 400
    er = Employer(
        company_name=name,
        address=data.get("address"),
        city=data.get("city"),
        state=data.get("state"),
        zip_code=data.get("zip_code"),
        tax_id=data.get("tax_id"),
        phone=data.get("phone"),
        email=data.get("email"),
        logo_path=data.get("logo_path"),
    )
    db.session.add(er)
    db.session.commit()
    return jsonify(_employer_dict(er)), 201


@employers_bp.get("/<int:employer_pk>")
@jwt_required()
@roles_required("admin", "employer")
def get_employer(employer_pk: int):
    e = db.session.get(Employer, employer_pk)
    if e is None:
        return jsonify({"error": "Not found"}), 404
    return jsonify(_employer_dict(e))


@employers_bp.put("/<int:employer_pk>")
@roles_required("admin", "employer")
def update_employer(employer_pk: int):
    e = db.session.get(Employer, employer_pk)
    if e is None:
        return jsonify({"error": "Not found"}), 404
    data = request.get_json(silent=True) or {}
    if "company_name" in data:
        name = str(data["company_name"] or "").strip()
        if not name:
            return jsonify({"error": "company_name cannot be empty"}), 400
        e.company_name = name
    for key in (
        "address",
        "city",
        "state",
        "zip_code",
        "tax_id",
        "phone",
        "email",
        "logo_path",
    ):
        if key in data:
            setattr(e, key, data[key])
    db.session.commit()
    return jsonify(_employer_dict(e))


@employers_bp.delete("/<int:employer_pk>")
@roles_required("admin")
def delete_employer(employer_pk: int):
    e = db.session.get(Employer, employer_pk)
    if e is None:
        return jsonify({"error": "Not found"}), 404
    if Employee.query.filter_by(employer_id=employer_pk).first():
        return (
            jsonify(
                {
                    "error": "Cannot delete employer while employees reference it; reassign or remove employees first.",
                }
            ),
            409,
        )
    db.session.delete(e)
    db.session.commit()
    return jsonify({"status": "deleted"})
