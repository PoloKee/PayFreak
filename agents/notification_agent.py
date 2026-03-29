from typing import Any, Dict, Optional

from .base_agent import BaseAgent
from .types import Task


class NotificationAgent(BaseAgent):
    """Handles email and system notifications."""

    def __init__(self, config: Optional[Dict[str, Any]] = None):
        super().__init__("notification", config)

    def execute_task(self, task: Task) -> Any:
        return {"agent": self.name, "task_type": task.task_type, "ok": True}
