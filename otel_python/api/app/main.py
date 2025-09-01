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
            "service.name": "otel-python-api",
            "service.version": "1.0.0",
            "service.instance.id": os.getenv("HOSTNAME", "api-1")
        })
    )
    logger.info("🔥 Azure Monitor configured with Live Metrics Stream enabled")
else:
    provider = TracerProvider(resource=Resource.create({"service.name": "api"}))
    provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter()))
    trace.set_tracer_provider(provider)
    logger.info("⚠️ Using OTLP exporter - Azure Monitor not configured")

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
    """Task 1: Reverse string with correlation tracking."""
    tracer = trace.get_tracer(__name__)
    
    with tracer.start_as_current_span("task1_reverse") as span:
        # Add correlation context to span
        traceparent = request.headers.get("traceparent") if request else None
        request_id = request.headers.get("request-id") if request else None
        
        if traceparent:
            span.set_attribute("correlation.traceparent", traceparent)
        if request_id:
            span.set_attribute("correlation.request_id", request_id)
        
        span.set_attribute("task.type", "reverse")
        span.set_attribute("task.payload", payload)
        
        task_id = await enqueue("reverse", payload)
        span.set_attribute("task.id", task_id)
        
        logger.info(f"Task1 {task_id} queued with correlation: traceparent={traceparent}, request_id={request_id}")
        
        return {"task_id": task_id}

@app.post("/task2")
async def task2(payload: str = Body(...), request: Request = None):
    """Task 2: Uppercase string with correlation tracking."""
    tracer = trace.get_tracer(__name__)
    
    with tracer.start_as_current_span("task2_uppercase") as span:
        # Add correlation context to span
        traceparent = request.headers.get("traceparent") if request else None
        request_id = request.headers.get("request-id") if request else None
        
        if traceparent:
            span.set_attribute("correlation.traceparent", traceparent)
        if request_id:
            span.set_attribute("correlation.request_id", request_id)
        
        span.set_attribute("task.type", "uppercase")
        span.set_attribute("task.payload", payload)
        
        task_id = await enqueue("uppercase", payload)
        span.set_attribute("task.id", task_id)
        
        logger.info(f"Task2 {task_id} queued with correlation: traceparent={traceparent}, request_id={request_id}")
        
        return {"task_id": task_id}

@app.post("/task3")
async def task3(payload: str = Body(...), request: Request = None):
    """Task 3: Slow processing with correlation tracking."""
    tracer = trace.get_tracer(__name__)
    
    with tracer.start_as_current_span("task3_slow") as span:
        # Add correlation context to span
        traceparent = request.headers.get("traceparent") if request else None
        request_id = request.headers.get("request-id") if request else None
        
        if traceparent:
            span.set_attribute("correlation.traceparent", traceparent)
        if request_id:
            span.set_attribute("correlation.request_id", request_id)
        
        span.set_attribute("task.type", "slow")
        span.set_attribute("task.payload", payload)
        
        task_id = await enqueue("slow", payload)
        span.set_attribute("task.id", task_id)
        
        logger.info(f"Task3 {task_id} queued with correlation: traceparent={traceparent}, request_id={request_id}")
        
        return {"task_id": task_id}

@app.get("/result/{task_id}")
async def get_result(task_id: str, request: Request = None):
    """Get task result with correlation tracking."""
    tracer = trace.get_tracer(__name__)
    
    with tracer.start_as_current_span("get_result") as span:
        # Add correlation context to span
        traceparent = request.headers.get("traceparent") if request else None
        request_id = request.headers.get("request-id") if request else None
        
        if traceparent:
            span.set_attribute("correlation.traceparent", traceparent)
        if request_id:
            span.set_attribute("correlation.request_id", request_id)
        
        span.set_attribute("task.id", task_id)
        
        result = await r.hget(RESULTS, task_id)
        if result is None:
            span.set_attribute("task.status", "pending")
            logger.info(f"Task {task_id} result pending - correlation: traceparent={traceparent}, request_id={request_id}")
            return {"status": "pending"}
        
        span.set_attribute("task.status", "done")
        span.set_attribute("task.result", result)
        logger.info(f"Task {task_id} result retrieved - correlation: traceparent={traceparent}, request_id={request_id}")
        
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
