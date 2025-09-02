"""
Simplified FastAPI application using clean architecture principles.
Each endpoint is now just 1-2 lines thanks to the service layer.
"""
import os
import logging

import redis.asyncio as redis
from fastapi import Body, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from azure.monitor.opentelemetry import configure_azure_monitor
from opentelemetry import trace
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.redis import RedisInstrumentor
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter

from .domain import TaskType
from .services import TaskService

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Reduce Azure Monitor logging verbosity
logging.getLogger("azure.core.pipeline.policies.http_logging_policy").setLevel(logging.WARNING)
logging.getLogger("azure.monitor.opentelemetry").setLevel(logging.WARNING)

app = FastAPI()

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*", "traceparent", "tracestate", "Request-Id", "Request-Context"],
    expose_headers=["traceparent", "tracestate", "Request-Id", "Request-Context"],
)

# Configure telemetry
service_name = os.getenv("OTEL_SERVICE_NAME", "api")
ai_conn = os.getenv("APPLICATIONINSIGHTS_CONNECTION_STRING")
ai_key = os.getenv("APPINSIGHTS_INSTRUMENTATIONKEY") or os.getenv("APPLICATIONINSIGHTS_INSTRUMENTATION_KEY")

if ai_conn or ai_key:
    configure_azure_monitor(
        connection_string=ai_conn,
        enable_live_metrics=True,
        resource=Resource.create({
            "service.name": service_name,
            "service.version": "1.0.0",
            "service.instance.id": os.getenv("HOSTNAME", f"{service_name}-1")
        })
    )
    logger.info(f"Azure Monitor configured for service: {service_name}")
else:
    provider = TracerProvider(resource=Resource.create({"service.name": service_name}))
    provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter()))
    trace.set_tracer_provider(provider)
    logger.info(f"Using OTLP exporter for service: {service_name}")

FastAPIInstrumentor().instrument_app(app)
RedisInstrumentor().instrument()

# Initialize infrastructure
r = redis.Redis(host="redis", port=6379, decode_responses=True)
tracer = trace.get_tracer(__name__)

# Initialize service (dependency injection)
task_service = TaskService(queue_client=r, storage_client=r, tracer=tracer)


# Simplified endpoints - business logic moved to services
@app.post("/task1")
async def task1(payload: str = Body(...)):
    """Reverse string task - now just 1 line!"""
    task_id = await task_service.submit_task(TaskType.REVERSE, payload)
    return {"task_id": task_id}


@app.post("/task2")
async def task2(payload: str = Body(...)):
    """Uppercase string task - now just 1 line!"""
    task_id = await task_service.submit_task(TaskType.UPPERCASE, payload)
    return {"task_id": task_id}


@app.post("/task3")
async def task3(payload: str = Body(...)):
    """Slow processing task - now just 1 line!"""
    task_id = await task_service.submit_task(TaskType.SLOW, payload)
    return {"task_id": task_id}


@app.get("/result/{task_id}")
async def get_result(task_id: str):
    """Get task result - now just 2 lines!"""
    result = await task_service.get_task_result(task_id)
    
    if result.status == "pending":
        return {"status": "pending"}
    elif result.status == "error":
        return {"status": "error", "error": result.error}
    else:
        return {"status": "done", "result": result.result}


@app.get("/metrics/live")
async def get_live_metrics():
    """Live metrics endpoint."""
    queue_depth = await r.llen("tasks")
    return {
        "timestamp": "live",
        "metrics": {
            "task_queue_depth": queue_depth,
            "status": "live"
        }
    }
