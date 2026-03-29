import json
import time
import uuid
from typing import Any, Optional

from flask import Blueprint, Response, current_app, jsonify, request, stream_with_context
from flask_jwt_extended import get_jwt_identity, jwt_required

from ..finassist import FinAssistAgent
from ..finassist.action_executor import ActionExecutor
from ..models import AgentConversation, AgentMessage, AgentMemory, User
from ..utils.database import db

agent_bp = Blueprint("agent", __name__)


def _assistant_persist_text(response: dict[str, Any]) -> str:
    """Match the FinAssist UI: base content plus optional action_error / action_result."""
    body = (response.get("content") or "").strip() or "(empty reply)"
    err = response.get("action_error")
    if err:
        body += f"\n\n[action_error] {err}"
    ar = response.get("action_result")
    if ar is not None:
        body += "\n\n[action_result]\n" + json.dumps(ar, indent=2, default=str)
    return body[:65000]


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


def _persist_finassist_turn(
    uid: int,
    session_id: str,
    message: str,
    response: dict[str, Any],
    elapsed_ms: int,
) -> None:
    conv = _get_or_create_conversation(uid, session_id)
    db.session.add(
        AgentMessage(
            conversation_id=conv.id,
            role="user",
            content=message[:65000],
            intent=None,
            entities=None,
        )
    )
    db.session.add(
        AgentMessage(
            conversation_id=conv.id,
            role="assistant",
            content=_assistant_persist_text(response),
            intent=response.get("intent"),
            entities=response.get("entities"),
            action_plan=response.get("action_plan"),
            response_time_ms=elapsed_ms,
        )
    )
    db.session.commit()


def _get_or_create_conversation(user_id: int, session_id: str) -> AgentConversation:
    q = (
        AgentConversation.query.filter_by(user_id=user_id, session_id=session_id)
        .filter(AgentConversation.ended_at.is_(None))
        .order_by(AgentConversation.started_at.desc())
    )
    conv = q.first()
    if conv is None:
        conv = AgentConversation(user_id=user_id, session_id=session_id)
        db.session.add(conv)
        db.session.flush()
    return conv


@agent_bp.get("/history")
@jwt_required()
def get_agent_history():
    uid = _jwt_user_id()
    if uid is None:
        return jsonify({"error": "Unauthorized"}), 401
    session_id = (request.args.get("session_id") or "").strip()
    if not session_id:
        return jsonify({"error": "session_id required"}), 400
    conv = (
        AgentConversation.query.filter_by(user_id=uid, session_id=session_id)
        .filter(AgentConversation.ended_at.is_(None))
        .order_by(AgentConversation.started_at.desc())
        .first()
    )
    if conv is None:
        return jsonify({"messages": []})
    rows = (
        AgentMessage.query.filter_by(conversation_id=conv.id)
        .order_by(AgentMessage.id.asc())
        .all()
    )
    return jsonify(
        {
            "messages": [
                {
                    "role": m.role,
                    "content": m.content,
                    "created_at": m.created_at.isoformat() + "Z"
                    if m.created_at
                    else None,
                }
                for m in rows
                if m.role in ("user", "assistant")
            ]
        }
    )


@agent_bp.post("/chat")
@jwt_required()
def chat_with_agent():
    uid = _jwt_user_id()
    if uid is None:
        return jsonify({"error": "Unauthorized"}), 401
    data = request.get_json(silent=True) or {}
    message = (data.get("content") or data.get("message") or "").strip()
    if not message:
        return jsonify({"error": "content is required"}), 400
    session_id = (
        data.get("session_id")
        or request.headers.get("X-Session-Id")
        or str(uuid.uuid4())
    )
    user = db.session.get(User, uid)
    agent = FinAssistAgent(str(uid), session_id)
    if user and isinstance(user.preferences, dict):
        agent.context["user_preferences"] = user.preferences
    t0 = time.perf_counter()
    response = agent.process_message(message)
    elapsed_ms = int((time.perf_counter() - t0) * 1000)
    _persist_finassist_turn(uid, session_id, message, response, elapsed_ms)
    return jsonify(response)


@agent_bp.post("/chat/stream")
@jwt_required()
def chat_with_agent_stream():
    """SSE stream: ``meta``, ``delta`` (text), ``final``; persists like ``/chat`` after completion."""
    uid = _jwt_user_id()
    if uid is None:
        return jsonify({"error": "Unauthorized"}), 401
    data = request.get_json(silent=True) or {}
    message = (data.get("content") or data.get("message") or "").strip()
    if not message:
        return jsonify({"error": "content is required"}), 400
    session_id = (
        data.get("session_id")
        or request.headers.get("X-Session-Id")
        or str(uuid.uuid4())
    )
    user = db.session.get(User, uid)
    agent = FinAssistAgent(str(uid), session_id)
    if user and isinstance(user.preferences, dict):
        agent.context["user_preferences"] = user.preferences

    @stream_with_context
    def generate():
        t0 = time.perf_counter()
        last_response: dict[str, Any] = {}
        try:
            for event in agent.iter_stream_events(message):
                if event.get("type") == "final":
                    last_response = event.get("response") or {}
                yield f"data: {json.dumps(event, default=str)}\n\n"
        except Exception as exc:  # noqa: BLE001
            yield f"data: {json.dumps({'type': 'error', 'message': str(exc)}, default=str)}\n\n"
            return
        elapsed_ms = int((time.perf_counter() - t0) * 1000)
        if last_response:
            try:
                _persist_finassist_turn(uid, session_id, message, last_response, elapsed_ms)
            except Exception as persist_exc:  # noqa: BLE001
                yield f"data: {json.dumps({'type': 'error', 'message': f'persist: {persist_exc}'}, default=str)}\n\n"

    return Response(
        generate(),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@agent_bp.get("/suggestions")
@jwt_required()
def get_suggestions():
    uid = _jwt_user_id()
    if uid is None:
        return jsonify({"error": "Unauthorized"}), 401
    ctx = request.args.get("context", "")
    session_id = (
        (request.args.get("session_id") or "").strip()
        or (request.headers.get("X-Session-Id") or "").strip()
        or str(uuid.uuid4())
    )
    agent = FinAssistAgent(str(uid), session_id)
    return jsonify({"suggestions": agent.generate_suggestions(ctx)})


@agent_bp.post("/documents/<int:document_id>/analyze")
@jwt_required()
def analyze_document(document_id: int):
    uid = _jwt_user_id()
    if uid is None:
        return jsonify({"error": "Unauthorized"}), 401
    data = request.get_json(silent=True) or {}
    doc_type = data.get("document_type", "pay_stub")
    session_id = request.headers.get("X-Session-Id") or str(uuid.uuid4())
    agent = FinAssistAgent(str(uid), session_id)
    analysis = agent.analyze_document(document_id, doc_type=doc_type)
    return jsonify(analysis)


@agent_bp.post("/calculate")
@jwt_required()
def calculate_with_ai():
    uid = _jwt_user_id()
    if uid is None:
        return jsonify({"error": "Unauthorized"}), 401
    data = request.get_json(silent=True) or {}
    calc_type = data.get("calculation_type")
    inputs = data.get("inputs")
    if not calc_type or not isinstance(inputs, dict):
        return jsonify({"error": "calculation_type and inputs object required"}), 400
    session_id = request.headers.get("X-Session-Id") or str(uuid.uuid4())
    agent = FinAssistAgent(str(uid), session_id)
    try:
        result = agent.calculate(calc_type, inputs)
    except (ValueError, KeyError, TypeError) as e:
        return jsonify({"error": str(e)}), 400
    return jsonify(result)


@agent_bp.get("/preferences")
@jwt_required()
def get_agent_preferences():
    uid = _jwt_user_id()
    if uid is None:
        return jsonify({"error": "Unauthorized"}), 401
    user = db.session.get(User, uid)
    prefs = user.preferences if user and isinstance(user.preferences, dict) else {}
    return jsonify({"preferences": prefs})


@agent_bp.post("/preferences")
@jwt_required()
def update_agent_preferences():
    uid = _jwt_user_id()
    if uid is None:
        return jsonify({"error": "Unauthorized"}), 401
    data = request.get_json(silent=True) or {}
    body = data.get("preferences")
    if not isinstance(body, dict):
        return jsonify({"error": "preferences object required"}), 400
    user = db.session.get(User, uid)
    if user is None:
        return jsonify({"error": "User not found"}), 404
    merged: dict[str, Any] = {}
    if isinstance(user.preferences, dict):
        merged.update(user.preferences)
    merged.update(body)
    user.preferences = merged
    db.session.commit()
    return jsonify({"status": "updated", "preferences": merged})


@agent_bp.post("/internal/execute-action")
def execute_agent_action():
    secret = current_app.config.get("PAYRIGHT_INTERNAL_SECRET") or ""
    key = request.headers.get("X-Internal-Key", "")
    if not secret or key != secret:
        return jsonify({"error": "Unauthorized"}), 401
    data = request.get_json(silent=True) or {}
    plan = data.get("action") or data.get("action_plan")
    executor = ActionExecutor()
    result = executor.execute(plan if isinstance(plan, dict) else {})
    return jsonify(result)


@agent_bp.post("/memory")
@jwt_required()
def upsert_agent_memory():
    uid = _jwt_user_id()
    if uid is None:
        return jsonify({"error": "Unauthorized"}), 401
    data = request.get_json(silent=True) or {}
    mem = AgentMemory(
        user_id=uid,
        memory_type=data.get("memory_type", "preference"),
        key=data.get("key"),
        value=data.get("value"),
        confidence=data.get("confidence"),
    )
    db.session.add(mem)
    db.session.commit()
    return jsonify({"id": mem.id, "status": "stored"})
