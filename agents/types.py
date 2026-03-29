from datetime import datetime
from enum import Enum
from typing import Any, Optional


class AgentStatus(Enum):
    """Agent status states"""

    IDLE = "idle"
    RUNNING = "running"
    PAUSED = "paused"
    ERROR = "error"
    STOPPED = "stopped"


class AgentPriority(Enum):
    """Task priority levels"""

    LOW = 0
    NORMAL = 1
    HIGH = 2
    CRITICAL = 3


class Task:
    """Represents a task to be processed by an agent"""

    def __init__(
        self,
        task_id: str,
        task_type: str,
        data: Any,
        priority: AgentPriority = AgentPriority.NORMAL,
    ):
        self.task_id = task_id
        self.task_type = task_type
        self.data = data
        self.priority = priority
        self.status = "pending"
        self.created_at = datetime.now()
        self.started_at: Optional[datetime] = None
        self.completed_at: Optional[datetime] = None
        self.result: Any = None
        self.error: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "task_id": self.task_id,
            "task_type": self.task_type,
            "priority": self.priority.value,
            "status": self.status,
            "created_at": self.created_at.isoformat(),
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat()
            if self.completed_at
            else None,
        }
