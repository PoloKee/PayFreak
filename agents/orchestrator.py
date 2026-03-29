import logging
import threading
import time
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional, Union

from .backup_agent import BackupAgent
from .base_agent import BaseAgent
from .document_agent import DocumentAgent
from .ml_extractor_agent import MlExtractorAgent
from .monitoring_agent import MonitoringAgent
from .notification_agent import NotificationAgent
from .pdf_processor_agent import PdfProcessorAgent
from .scheduler_agent import SchedulerAgent
from .template_agent import TemplateAgent
from .types import AgentPriority, Task


class AgentOrchestrator:
    """Coordinates agent lifecycle, task submission, and optional health monitoring."""

    def __init__(self, config: Optional[Dict[str, Any]] = None):
        self.config = config or {}
        self.agents: Dict[str, BaseAgent] = {
            "document": DocumentAgent(self.config.get("document")),
            "template": TemplateAgent(self.config.get("template")),
            "pdf_processor": PdfProcessorAgent(self.config.get("pdf_processor")),
            "notification": NotificationAgent(self.config.get("notification")),
            "scheduler": SchedulerAgent(self.config.get("scheduler")),
            "backup": BackupAgent(self.config.get("backup")),
            "monitoring": MonitoringAgent(self.config.get("monitoring")),
            "ml_extractor": MlExtractorAgent(self.config.get("ml_extractor")),
        }
        self.task_history: List[Dict[str, Any]] = []
        self._history_lock = threading.Lock()
        self._running = False
        self._monitor_thread: Optional[threading.Thread] = None
        self._logger = logging.getLogger(__name__)

    def get_agent(self, name: str) -> BaseAgent:
        if name not in self.agents:
            raise KeyError(f"Unknown agent: {name}")
        return self.agents[name]

    @staticmethod
    def _coerce_priority(priority: Union[int, AgentPriority]) -> AgentPriority:
        if isinstance(priority, AgentPriority):
            return priority
        return AgentPriority(priority)

    def submit_task(
        self,
        agent_name: str,
        task_type: str,
        data: Any,
        priority: Union[int, AgentPriority] = AgentPriority.NORMAL,
    ) -> str:
        task_id = str(uuid.uuid4())
        task = Task(task_id, task_type, data, self._coerce_priority(priority))
        self.get_agent(agent_name).add_task(task)
        with self._history_lock:
            self.task_history.append(
                {
                    "task_id": task_id,
                    "agent": agent_name,
                    "type": task_type,
                    "submitted_at": datetime.now().isoformat(),
                    "status": "pending",
                }
            )
        return task_id

    def submit(self, agent_name: str, task: Task) -> None:
        self.get_agent(agent_name).add_task(task)
        with self._history_lock:
            self.task_history.append(
                {
                    "task_id": task.task_id,
                    "agent": agent_name,
                    "type": task.task_type,
                    "submitted_at": datetime.now().isoformat(),
                    "status": task.status,
                }
            )

    def start_all(self) -> None:
        for agent in self.agents.values():
            agent.start()
        self._running = True
        if self._monitor_thread is None or not self._monitor_thread.is_alive():
            self._monitor_thread = threading.Thread(
                target=self._monitor_agents,
                daemon=True,
                name="agent-orchestrator-monitor",
            )
            self._monitor_thread.start()
        self._logger.info("Agent orchestrator started")

    def stop_all(self) -> None:
        self._running = False
        for agent in self.agents.values():
            agent.stop()
        self._logger.info("Agent orchestrator stopped")

    def start(self) -> None:
        """Alias for :meth:`start_all`."""
        self.start_all()

    def stop(self) -> None:
        """Alias for :meth:`stop_all`."""
        self.stop_all()

    def get_agent_status(self) -> Dict[str, Any]:
        return {name: agent.get_status() for name, agent in self.agents.items()}

    def status_snapshot(self) -> List[Dict[str, Any]]:
        return [a.get_status() for a in self.agents.values()]

    def get_task_history(self, limit: int = 100) -> List[Dict[str, Any]]:
        with self._history_lock:
            return list(self.task_history[-limit:])

    def _monitor_agents(self) -> None:
        while self._running:
            time.sleep(10)
            if not self._running:
                break
            for name, agent in self.agents.items():
                status = agent.get_status()
                if status["status"] == "error":
                    self._logger.warning(
                        "Agent %s is in error state; attempting restart", name
                    )
                    try:
                        agent.stop()
                        agent.start()
                        self._logger.info("Agent %s restarted", name)
                    except Exception as e:
                        self._logger.exception(
                            "Failed to restart agent %s: %s", name, e
                        )

    def generate_paystub(
        self, employee_id: int, template_id: int, pay_data: Dict[str, Any]
    ) -> str:
        return self.submit_task(
            "document",
            "generate_paystub",
            {
                "employee_id": employee_id,
                "template_id": template_id,
                "pay_data": pay_data,
            },
        )

    def generate_bank_statement(
        self, employee_id: int, template_id: int, statement_data: Dict[str, Any]
    ) -> str:
        return self.submit_task(
            "document",
            "generate_bank_statement",
            {
                "employee_id": employee_id,
                "template_id": template_id,
                "statement_data": statement_data,
            },
        )

    def process_pdf(
        self,
        file_path: str,
        document_type: Optional[str] = None,
        template_id: Optional[int] = None,
    ) -> str:
        return self.submit_task(
            "pdf_processor",
            "process_pdf",
            {
                "file_path": file_path,
                "document_type": document_type,
                "template_id": template_id,
            },
        )

    def import_template(
        self,
        source_path: str,
        name: Optional[str] = None,
        template_type: str = "pay_stub",
    ) -> str:
        return self.submit_task(
            "template",
            "import_template",
            {
                "source_path": source_path,
                "name": name,
                "type": template_type,
            },
        )

    def batch_generate(
        self,
        document_type: str,
        employee_ids: List[int],
        template_id: int,
        batch_data: Dict[str, Any],
    ) -> str:
        return self.submit_task(
            "document",
            "batch_generate",
            {
                "document_type": document_type,
                "employee_ids": employee_ids,
                "template_id": template_id,
                "batch_data": batch_data,
            },
            priority=AgentPriority.HIGH,
        )
