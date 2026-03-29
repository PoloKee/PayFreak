from .admin import admin_bp
from .agent_routes import agent_bp
from .agents import agents_bp, init_orchestrator
from .auth import auth_bp
from .fields import fields_bp
from .employees import employees_bp
from .employers import employers_bp
from .monitoring import monitoring_bp
from .openapi import openapi_bp
from .payroll_routes import payroll_bp
from .paystubs import paystubs_bp
from .process import process_bp
from .statements import statements_bp
from .templates import templates_bp

__all__ = [
    "admin_bp",
    "agent_bp",
    "agents_bp",
    "fields_bp",
    "auth_bp",
    "employees_bp",
    "employers_bp",
    "init_orchestrator",
    "monitoring_bp",
    "openapi_bp",
    "payroll_bp",
    "paystubs_bp",
    "process_bp",
    "statements_bp",
    "templates_bp",
]
