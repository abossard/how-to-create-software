import asyncio
import json
import os
import logging

import redis.asyncio as redis
import time
import signal
from datetime import datetime, timezone
from azure.monitor.opentelemetry import configure_azure_monitor
from opentelemetry import trace
from opentelemetry.instrumentation.redis import RedisInstrumentor
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter

# 🔥 Reduce Azure Monitor HTTP logging verbosity while keeping Live Metrics
logging.getLogger("azure.core.pipeline.policies.http_logging_policy").setLevel(logging.WARNING)
logging.getLogger("azure.monitor.opentelemetry").setLevel(logging.WARNING)

# Get service name from environment variable as single source of truth
service_name = os.getenv("OTEL_SERVICE_NAME", "worker")

ai_conn = os.getenv("APPLICATIONINSIGHTS_CONNECTION_STRING")
ai_key = os.getenv("APPINSIGHTS_INSTRUMENTATIONKEY") or os.getenv(
    "APPLICATIONINSIGHTS_INSTRUMENTATION_KEY"
)
if ai_conn or ai_key:
    # 🔥 Configure Azure Monitor with Live Metrics Stream for Worker
    configure_azure_monitor(
        connection_string=ai_conn,
        enable_live_metrics=True,  # Enable Live Metrics Stream
        resource=Resource.create({
            "service.name": service_name,
            "service.version": "1.0.0",
            "service.instance.id": os.getenv("HOSTNAME", f"{service_name}-1")
        })
    )
    print(f"🔥 Worker: Azure Monitor configured with Live Metrics Stream enabled for service: {service_name}", flush=True)
else:
    provider = TracerProvider(resource=Resource.create({"service.name": service_name}))
    provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter()))
    trace.set_tracer_provider(provider)
    print(f"⚠️ Worker: Using OTLP exporter for service: {service_name} - Azure Monitor not configured", flush=True)

RedisInstrumentor().instrument()

QUEUE = "tasks"
RESULTS = "results"

r = redis.Redis(host=os.environ.get("REDIS_HOST", "redis"), port=6379, decode_responses=True)
tracer = trace.get_tracer(__name__)

# --- Structured logging helper (simple JSON) ---
def jlog(level: str, message: str, **fields):
    record = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "level": level,
        "service": service_name,  # Use dynamic service name
        "msg": message,
    }
    if fields:
        record.update(fields)
    # lightweight JSON dump without importing json again (already imported)
    print(json.dumps(record), flush=True)

shutdown_flag = {"stop": False}

def _handle_signal(sig, frame):  # noqa: ARG001 (frame unused)
    jlog("info", "shutdown signal received", signal=sig)
    shutdown_flag["stop"] = True

signal.signal(signal.SIGTERM, _handle_signal)
signal.signal(signal.SIGINT, _handle_signal)

DEAD_LETTER = "dead_letter"

async def handle(job):
    """Enhanced job processing with custom task spans."""
    task_id = job["id"]
    kind = job["kind"]
    data = job["data"]
    
    # 🎯 Create custom task processing span with rich attributes
    with tracer.start_as_current_span(f"TaskProcessing.{kind}") as span:
        # Rich task attributes
        span.set_attribute("task.id", task_id)
        span.set_attribute("task.type", kind)
        span.set_attribute("task.input_text", data)
        span.set_attribute("task.input_length", len(data))
        span.set_attribute("task.input_words", len(data.split()))
        span.set_attribute("task.status", "processing")
        span.set_attribute("operation.name", f"TaskProcessing.{kind}")
        span.set_attribute("worker.service", service_name)
        
        # Add custom event for processing start
        span.add_event("task.processing_started", {
            "task.id": task_id,
            "task.input_preview": data[:50] + "..." if len(data) > 50 else data,
            "processing_timestamp": datetime.now(timezone.utc).isoformat()
        })
        
        try:
            start_time = time.time()
            
            if kind == "reverse":
                result = data[::-1]
                span.set_attribute("task.operation", "string_reverse")
            elif kind == "uppercase":
                result = data.upper()
                span.set_attribute("task.operation", "string_uppercase")
            elif kind == "slow":
                span.set_attribute("task.operation", "slow_processing")
                span.set_attribute("task.sleep_duration", 1.0)
                await asyncio.sleep(1)
                result = f"processed:{data}"
            else:
                # Unknown job kind: move to dead-letter list and mark result accordingly
                await r.rpush(DEAD_LETTER, json.dumps(job))
                result = "dead_letter"
                span.set_attribute("task.status", "dead_letter")
                span.set_attribute("task.error", f"unknown_job_kind: {kind}")
                jlog("warn", "unknown job kind", job_id=job["id"], kind=kind)
                
                # Add error event
                span.add_event("task.error", {
                    "error.type": "unknown_job_kind",
                    "error.message": f"Unknown job kind: {kind}",
                    "task.id": task_id
                })
                
                await r.hset(RESULTS, job["id"], result)
                return
            
            processing_time = time.time() - start_time
            
            # 🎯 Rich result attributes
            span.set_attribute("task.status", "completed")
            span.set_attribute("task.result", result)
            span.set_attribute("task.result_length", len(result))
            span.set_attribute("task.processing_time_ms", round(processing_time * 1000, 2))
            
            # Add custom event for processing completion
            span.add_event("task.processing_completed", {
                "task.id": task_id,
                "task.result_preview": result[:50] + "..." if len(result) > 50 else result,
                "processing_time_ms": round(processing_time * 1000, 2),
                "completion_timestamp": datetime.now(timezone.utc).isoformat()
            })
            
            await r.hset(RESULTS, job["id"], result)
            
            jlog("info", "task processed", 
                 task_id=task_id, 
                 kind=kind, 
                 input_preview=data[:30] + "..." if len(data) > 30 else data,
                 result_preview=result[:30] + "..." if len(result) > 30 else result,
                 processing_time_ms=round(processing_time * 1000, 2))
            
        except Exception as e:
            # Handle processing errors
            span.set_attribute("task.status", "error")
            span.set_attribute("task.error", str(e))
            
            span.add_event("task.processing_error", {
                "error.type": type(e).__name__,
                "error.message": str(e),
                "task.id": task_id
            })
            
            jlog("error", "task processing failed", task_id=task_id, kind=kind, error=str(e))
            await r.hset(RESULTS, job["id"], f"error: {str(e)}")
            raise

async def ensure_redis(max_attempts: int = 20):
    for attempt in range(1, max_attempts + 1):
        try:
            await r.ping()
            jlog("info", "redis connected", attempt=attempt)
            return
        except Exception as e:  # noqa: BLE001
            wait = min(0.5 * attempt, 5)
            jlog("warn", "redis not ready", attempt=attempt, max=max_attempts, error=str(e), retry_in=wait)
            await asyncio.sleep(wait)
    raise RuntimeError("redis connection failed")

async def worker_loop(heartbeat_interval: float = 30.0):
    jlog("info", "loop start", queue=QUEUE)
    processed = 0
    last_heartbeat = time.time()
    while not shutdown_flag["stop"]:
        try:
            # BLPOP with a timeout so we can check shutdown flag periodically
            res = await r.blpop(QUEUE, timeout=5)
            if res is None:
                # timeout - heartbeat check with 🔥 Live Metrics
                now = time.time()
                if now - last_heartbeat >= heartbeat_interval:
                    qlen = await r.llen(QUEUE)
                    dllen = await r.llen(DEAD_LETTER)
                    
                    # 🔥 Enhanced heartbeat with live metrics for Application Insights
                    heartbeat_data = {
                        "processed": processed, 
                        "queue_length": qlen, 
                        "dead_letter": dllen,
                        "worker_active": True,
                        "uptime_seconds": round(now - start_time, 2)
                    }
                    jlog("info", "heartbeat", **heartbeat_data)
                    
                    # Add custom telemetry for live metrics
                    with tracer.start_as_current_span("worker_heartbeat") as span:
                        span.set_attribute("worker.processed_total", processed)
                        span.set_attribute("worker.queue_length", qlen)
                        span.set_attribute("worker.dead_letter_count", dllen)
                        span.set_attribute("worker.active", True)
                    
                    last_heartbeat = now
                continue
            _, raw = res
            job = json.loads(raw)
            
            # 🔥 Enhanced job processing with custom task spans
            with tracer.start_as_current_span("TaskQueue.dequeue") as queue_span:
                queue_span.set_attribute("queue.name", QUEUE)
                queue_span.set_attribute("job.id", job["id"])
                queue_span.set_attribute("job.kind", job["kind"])
                queue_span.set_attribute("worker.processed_count", processed + 1)
                
                await handle(job)
            processed += 1
            
        except Exception as e:  # noqa: BLE001
            jlog("error", "job processing error", error=str(e))
            # 🔥 Track errors in live metrics
            with tracer.start_as_current_span("worker_error") as span:
                span.set_attribute("error.message", str(e))
                span.set_attribute("worker.error_count", 1)
            await asyncio.sleep(1)
    jlog("info", "shutdown complete", processed=processed)

async def main():
    start = time.time()
    global start_time
    start_time = start  # 🔥 Make start time available for live metrics
    jlog("info", "startup", pid=os.getpid())
    try:
        await ensure_redis()
        await worker_loop()
    except Exception as e:  # noqa: BLE001
        jlog("fatal", "runtime failure", error=str(e))
        raise
    finally:
        jlog("info", "exit", uptime=round(time.time() - start, 2))

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        jlog("info", "keyboard interrupt")
    except Exception:
        # Already logged inside main
        pass
