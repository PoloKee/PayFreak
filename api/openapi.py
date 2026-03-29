"""OpenAPI 3.0 skeleton for PayRight (expand over time)."""

from flask import Blueprint, jsonify

openapi_bp = Blueprint("openapi", __name__)


def build_openapi_spec() -> dict:
    return {
        "openapi": "3.0.3",
        "info": {
            "title": "PayRight API",
            "version": "1.0.0",
            "description": "Pay stubs, bank statements, admin, FinAssist agent, email & analytics endpoints.",
        },
        "servers": [{"url": "/api", "description": "API base (same origin as Flask app)"}],
        "tags": [
            {"name": "auth", "description": "JWT login, register, refresh"},
            {"name": "paystubs", "description": "Pay stub CRUD and generation"},
            {"name": "admin", "description": "Admin stats, settings, database browser, backup, analytics, email test"},
            {"name": "monitoring", "description": "Health and readiness"},
            {"name": "agent", "description": "FinAssist chat and preferences"},
        ],
        "paths": {
            "/auth/login": {
                "post": {
                    "tags": ["auth"],
                    "summary": "Login",
                    "requestBody": {
                        "required": True,
                        "content": {
                            "application/json": {
                                "schema": {
                                    "type": "object",
                                    "required": ["email", "password"],
                                    "properties": {
                                        "email": {"type": "string", "format": "email"},
                                        "password": {"type": "string", "format": "password"},
                                    },
                                }
                            }
                        },
                    },
                    "responses": {
                        "200": {"description": "Tokens issued"},
                        "401": {"description": "Invalid credentials"},
                    },
                }
            },
            "/auth/register": {
                "post": {
                    "tags": ["auth"],
                    "summary": "Register",
                    "requestBody": {
                        "content": {
                            "application/json": {
                                "schema": {
                                    "type": "object",
                                    "required": ["email", "password"],
                                    "properties": {
                                        "email": {"type": "string"},
                                        "password": {"type": "string"},
                                        "role": {"type": "string", "enum": ["employee", "employer", "admin"]},
                                    },
                                }
                            }
                        }
                    },
                    "responses": {"201": {"description": "Created"}, "409": {"description": "Conflict"}},
                }
            },
            "/paystubs/generate": {
                "post": {
                    "tags": ["paystubs"],
                    "summary": "Generate pay stub",
                    "security": [{"bearerAuth": []}],
                    "requestBody": {
                        "content": {
                            "application/json": {
                                "schema": {
                                    "type": "object",
                                    "required": ["employee_id"],
                                    "properties": {
                                        "employee_id": {"type": "integer"},
                                        "template_slug": {"type": "string"},
                                        "pay_period_start": {"type": "string", "format": "date"},
                                        "pay_period_end": {"type": "string", "format": "date"},
                                        "pay_date": {"type": "string", "format": "date"},
                                        "gross_pay": {"type": "number"},
                                    },
                                }
                            }
                        }
                    },
                    "responses": {"200": {"description": "Stub created"}, "400": {"description": "Bad request"}},
                }
            },
            "/admin/stats": {
                "get": {
                    "tags": ["admin"],
                    "summary": "Dashboard counts",
                    "security": [{"bearerAuth": []}],
                    "responses": {"200": {"description": "Stats object"}},
                }
            },
            "/admin/analytics/dashboard": {
                "get": {
                    "tags": ["admin"],
                    "summary": "Analytics dashboard aggregates",
                    "security": [{"bearerAuth": []}],
                    "responses": {"200": {"description": "Analytics JSON"}},
                }
            },
            "/admin/backup/run": {
                "post": {
                    "tags": ["admin"],
                    "summary": "Run backup bundle (DB + tar uploads/gallery)",
                    "security": [{"bearerAuth": []}],
                    "responses": {"200": {"description": "Paths manifest"}},
                }
            },
            "/admin/email/test": {
                "post": {
                    "tags": ["admin"],
                    "summary": "Send test email",
                    "security": [{"bearerAuth": []}],
                    "requestBody": {
                        "content": {
                            "application/json": {
                                "schema": {
                                    "type": "object",
                                    "properties": {"to": {"type": "string", "format": "email"}},
                                }
                            }
                        }
                    },
                    "responses": {"200": {"description": "Queued or sent"}},
                }
            },
            "/monitoring/health": {
                "get": {
                    "tags": ["monitoring"],
                    "summary": "Liveness",
                    "responses": {"200": {"description": "OK"}},
                }
            },
            "/monitoring/ready": {
                "get": {
                    "tags": ["monitoring"],
                    "summary": "Readiness (DB ping)",
                    "responses": {"200": {"description": "Ready"}, "503": {"description": "Not ready"}},
                }
            },
            "/agent/chat": {
                "post": {
                    "tags": ["agent"],
                    "summary": "FinAssist chat turn",
                    "security": [{"bearerAuth": []}],
                    "responses": {"200": {"description": "Assistant reply"}},
                }
            },
        },
        "components": {
            "securitySchemes": {
                "bearerAuth": {
                    "type": "http",
                    "scheme": "bearer",
                    "bearerFormat": "JWT",
                }
            }
        },
    }


@openapi_bp.get("/openapi.json")
def serve_openapi_json():
    return jsonify(build_openapi_spec())
