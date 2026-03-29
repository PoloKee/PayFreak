import logging
import threading
import queue
from abc import ABC, abstractmethod
from datetime import datetime
from typing import Any, Dict, Optional

from .types import AgentStatus, Task


class BaseAgent(ABC):
    """Abstract base class for all agents"""

    def __init__(self, name: str, config: Optional[Dict[str, Any]] = None):
        self.name = name
        self.config = config or {}
        self.status = AgentStatus.IDLE
        self.task_queue: queue.PriorityQueue = queue.PriorityQueue()
        self._queue_seq = 0
        self.worker_thread: Optional[threading.Thread] = None
        self.stop_event = threading.Event()
        self.stats = {
            "tasks_processed": 0,
            "tasks_succeeded": 0,
            "tasks_failed": 0,
            "started_at": None,
            "last_active": None,
        }
        self.logger = logging.getLogger(f"agent.{name}")

    def start(self) -> None:
        """Start the agent's worker thread"""
        if self.worker_thread and self.worker_thread.is_alive():
            self.logger.warning("Agent %s is already running", self.name)
            return

        self.status = AgentStatus.RUNNING
        self.stop_event.clear()
        self.stats["started_at"] = datetime.now()
        self.worker_thread = threading.Thread(target=self._process_loop, daemon=True)
        self.worker_thread.start()
        self.logger.info("Agent %s started", self.name)

    def stop(self) -> None:
        """Stop the agent gracefully"""
        self.status = AgentStatus.STOPPED
        self.stop_event.set()
        if self.worker_thread:
            self.worker_thread.join(timeout=5)
        self.logger.info("Agent %s stopped", self.name)

    def pause(self) -> None:
        """Pause the agent"""
        self.status = AgentStatus.PAUSED
        self.logger.info("Agent %s paused", self.name)

    def resume(self) -> None:
        """Resume the agent"""
        self.status = AgentStatus.RUNNING
        self.logger.info("Agent %s resumed", self.name)

    def add_task(self, task: Task) -> None:
        """Add a task to the queue"""
        priority_value = -task.priority.value
        self._queue_seq += 1
        # Tie-breaker so heap never compares Task objects
        self.task_queue.put((priority_value, self._queue_seq, task))
        self.logger.debug("Task %s added to %s queue", task.task_id, self.name)

    def _process_loop(self) -> None:
        """Main processing loop for the agent"""
        while not self.stop_event.is_set():
            try:
                if self.status == AgentStatus.PAUSED:
                    self.stop_event.wait(1)
                    continue

                try:
                    _, _, task = self.task_queue.get(timeout=1)
                except queue.Empty:
                    continue

                self._process_task(task)

            except Exception as e:
                self.logger.error("Error in agent %s: %s", self.name, str(e))
                self.status = AgentStatus.ERROR

    def _process_task(self, task: Task) -> None:
        """Process a single task"""
        try:
            task.started_at = datetime.now()
            task.status = "processing"
            self.stats["last_active"] = datetime.now()

            self.logger.info(
                "Processing task %s of type %s", task.task_id, task.task_type
            )

            result = self.execute_task(task)

            task.result = result
            task.status = "completed"
            task.completed_at = datetime.now()

            self.stats["tasks_processed"] += 1
            self.stats["tasks_succeeded"] += 1

            self.logger.info("Task %s completed successfully", task.task_id)

        except Exception as e:
            task.status = "failed"
            task.error = str(e)
            task.completed_at = datetime.now()

            self.stats["tasks_processed"] += 1
            self.stats["tasks_failed"] += 1

            self.logger.error("Task %s failed: %s", task.task_id, str(e))

    @abstractmethod
    def execute_task(self, task: Task) -> Any:
        """Execute the task - to be implemented by subclasses"""
        raise NotImplementedError

    def get_status(self) -> Dict[str, Any]:
        """Get agent status"""
        return {
            "name": self.name,
            "status": self.status.value,
            "stats": self.stats,
            "queue_size": self.task_queue.qsize(),
        }
