"""
Application service layer - orchestrates domain and infrastructure.
Follows "Deep Modules" principle with simple interface hiding complexity.
"""
import asyncio
import json

from .domain import Task, TaskRequest, TaskResult, TaskType, TaskProcessor


class TaskService:
    """
    Deep module: Simple interface, complex functionality hidden.
    Orchestrates domain logic with infrastructure concerns.
    """
    
    def __init__(self, queue_client, storage_client, tracer=None):
        self._queue = queue_client
        self._storage = storage_client
        self._tracer = tracer
    
    async def submit_task(self, task_type: TaskType, payload: str) -> str:
        """
        Simple interface hiding complex workflow:
        1. Validate input
        2. Create domain object
        3. Queue task
        4. Track metrics
        """
        # Create and validate domain object
        request = TaskRequest(task_type=task_type, payload=payload)
        task = Task.create(request)
        
        # Queue the task (infrastructure concern)
        await self._queue.rpush("tasks", json.dumps(task.to_queue_message()))
        
        # Optional telemetry (infrastructure concern)
        if self._tracer:
            with self._tracer.start_as_current_span(f"TaskService.submit_{task_type.value}") as span:
                span.set_attribute("task.id", task.id)
                span.set_attribute("task.type", task_type.value)
                span.set_attribute("task.payload_length", len(payload))
        
        return task.id
    
    async def get_task_result(self, task_id: str) -> TaskResult:
        """
        Simple interface for getting results.
        Hides storage implementation details.
        """
        result = await self._storage.hget("results", task_id)
        
        if result is None:
            return TaskResult(task_id=task_id, status="pending")
        
        if result.startswith("error:"):
            return TaskResult(task_id=task_id, status="error", error=result[6:])
        
        return TaskResult(task_id=task_id, status="done", result=result)


class WorkerService:
    """
    Simple worker interface hiding processing complexity.
    """
    
    def __init__(self, queue_client, storage_client, tracer=None):
        self._queue = queue_client
        self._storage = storage_client
        self._tracer = tracer
        self._processor = TaskProcessor()
    
    async def process_next_task(self) -> bool:
        """
        Process one task from queue.
        Returns True if task was processed, False if queue empty.
        """
        # Get task from queue
        result = await self._queue.blpop("tasks", timeout=5)
        if result is None:
            return False
        
        _, raw_task = result
        task_data = json.loads(raw_task)  # Parse JSON from Redis
        
        # Create domain object
        task = Task(
            id=task_data["id"],
            task_type=TaskType(task_data["kind"]),
            payload=task_data["data"]
        )
        
        try:
            # Process using pure domain logic
            if task.task_type == TaskType.SLOW:
                await asyncio.sleep(1)  # Only side effect here
            
            result = self._processor.process_task(task)
            
            # Store result
            await self._storage.hset("results", task.id, result)
            
            # Optional telemetry
            if self._tracer:
                with self._tracer.start_as_current_span(f"WorkerService.process_{task.task_type.value}") as span:
                    span.set_attribute("task.id", task.id)
                    span.set_attribute("task.result_length", len(result))
            
            return True
            
        except Exception as e:
            # Store error
            await self._storage.hset("results", task.id, f"error: {str(e)}")
            
            if self._tracer:
                with self._tracer.start_as_current_span("WorkerService.error") as span:
                    span.set_attribute("task.id", task.id)
                    span.set_attribute("error.message", str(e))
            
            return True