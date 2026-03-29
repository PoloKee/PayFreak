import atexit
import os
import tempfile
import threading
from typing import Any, Dict, Optional

from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from ..utils.database import db
from ..models import User
from .orchestrator import AgentOrchestrator

agents_bp = Blueprint("agents", __name__)

orchestrator: Optional[AgentOrchestrator] = None
_atexit_registered = False


def _stop_orchestrator() -> None:
    global orchestrator
    if orchestrator is not None:
        try:
            orchestrator.stop()
        except Exception:
            pass


def init_orchestrator(config: Optional[Dict[str, Any]] = None) -> AgentOrchestrator:
    global orchestrator, _atexit_registered
    orchestrator = AgentOrchestrator(config or {})
    orchestrator.start()
    if not _atexit_registered:
        atexit.register(_stop_orchestrator)
        _atexit_registered = True
    return orchestrator


def _jwt_user_id() -> Optional[int]:
    identity = get_jwt_identity()
    if identity is None:
        return None
    if isinstance(identity, dict):
        raw = identity.get("user_id")
        if raw is None:
            return None
        try:
            return int(raw)
        except (TypeError, ValueError):
            return None
    try:
        return int(identity)
    except (TypeError, ValueError):
        return None


def _current_user() -> Optional[User]:
    uid = _jwt_user_id()
    if uid is None:
        return None
    return db.session.get(User, uid)


def _orch() -> Optional[AgentOrchestrator]:
    return orchestrator


@agents_bp.get("/status")
@jwt_required()
def get_agent_status():
    o = _orch()
    if o is None:
        return jsonify({"error": "Agent orchestrator not initialized"}), 503

    user = _current_user()
    if user is None:
        return jsonify({"error": "Unauthorized"}), 401
    if user.role not in ("admin",):
        return jsonify({"error": "Unauthorized"}), 403

    return jsonify(o.get_agent_status()), 200


@agents_bp.post("/tasks")
@jwt_required()
def submit_task():
    o = _orch()
    if o is None:
        return jsonify({"error": "Agent orchestrator not initialized"}), 503

    user = _current_user()
    if user is None:
        return jsonify({"error": "Unauthorized"}), 401

    data = request.get_json(silent=True) or {}
    agent_name = data.get("agent")
    task_type = data.get("task_type")
    task_data = data.get("data", {})
    priority = data.get("priority", 1)

    if not agent_name or not task_type:
        return jsonify({"error": "agent and task_type required"}), 400

    try:
        task_id = o.submit_task(agent_name, task_type, task_data, priority)
        return (
            jsonify(
                {
                    "task_id": task_id,
                    "message": f"Task submitted to {agent_name}",
                }
            ),
            202,
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@agents_bp.get("/tasks/history")
@jwt_required()
def get_task_history():
    o = _orch()
    if o is None:
        return jsonify({"error": "Agent orchestrator not initialized"}), 503

    user = _current_user()
    if user is None:
        return jsonify({"error": "Unauthorized"}), 401
    if user.role not in ("admin",):
        return jsonify({"error": "Unauthorized"}), 403

    limit = request.args.get("limit", default=100, type=int)
    return jsonify(o.get_task_history(limit)), 200


@agents_bp.post("/generate/paystub")
@jwt_required()
def generate_paystub():
    o = _orch()
    if o is None:
        return jsonify({"error": "Agent orchestrator not initialized"}), 503

    user = _current_user()
    if user is None:
        return jsonify({"error": "Unauthorized"}), 401

    data = request.get_json(silent=True) or {}
    employee_id = data.get("employee_id")
    template_id = data.get("template_id")
    pay_data = data.get("pay_data", {})

    if not employee_id:
        return jsonify({"error": "employee_id required"}), 400
    if template_id is None:
        return jsonify({"error": "template_id required"}), 400

    task_id = o.generate_paystub(employee_id, template_id, pay_data)
    return (
        jsonify(
            {
                "task_id": task_id,
                "message": "Pay stub generation started",
            }
        ),
        202,
    )


@agents_bp.post("/generate/statement")
@jwt_required()
def generate_statement():
    o = _orch()
    if o is None:
        return jsonify({"error": "Agent orchestrator not initialized"}), 503

    user = _current_user()
    if user is None:
        return jsonify({"error": "Unauthorized"}), 401

    data = request.get_json(silent=True) or {}
    employee_id = data.get("employee_id")
    template_id = data.get("template_id")
    statement_data = data.get("statement_data", {})

    if not employee_id:
        return jsonify({"error": "employee_id required"}), 400
    if template_id is None:
        return jsonify({"error": "template_id required"}), 400

    task_id = o.generate_bank_statement(employee_id, template_id, statement_data)
    return (
        jsonify(
            {
                "task_id": task_id,
                "message": "Bank statement generation started",
            }
        ),
        202,
    )


@agents_bp.post("/process/pdf")
@jwt_required()
def process_pdf():
    o = _orch()
    if o is None:
        return jsonify({"error": "Agent orchestrator not initialized"}), 503

    user = _current_user()
    if user is None:
        return jsonify({"error": "Unauthorized"}), 401

    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400

    file = request.files["file"]
    if file.filename == "":
        return jsonify({"error": "No file selected"}), 400

    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
        file.save(tmp.name)
        file_path = tmp.name

    document_type = request.form.get("document_type")
    template_id = request.form.get("template_id", type=int)

    task_id = o.process_pdf(file_path, document_type, template_id)

    def cleanup() -> None:
        try:
            os.unlink(file_path)
        except OSError:
            pass

    threading.Timer(60.0, cleanup).start()

    return (
        jsonify(
            {
                "task_id": task_id,
                "message": "PDF processing started",
            }
        ),
        202,
    )


@agents_bp.post("/batch/generate")
@jwt_required()
def batch_generate():
    o = _orch()
    if o is None:
        return jsonify({"error": "Agent orchestrator not initialized"}), 503

    user = _current_user()
    if user is None:
        return jsonify({"error": "Unauthorized"}), 401

    data = request.get_json(silent=True) or {}
    document_type = data.get("document_type")
    employee_ids = data.get("employee_ids", [])
    template_id = data.get("template_id")
    batch_data = data.get("batch_data", {})

    if not document_type or not employee_ids:
        return jsonify({"error": "document_type and employee_ids required"}), 400
    if template_id is None:
        return jsonify({"error": "template_id required"}), 400

    task_id = o.batch_generate(document_type, employee_ids, template_id, batch_data)
    return (
        jsonify(
            {
                "task_id": task_id,
                "message": f"Batch generation started for {len(employee_ids)} employees",
            }
        ),
        202,
    )


@agents_bp.post("/templates/import")
@jwt_required()
def import_template():
    o = _orch()
    if o is None:
        return jsonify({"error": "Agent orchestrator not initialized"}), 503

    user = _current_user()
    if user is None:
        return jsonify({"error": "Unauthorized"}), 401
    if user.role not in ("admin", "employer"):
        return jsonify({"error": "Unauthorized"}), 403

    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400

    file = request.files["file"]
    if file.filename == "":
        return jsonify({"error": "No file selected"}), 400

    with tempfile.NamedTemporaryFile(delete=False, suffix=".zip") as tmp:
        file.save(tmp.name)
        file_path = tmp.name

    name = request.form.get("name")
    template_type = request.form.get("type", "pay_stub")

    task_id = o.import_template(file_path, name, template_type)

    return (
        jsonify(
            {
                "task_id": task_id,
                "message": "Template import started",
            }
        ),
        202,
    )
