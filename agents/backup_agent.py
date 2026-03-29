from typing import Any, Dict, Optional

from .base_agent import BaseAgent
from .types import Task


class BackupAgent(BaseAgent):
    """Handles backups and data integrity."""

    def __init__(self, config: Optional[Dict[str, Any]] = None):
        super().__init__("backup", config)

    def execute_task(self, task: Task) -> Any:
        return {"agent": self.name, "task_type": task.task_type, "ok": True}
