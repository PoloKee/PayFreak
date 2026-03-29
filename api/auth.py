from flask import Blueprint, current_app, jsonify, request
from flask_jwt_extended import (
    create_access_token,
    create_refresh_token,
    get_jwt_identity,
    jwt_required,
)
from sqlalchemy.exc import IntegrityError

from ..extensions import limiter
from ..models import Employee, User
from ..utils.database import db
from ..utils.password_reset_token import (
    BadSignature,
    SignatureExpired,
    load_password_reset_token,
    make_password_reset_token,
)
from ..utils.security import hash_password, verify_password
from .auth_utils import current_user

auth_bp = Blueprint("auth", __name__)

_MIN_PASSWORD_LEN = 6


def _validate_new_password(password: str) -> tuple[bool, str | None]:
    if not password or len(password) < _MIN_PASSWORD_LEN:
        return False, f"Password must be at least {_MIN_PASSWORD_LEN} characters"
    pw_bytes = password.encode("utf-8")
    if len(pw_bytes) > 72:
        return False, "Password must be at most 72 bytes (bcrypt limit)"
    return True, None


@auth_bp.post("/login")
@limiter.limit("12 per minute")
def login():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    user = User.query.filter_by(email=email).first()
    if not user or not verify_password(password, user.password_hash):
        return jsonify({"error": "Invalid credentials"}), 401
    access = create_access_token(
        identity=str(user.id),
        additional_claims={"role": user.role},
    )
    refresh = create_refresh_token(identity=str(user.id))
    return jsonify(
        {
            "access_token": access,
            "refresh_token": refresh,
            "user": {"id": user.id, "email": user.email, "role": user.role},
        }
    )


@auth_bp.post("/register")
def register():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    role = data.get("role") or "employee"
    if role not in ("employee", "admin", "employer"):
        role = "employee"
    if not email or not password:
        return jsonify({"error": "email and password required"}), 400
    pw_bytes = password.encode("utf-8")
    if len(pw_bytes) > 72:
        return jsonify(
            {"error": "Password must be at most 72 bytes (bcrypt limit); use a shorter password."}
        ), 400
    if User.query.filter_by(email=email).first():
        return jsonify({"error": "Email already registered"}), 409
    try:
        hashed = hash_password(password)
    except (ValueError, TypeError) as ex:
        return jsonify({"error": f"Could not hash password: {ex}"}), 400
    user = User(email=email, password_hash=hashed, role=role)
    db.session.add(user)
    db.session.flush()

    if role == "employee":
        addr1 = (data.get("address_line1") or data.get("address") or "").strip() or None
        eid_raw = (data.get("employee_id") or "").strip()
        eid = eid_raw or f"U{user.id}"
        if Employee.query.filter_by(employee_id=eid).first():
            db.session.rollback()
            return jsonify({"error": "employee_id already exists"}), 409
        emp = Employee(
            user_id=user.id,
            employee_id=eid,
            first_name=(data.get("first_name") or "").strip() or None,
            last_name=(data.get("last_name") or "").strip() or None,
            email=email,
            phone=(data.get("phone") or "").strip() or None,
            address_line1=addr1,
            city=(data.get("city") or "").strip() or None,
            state=(data.get("state") or "").strip() or None,
            zip_code=(data.get("zip_code") or "").strip() or None,
        )
        db.session.add(emp)

    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return jsonify({"error": "Could not create profile"}), 409

    try:
        from ..services.email_service import schedule_welcome_email

        schedule_welcome_email(current_app._get_current_object(), user.id, None)
    except Exception:
        current_app.logger.exception("Welcome email hook failed")

    access = create_access_token(
        identity=str(user.id),
        additional_claims={"role": user.role},
    )
    refresh = create_refresh_token(identity=str(user.id))
    return (
        jsonify(
            {
                "access_token": access,
                "refresh_token": refresh,
                "user": {"id": user.id, "email": user.email, "role": user.role},
            }
        ),
        201,
    )


@auth_bp.post("/logout")
def logout():
    return jsonify({"status": "logged_out"})


@auth_bp.post("/refresh")
@jwt_required(refresh=True)
def refresh_token():
    raw = get_jwt_identity()
    if isinstance(raw, dict):
        raw = raw.get("user_id") or raw.get("sub")
    try:
        uid = int(raw)
    except (TypeError, ValueError):
        return jsonify({"error": "Invalid token"}), 401
    user = db.session.get(User, uid)
    if user is None:
        return jsonify({"error": "User not found"}), 401
    access = create_access_token(
        identity=str(user.id),
        additional_claims={"role": user.role},
    )
    return jsonify({"access_token": access})


@auth_bp.post("/change-password")
@jwt_required()
def change_password():
    u = current_user()
    if u is None:
        return jsonify({"error": "Unauthorized"}), 401
    data = request.get_json(silent=True) or {}
    old_pw = data.get("old_password") or data.get("current_password")
    new_pw = data.get("new_password") or data.get("password")
    if not old_pw or not new_pw:
        return jsonify({"error": "old_password and new_password required"}), 400
    if not verify_password(str(old_pw), u.password_hash):
        return jsonify({"error": "Current password is incorrect"}), 400
    ok, err = _validate_new_password(str(new_pw))
    if not ok:
        return jsonify({"error": err}), 400
    u.password_hash = hash_password(str(new_pw))
    db.session.commit()
    return jsonify({"status": "updated"})


@auth_bp.post("/change-email")
@jwt_required()
def change_email():
    u = current_user()
    if u is None:
        return jsonify({"error": "Unauthorized"}), 401
    data = request.get_json(silent=True) or {}
    current_pw = data.get("current_password") or data.get("password")
    new_email = (data.get("new_email") or data.get("email") or "").strip().lower()
    if not current_pw or not new_email:
        return jsonify({"error": "current_password and new_email required"}), 400
    if not verify_password(str(current_pw), u.password_hash):
        return jsonify({"error": "Current password is incorrect"}), 400
    if new_email == (u.email or "").strip().lower():
        return jsonify({"error": "That is already your sign-in email"}), 400
    if User.query.filter(User.email == new_email, User.id != u.id).first():
        return jsonify({"error": "That email is already in use"}), 409
    u.email = new_email
    emp = Employee.query.filter_by(user_id=u.id).first()
    if emp is not None:
        emp.email = new_email
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return jsonify({"error": "Could not update email"}), 409
    return jsonify({"status": "updated", "email": u.email})


@auth_bp.post("/forgot-password")
@limiter.limit("5 per hour")
def forgot_password():
    """Always returns 200 with status ok to avoid email enumeration."""
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    if not email:
        return jsonify({"status": "ok"}), 200
    user = User.query.filter_by(email=email).first()
    out: dict = {"status": "ok", "message": "If an account exists for that email, you will receive reset instructions."}
    if user is None:
        return jsonify(out), 200

    token = make_password_reset_token(current_app._get_current_object(), user.id)
    base = (current_app.config.get("APP_PUBLIC_URL") or "http://localhost:3000").rstrip("/")
    reset_link = f"{base}/reset-password?token={token}"

    try:
        from ..services.email_service import schedule_password_reset_email, smtp_credentials_ok

        app_obj = current_app._get_current_object()
        if smtp_credentials_ok(app_obj) or app_obj.config.get("EMAIL_LOG_ONLY"):
            schedule_password_reset_email(app_obj, user_id=user.id, reset_link=reset_link)
    except Exception:
        current_app.logger.exception("Password reset email hook failed")

    dev_token = bool(
        current_app.debug or current_app.config.get("PASSWORD_RESET_RETURN_TOKEN")
    )
    if dev_token:
        out["dev_reset_token"] = token
        out["dev_reset_link"] = reset_link
    return jsonify(out), 200


@auth_bp.post("/reset-password")
@limiter.limit("10 per hour")
def reset_password():
    data = request.get_json(silent=True) or {}
    token = (data.get("token") or "").strip()
    new_pw = data.get("new_password") or data.get("password") or ""
    if not token or not new_pw:
        return jsonify({"error": "token and new_password required"}), 400
    ok, err = _validate_new_password(str(new_pw))
    if not ok:
        return jsonify({"error": err}), 400
    try:
        payload = load_password_reset_token(current_app._get_current_object(), token)
    except SignatureExpired:
        return jsonify({"error": "Reset link has expired. Request a new one."}), 400
    except BadSignature:
        return jsonify({"error": "Invalid or corrupted reset link."}), 400
    uid = payload.get("uid")
    try:
        uid_int = int(uid)
    except (TypeError, ValueError):
        return jsonify({"error": "Invalid reset token."}), 400
    user = db.session.get(User, uid_int)
    if user is None:
        return jsonify({"error": "Invalid reset token."}), 400
    user.password_hash = hash_password(str(new_pw))
    db.session.commit()
    return jsonify({"status": "updated"})


@auth_bp.get("/me")
@jwt_required()
def me():
    u = current_user()
    if u is None:
        return jsonify({"error": "Unauthorized"}), 401
    payload = {
        "id": u.id,
        "email": u.email,
        "role": u.role,
        "preferences": u.preferences if isinstance(u.preferences, dict) else {},
    }
    emp = Employee.query.filter_by(user_id=u.id).first()
    if emp:
        payload["employee"] = {
            "id": emp.id,
            "first_name": emp.first_name,
            "last_name": emp.last_name,
            "employee_id": emp.employee_id,
            "phone": emp.phone,
            "address_line1": emp.address_line1,
            "city": emp.city,
            "state": emp.state,
            "zip_code": emp.zip_code,
        }
    return jsonify(payload)
