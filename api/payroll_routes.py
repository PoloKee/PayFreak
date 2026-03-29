"""Payroll intelligence API: schedule scenarios + optional AI-assisted hints."""

from __future__ import annotations

from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required

from ..services.payroll_intelligence import FREQUENCY_SCENARIOS, suggest_payroll_schedule
from .auth_utils import current_role

payroll_bp = Blueprint("payroll", __name__)


@payroll_bp.get("/frequency-scenarios")
def frequency_scenarios():
    """Static reference for pay frequencies (safe for unauthenticated UI helpers)."""
    return jsonify(
        {
            "scenarios": FREQUENCY_SCENARIOS,
            "pay_data_fields": {
                "pay_frequency_code": "weekly | biweekly | semimonthly | monthly | annual",
                "ytd_first_pay_date": "YYYY-MM-DD — first pay in calendar year of this check (not required for semimonthly)",
                "semimonthly_pay_days": "[1, 15] optional — days of month for semi-monthly",
                "auto_ytd": "default true — set false to supply manual YTD columns",
                "ytd_manual": "if true, skip automatic YTD fill",
            },
        }
    )


@payroll_bp.post("/schedule-hints")
@jwt_required()
def schedule_hints():
    """Suggest frequency / anchor from plain English (heuristic + optional OpenAI)."""
    if current_role() not in ("admin", "employer"):
        return jsonify({"error": "Forbidden"}), 403
    data = request.get_json(silent=True) or {}
    text = str(data.get("description") or data.get("text") or "").strip()
    if not text:
        return jsonify({"error": "description or text required"}), 400
    use_llm = data.get("use_llm", True)
    if isinstance(use_llm, str):
        use_llm = use_llm.lower() not in ("0", "false", "no")
    result = suggest_payroll_schedule(text, use_llm=bool(use_llm))
    return jsonify(result)
