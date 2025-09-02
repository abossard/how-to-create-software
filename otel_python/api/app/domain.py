"""
Domain layer - Pure business logic with no side effects.
Following Grokking Simplicity principles: separate calculations from actions.
"""
from dataclasses import dataclass
from enum import Enum
from typing import Optional
import uuid


class TaskType(Enum):
    """Define task types - prevents unknown task type errors."""
    REVERSE = "reverse"
    UPPERCASE = "uppercase"
    SLOW = "slow"


@dataclass
class TaskRequest:
    """Value object for task requests."""
    task_type: TaskType
    payload: str
    
    def validate(self) -> None:
        """Pure validation logic."""
        if not self.payload.strip():
            raise ValueError("Payload cannot be empty")
        if len(self.payload) > 10000:  # Reasonable limit
            raise ValueError("Payload too large")


@dataclass
class Task:
    """Domain entity for tasks."""
    id: str
    task_type: TaskType
    payload: str
    
    @classmethod
    def create(cls, request: TaskRequest) -> 'Task':
        """Factory method for creating tasks."""
        request.validate()
        return cls(
            id=str(uuid.uuid4()),
            task_type=request.task_type,
            payload=request.payload
        )
    
    def to_queue_message(self) -> dict:
        """Convert to queue message format."""
        return {
            "id": self.id,
            "kind": self.task_type.value,
            "data": self.payload
        }


@dataclass
class TaskResult:
    """Value object for task results."""
    task_id: str
    status: str
    result: Optional[str] = None
    error: Optional[str] = None


# Pure calculation functions - no side effects, easy to test
def reverse_text(text: str) -> str:
    """Pure function: reverse text."""
    return text[::-1]


def uppercase_text(text: str) -> str:
    """Pure function: convert to uppercase."""
    return text.upper()


def slow_process_text(text: str) -> str:
    """Pure function: define slow processing transformation."""
    return f"processed:{text}"


class TaskProcessor:
    """Pure domain logic for task processing."""
    
    @staticmethod
    def process_task(task: Task) -> str:
        """Pure function: process task based on type."""
        match task.task_type:
            case TaskType.REVERSE:
                return reverse_text(task.payload)
            case TaskType.UPPERCASE:
                return uppercase_text(task.payload)
            case TaskType.SLOW:
                return slow_process_text(task.payload)