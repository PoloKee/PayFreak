import csv
import json
from datetime import date, datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from flask import current_app, has_app_context

from ..utils.database import db
from ..models import BankStatement, Employee, PayStub, Template
from ..models import employee_to_dict
from ..services.bank_statement_service import BankStatementService
from ..services.paystub_service import PaystubService, paystub_profiles_from_employee
from .base_agent import BaseAgent
from .types import Task


def _parse_date(value: Any) -> Optional[date]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        return date.fromisoformat(value[:10])
    return None


def _date_str(value: Any) -> str:
    d = _parse_date(value)
    return d.isoformat() if d else ""


def _mask_account(num: Optional[str]) -> str:
    if not num or len(str(num)) < 4:
        return "****"
    s = str(num)
    return f"****{s[-4:]}"


class DocumentAgent(BaseAgent):
    """Agent responsible for generating pay stubs and bank statements."""

    def __init__(self, config: Optional[Dict[str, Any]] = None):
        super().__init__("document", config)
        self.paystub_svc = PaystubService()
        self.bank_svc = BankStatementService()
        self.batch_size = (config or {}).get("batch_size", 50)

    def execute_task(self, task: Task) -> Any:
        if task.task_type == "generate_paystub":
            return self._generate_paystub(task.data)
        if task.task_type == "generate_bank_statement":
            return self._generate_bank_statement(task.data)
        if task.task_type == "batch_generate":
            return self._batch_generate(task.data)
        if task.task_type == "bulk_import":
            return self._bulk_import(task.data)
        raise ValueError(f"Unknown task type: {task.task_type}")

    def _resolve_employee(self, ref: Any) -> Optional[Employee]:
        if ref is None:
            return None
        try:
            pk = int(ref)
            emp = db.session.get(Employee, pk)
            if emp:
                return emp
        except (TypeError, ValueError):
            pass
        return Employee.query.filter_by(employee_id=str(ref)).first()

    def _paystub_context(
        self,
        employee: Employee,
        pay_data: Dict[str, Any],
        stub_id: Optional[int] = None,
    ) -> Dict[str, Any]:
        emp_prof, er_prof, employer_name, employer_addr = paystub_profiles_from_employee(employee)

        taxes = pay_data.get("taxes") or {}
        if not isinstance(taxes, dict):
            taxes = {}
        federal = taxes.get("federal_tax", taxes.get("federal"))
        state = taxes.get("state_tax", taxes.get("state"))
        ded = pay_data.get("deductions") or {}
        other = ded.get("other") if isinstance(ded, dict) else 0
        if other is None:
            other = 0

        gross = pay_data.get("gross_pay", 0)
        return self.paystub_svc.build_context(
            employee_name=emp_prof["name"],
            employee_code=emp_prof["employee_id"],
            employer_name=employer_name or "",
            employer_address=employer_addr,
            pay_period_start=_date_str(pay_data.get("pay_period_start")),
            pay_period_end=_date_str(pay_data.get("pay_period_end")),
            pay_date=_date_str(pay_data.get("pay_date")) or datetime.utcnow().strftime("%Y-%m-%d"),
            gross_pay=float(gross),
            federal_tax=float(federal) if federal is not None else None,
            state_tax=float(state) if state is not None else None,
            other_deductions=float(other),
            pay_data=pay_data,
            employee_profile=emp_prof,
            employer_profile=er_prof,
            stub_id=stub_id,
        )

    def _statement_context(
        self, employee: Employee, statement_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        ed = employee_to_dict(employee)
        txs = statement_data.get("transactions") or []
        if not isinstance(txs, list):
            txs = []
        return self.bank_svc.build_context(
            holder=ed["name"],
            account_masked=_mask_account(statement_data.get("account_number")),
            bank_name=str(statement_data.get("bank_name") or ""),
            period_start=_date_str(statement_data.get("statement_start")),
            period_end=_date_str(statement_data.get("statement_end")),
            opening=float(statement_data.get("opening_balance", 0)),
            closing=float(statement_data.get("closing_balance", 0)),
            transactions=txs,
        )

    def _generate_paystub(self, data: Dict[str, Any]) -> Dict[str, Any]:
        try:
            employee = self._resolve_employee(data.get("employee_id"))
            if not employee:
                raise ValueError(f"Employee {data.get('employee_id')!r} not found")

            template_id = data.get("template_id")
            template = db.session.get(Template, template_id) if template_id else None
            if not template:
                raise ValueError(f"Template {template_id} not found")

            pay_data = data.get("pay_data") or {}
            paystub = PayStub(
                employee_id=employee.id,
                template_id=template.id,
                pay_period_start=_parse_date(pay_data.get("pay_period_start")),
                pay_period_end=_parse_date(pay_data.get("pay_period_end")),
                pay_date=_parse_date(pay_data.get("pay_date")) or datetime.utcnow().date(),
                gross_pay=pay_data.get("gross_pay", 0),
                net_pay=pay_data.get("net_pay"),
                deductions=pay_data.get("deductions"),
            )
            db.session.add(paystub)
            db.session.flush()

            context = self._paystub_context(employee, pay_data, stub_id=paystub.id)
            paths = self.paystub_svc.generate_files(paystub.id, template.slug, context)

            paystub.data = context
            paystub.deductions = context.get("deductions")
            paystub.gross_pay = context["earnings"]["gross"]
            paystub.net_pay = context["net_pay"]
            paystub.html_path = paths.get("html_path")
            paystub.json_path = paths.get("json_path")
            paystub.pdf_path = paths.get("pdf_path")

            db.session.commit()

            try:
                if has_app_context():
                    from ..services.email_service import schedule_paystub_notification

                    schedule_paystub_notification(
                        current_app._get_current_object(), paystub.id
                    )
            except Exception:
                self.logger.exception("Pay stub email hook failed")

            return {
                "success": True,
                "paystub_id": paystub.id,
                "html_path": paystub.html_path,
                "pdf_path": paystub.pdf_path,
                "json_path": paystub.json_path,
            }
        except Exception as e:
            db.session.rollback()
            self.logger.error("Error generating paystub: %s", str(e))
            return {"success": False, "error": str(e)}

    def _generate_bank_statement(self, data: Dict[str, Any]) -> Dict[str, Any]:
        try:
            employee = self._resolve_employee(data.get("employee_id"))
            if not employee:
                raise ValueError(f"Employee {data.get('employee_id')!r} not found")

            template_id = data.get("template_id")
            template = db.session.get(Template, template_id) if template_id else None
            if not template:
                raise ValueError(f"Template {template_id} not found")

            statement_data = data.get("statement_data") or {}
            statement = BankStatement(
                employee_id=employee.id,
                template_id=template.id,
                account_number=statement_data.get("account_number"),
                statement_start=_parse_date(statement_data.get("statement_start")),
                statement_end=_parse_date(statement_data.get("statement_end")),
                opening_balance=statement_data.get("opening_balance", 0),
                closing_balance=statement_data.get("closing_balance", 0),
                transactions=statement_data.get("transactions", []),
            )
            db.session.add(statement)
            db.session.flush()

            context = self._statement_context(employee, statement_data)
            paths = self.bank_svc.generate_files(statement.id, template.slug, context)

            statement.data = context
            statement.html_path = paths.get("html_path")
            statement.json_path = paths.get("json_path")
            statement.pdf_path = paths.get("pdf_path")

            db.session.commit()

            return {
                "success": True,
                "statement_id": statement.id,
                "html_path": statement.html_path,
                "pdf_path": statement.pdf_path,
                "json_path": statement.json_path,
            }
        except Exception as e:
            db.session.rollback()
            self.logger.error("Error generating bank statement: %s", str(e))
            return {"success": False, "error": str(e)}

    def _batch_generate(self, data: Dict[str, Any]) -> Dict[str, Any]:
        results: List[Dict[str, Any]] = []
        document_type = data.get("document_type")
        employee_ids = data.get("employee_ids") or []
        template_id = data.get("template_id")
        batch_data = data.get("batch_data") or {}

        for emp_ref in employee_ids:
            task_data: Dict[str, Any] = {
                "employee_id": emp_ref,
                "template_id": template_id,
            }
            if document_type == "paystub":
                task_data["pay_data"] = batch_data
                result = self._generate_paystub(task_data)
                doc_id = result.get("paystub_id")
            else:
                task_data["statement_data"] = batch_data
                result = self._generate_bank_statement(task_data)
                doc_id = result.get("statement_id")

            results.append(
                {
                    "employee_id": emp_ref,
                    "success": result.get("success", False),
                    "error": result.get("error"),
                    "document_id": doc_id,
                }
            )

        return {
            "total": len(results),
            "successful": sum(1 for r in results if r["success"]),
            "failed": sum(1 for r in results if not r["success"]),
            "results": results,
        }

    def _load_records(self, file_path: Path, file_type: str) -> List[Dict[str, Any]]:
        if file_type == "json":
            with open(file_path, encoding="utf-8") as f:
                raw = json.load(f)
            if isinstance(raw, dict) and "records" in raw:
                raw = raw["records"]
            if not isinstance(raw, list):
                raise ValueError("JSON must be a list of objects or { \"records\": [...] }")
            return [r for r in raw if isinstance(r, dict)]
        if file_type == "csv":
            with open(file_path, encoding="utf-8", newline="") as f:
                return list(csv.DictReader(f))
        raise ValueError(f"Unsupported file type: {file_type}")

    def _bulk_import(self, data: Dict[str, Any]) -> Dict[str, Any]:
        file_path = data.get("file_path")
        file_type = (data.get("file_type") or "json").lower()
        document_type = data.get("document_type", "paystub")

        if not file_path:
            raise ValueError("file_path is required")
        path = Path(file_path)
        if not path.is_file():
            raise ValueError(f"File not found: {file_path}")

        records = self._load_records(path, file_type)
        results: List[Dict[str, Any]] = []
        template_id = data.get("template_id")

        for record in records:
            if document_type == "paystub":
                task_data = {
                    "employee_id": record.get("employee_id"),
                    "template_id": template_id,
                    "pay_data": record,
                }
                results.append(self._generate_paystub(task_data))
            else:
                task_data = {
                    "employee_id": record.get("employee_id"),
                    "template_id": template_id,
                    "statement_data": record,
                }
                results.append(self._generate_bank_statement(task_data))

        return {
            "total": len(results),
            "successful": sum(1 for r in results if r.get("success")),
            "failed": sum(1 for r in results if not r.get("success")),
            "results": results,
        }
