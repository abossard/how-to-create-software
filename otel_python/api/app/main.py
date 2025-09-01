import json
import os
import uuid
import logging

import redis.asyncio as redis
from fastapi import Body, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from azure.monitor.opentelemetry import configure_azure_monitor
from opentelemetry import trace
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.redis import RedisInstrumentor
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 🔥 Reduce Azure Monitor HTTP logging verbosity while keeping Live Metrics
logging.getLogger("azure.core.pipeline.policies.http_logging_policy").setLevel(logging.WARNING)
logging.getLogger("azure.monitor.opentelemetry").setLevel(logging.WARNING)

# 🔥 Live Metrics Counters for real-time monitoring
live_metrics = {
    "task_queue_depth": 0,
    "tasks_processed_total": 0,
    "active_requests": 0,
    "error_count": 0
}

app = FastAPI()

# CORS configuration: allow frontend browser origin(s)
_cors_origins_env = os.getenv("API_CORS_ORIGINS", "http://localhost:5173")
_origins = [o.strip() for o in _cors_origins_env.split(",") if o.strip()]
allow_credentials = True
if "*" in _origins:
    # Wildcard cannot be combined with credentials per spec; adjust automatically
    allow_credentials = False

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*", "traceparent", "tracestate", "Request-Id", "Request-Context"],
    expose_headers=["traceparent", "tracestate", "Request-Id", "Request-Context"],
)

# Correlation headers logging middleware
@app.middleware("http")
async def log_correlation_headers(request: Request, call_next):
    """Log and track correlation headers for distributed tracing."""
    
    # 🔥 Live Metrics: Track active requests
    live_metrics["active_requests"] += 1
    
    # Extract correlation headers
    traceparent = request.headers.get("traceparent")
    tracestate = request.headers.get("tracestate")
    request_id = request.headers.get("request-id")
    request_context = request.headers.get("request-context")
    
    # Log correlation information
    correlation_info = {
        "method": request.method,
        "url": str(request.url),
        "traceparent": traceparent,
        "tracestate": tracestate,
        "request_id": request_id,
        "request_context": request_context,
        "active_requests": live_metrics["active_requests"]  # 🔥 Live metric
    }
    logger.info(f"Correlation headers: {json.dumps(correlation_info)}")
    
    try:
        # Process request
        response = await call_next(request)
        
        # Add correlation headers to response if present
        if traceparent:
            response.headers["traceparent"] = traceparent
        if tracestate:
            response.headers["tracestate"] = tracestate
        if request_id:
            response.headers["request-id"] = request_id
        if request_context:
            response.headers["request-context"] = request_context
        
        return response
    
    except Exception as e:
        # 🔥 Live Metrics: Track errors
        live_metrics["error_count"] += 1
        logger.error(f"Request failed: {e}, Total errors: {live_metrics['error_count']}")
        raise
    
    finally:
        # 🔥 Live Metrics: Decrement active requests
        live_metrics["active_requests"] -= 1

# Get service name from environment variable as single source of truth
service_name = os.getenv("OTEL_SERVICE_NAME", "api")

ai_conn = os.getenv("APPLICATIONINSIGHTS_CONNECTION_STRING")
ai_key = os.getenv("APPINSIGHTS_INSTRUMENTATIONKEY") or os.getenv(
    "APPLICATIONINSIGHTS_INSTRUMENTATION_KEY"
)
if ai_conn or ai_key:
    # 🔥 Configure Azure Monitor with Live Metrics Stream
    configure_azure_monitor(
        connection_string=ai_conn,
        enable_live_metrics=True,  # Enable Live Metrics Stream
        resource=Resource.create({
            "service.name": service_name,
            "service.version": "1.0.0",
            "service.instance.id": os.getenv("HOSTNAME", f"{service_name}-1")
        })
    )
    logger.info(f"🔥 Azure Monitor configured with Live Metrics Stream enabled for service: {service_name}")
else:
    provider = TracerProvider(resource=Resource.create({"service.name": service_name}))
    provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter()))
    trace.set_tracer_provider(provider)
    logger.info(f"⚠️ Using OTLP exporter for service: {service_name} - Azure Monitor not configured")

FastAPIInstrumentor().instrument_app(app)
RedisInstrumentor().instrument()

QUEUE = "tasks"
RESULTS = "results"
r = redis.Redis(host="redis", port=6379, decode_responses=True)

async def enqueue(kind: str, payload: str) -> str:
    task_id = str(uuid.uuid4())
    await r.rpush(QUEUE, json.dumps({"id": task_id, "kind": kind, "data": payload}))
    
    # 🔥 Live Metrics: Update task queue depth and total tasks
    live_metrics["task_queue_depth"] = await r.llen(QUEUE)
    live_metrics["tasks_processed_total"] += 1
    logger.info(f"🔥 Live Metrics - Queue depth: {live_metrics['task_queue_depth']}, Total tasks: {live_metrics['tasks_processed_total']}")
    
    return task_id

@app.post("/task1")
async def task1(payload: str = Body(...), request: Request = None):
    """Task 1: Reverse string with enhanced task tracking."""
    tracer = trace.get_tracer(__name__)
    
    with tracer.start_as_current_span("TaskOperation.task1") as span:
        # Add correlation context to span
        traceparent = request.headers.get("traceparent") if request else None
        request_id = request.headers.get("request-id") if request else None
        
        if traceparent:
            span.set_attribute("correlation.traceparent", traceparent)
        if request_id:
            span.set_attribute("correlation.request_id", request_id)
        
        # 🎯 Rich task attributes with input text
        span.set_attribute("task.type", "task1")
        span.set_attribute("task.operation", "reverse")
        span.set_attribute("task.input_text", payload)
        span.set_attribute("task.input_length", len(payload))
        span.set_attribute("task.input_words", len(payload.split()))
        span.set_attribute("task.status", "submitted")
        span.set_attribute("operation.name", "TaskOperation.task1")
        
        task_id = await enqueue("reverse", payload)
        span.set_attribute("task.id", task_id)
        span.set_attribute("task.queue_position", live_metrics["task_queue_depth"])
        
        # Add custom event for task submission
        span.add_event("task.submitted", {
            "task.id": task_id,
            "task.input_preview": payload[:50] + "..." if len(payload) > 50 else payload,
            "queue.depth": live_metrics["task_queue_depth"]
        })
        
        logger.info(f"Task1 {task_id} queued with input: '{payload[:50]}...' - correlation: traceparent={traceparent}")
        
        return {"task_id": task_id}

@app.post("/task2")
async def task2(payload: str = Body(...), request: Request = None):
    """Task 2: Uppercase string with enhanced task tracking."""
    tracer = trace.get_tracer(__name__)
    
    with tracer.start_as_current_span("TaskOperation.task2") as span:
        # Add correlation context to span
        traceparent = request.headers.get("traceparent") if request else None
        request_id = request.headers.get("request-id") if request else None
        
        if traceparent:
            span.set_attribute("correlation.traceparent", traceparent)
        if request_id:
            span.set_attribute("correlation.request_id", request_id)
        
        # 🎯 Rich task attributes with input text
        span.set_attribute("task.type", "task2")
        span.set_attribute("task.operation", "uppercase")
        span.set_attribute("task.input_text", payload)
        span.set_attribute("task.input_length", len(payload))
        span.set_attribute("task.input_words", len(payload.split()))
        span.set_attribute("task.status", "submitted")
        span.set_attribute("operation.name", "TaskOperation.task2")
        
        task_id = await enqueue("uppercase", payload)
        span.set_attribute("task.id", task_id)
        span.set_attribute("task.queue_position", live_metrics["task_queue_depth"])
        
        # Add custom event for task submission
        span.add_event("task.submitted", {
            "task.id": task_id,
            "task.input_preview": payload[:50] + "..." if len(payload) > 50 else payload,
            "queue.depth": live_metrics["task_queue_depth"]
        })
        
        logger.info(f"Task2 {task_id} queued with input: '{payload[:50]}...' - correlation: traceparent={traceparent}")
        
        return {"task_id": task_id}

@app.post("/task3")
async def task3(payload: str = Body(...), request: Request = None):
    """Task 3: Slow processing with enhanced task tracking."""
    tracer = trace.get_tracer(__name__)
    
    with tracer.start_as_current_span("TaskOperation.task3") as span:
        # Add correlation context to span
        traceparent = request.headers.get("traceparent") if request else None
        request_id = request.headers.get("request-id") if request else None
        
        if traceparent:
            span.set_attribute("correlation.traceparent", traceparent)
        if request_id:
            span.set_attribute("correlation.request_id", request_id)
        
        # 🎯 Rich task attributes with input text
        span.set_attribute("task.type", "task3")
        span.set_attribute("task.operation", "slow_process")
        span.set_attribute("task.input_text", payload)
        span.set_attribute("task.input_length", len(payload))
        span.set_attribute("task.input_words", len(payload.split()))
        span.set_attribute("task.status", "submitted")
        span.set_attribute("operation.name", "TaskOperation.task3")
        
        task_id = await enqueue("slow", payload)
        span.set_attribute("task.id", task_id)
        span.set_attribute("task.queue_position", live_metrics["task_queue_depth"])
        
        # Add custom event for task submission
        span.add_event("task.submitted", {
            "task.id": task_id,
            "task.input_preview": payload[:50] + "..." if len(payload) > 50 else payload,
            "queue.depth": live_metrics["task_queue_depth"]
        })
        
        logger.info(f"Task3 {task_id} queued with input: '{payload[:50]}...' - correlation: traceparent={traceparent}")
        
        return {"task_id": task_id}

@app.get("/result/{task_id}")
async def get_result(task_id: str, request: Request = None):
    """Get task result with enhanced tracking."""
    tracer = trace.get_tracer(__name__)
    
    with tracer.start_as_current_span("TaskOperation.get_result") as span:
        # Add correlation context to span
        traceparent = request.headers.get("traceparent") if request else None
        request_id = request.headers.get("request-id") if request else None
        
        if traceparent:
            span.set_attribute("correlation.traceparent", traceparent)
        if request_id:
            span.set_attribute("correlation.request_id", request_id)
        
        span.set_attribute("task.id", task_id)
        span.set_attribute("operation.name", "TaskOperation.get_result")
        
        result = await r.hget(RESULTS, task_id)
        if result is None:
            span.set_attribute("task.status", "pending")
            span.add_event("task.result_pending", {
                "task.id": task_id,
                "check_timestamp": str(uuid.uuid4().hex)  # Simple timestamp
            })
            logger.info(f"Task {task_id} result pending - correlation: traceparent={traceparent}")
            return {"status": "pending"}
        
        # 🎯 Rich result attributes
        span.set_attribute("task.status", "completed")
        span.set_attribute("task.result", result)
        span.set_attribute("task.result_length", len(result))
        
        # Add custom event for task completion
        span.add_event("task.result_retrieved", {
            "task.id": task_id,
            "task.result_preview": result[:50] + "..." if len(result) > 50 else result,
            "result_length": len(result)
        })
        
        logger.info(f"Task {task_id} result retrieved: '{result[:50]}...' - correlation: traceparent={traceparent}")
        
        return {"status": "done", "result": result}

@app.get("/metrics/live")
async def get_live_metrics():
    """🔥 Live Metrics endpoint for real-time monitoring."""
    current_queue_depth = await r.llen(QUEUE)
    live_metrics["task_queue_depth"] = current_queue_depth
    
    return {
        "timestamp": uuid.uuid4().hex,  # Simple timestamp
        "metrics": live_metrics.copy(),
        "status": "live"
    }
