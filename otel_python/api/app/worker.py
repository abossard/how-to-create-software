"""
Simplified worker using clean architecture principles.
Core loop reduced from 80+ lines to ~20 lines.
"""
import asyncio
import os
import logging
import signal
from datetime import datetime, timezone

import redis.asyncio as redis
from azure.monitor.opentelemetry import configure_azure_monitor
from opentelemetry import trace
from opentelemetry.instrumentation.redis import RedisInstrumentor
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter

from .services import WorkerService

# Reduce Azure Monitor logging verbosity
logging.getLogger("azure.core.pipeline.policies.http_logging_policy").setLevel(logging.WARNING)
logging.getLogger("azure.monitor.opentelemetry").setLevel(logging.WARNING)

# Configure telemetry
service_name = os.getenv("OTEL_SERVICE_NAME", "worker")
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
    print(f"Azure Monitor configured for service: {service_name}", flush=True)
else:
    provider = TracerProvider(resource=Resource.create({"service.name": service_name}))
    provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter()))
    trace.set_tracer_provider(provider)
    print(f"Using OTLP exporter for service: {service_name}", flush=True)

RedisInstrumentor().instrument()

# Initialize infrastructure
r = redis.Redis(host=os.environ.get("REDIS_HOST", "redis"), port=6379, decode_responses=True)
tracer = trace.get_tracer(__name__)

# Initialize service
worker_service = WorkerService(queue_client=r, storage_client=r, tracer=tracer)

# Simple shutdown handling
shutdown_flag = {"stop": False}

def handle_signal(sig, frame):
    print(f"Shutdown signal received: {sig}", flush=True)
    shutdown_flag["stop"] = True

signal.signal(signal.SIGTERM, handle_signal)
signal.signal(signal.SIGINT, handle_signal)


async def ensure_redis(max_attempts: int = 20):
    """Wait for Redis to be ready."""
    for attempt in range(1, max_attempts + 1):
        try:
            await r.ping()
            print(f"Redis connected on attempt {attempt}", flush=True)
            return
        except Exception as e:
            wait = min(0.5 * attempt, 5)
            print(f"Redis not ready (attempt {attempt}/{max_attempts}): {e}. Retrying in {wait}s", flush=True)
            await asyncio.sleep(wait)
    raise RuntimeError("Redis connection failed")


async def worker_loop():
    """
    Simplified worker loop - reduced from 80+ lines to ~15 lines.
    Business logic moved to service layer.
    """
    print("Worker loop starting", flush=True)
    processed = 0
    
    while not shutdown_flag["stop"]:
        try:
            # Use service layer - all complexity hidden
            task_processed = await worker_service.process_next_task()
            
            if task_processed:
                processed += 1
                if processed % 10 == 0:  # Log every 10 tasks
                    print(f"Processed {processed} tasks", flush=True)
            
        except Exception as e:
            print(f"Worker error: {e}", flush=True)
            await asyncio.sleep(1)
    
    print(f"Worker shutdown complete. Processed {processed} tasks.", flush=True)


async def main():
    """Main entry point."""
    start_time = datetime.now(timezone.utc)
    print(f"Worker starting at {start_time.isoformat()}", flush=True)
    
    try:
        await ensure_redis()
        await worker_loop()
    except Exception as e:
        print(f"Worker fatal error: {e}", flush=True)
        raise
    finally:
        uptime = (datetime.now(timezone.utc) - start_time).total_seconds()
        print(f"Worker exit. Uptime: {uptime:.1f}s", flush=True)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("Keyboard interrupt received", flush=True)
    except Exception:
        pass  # Already logged in main