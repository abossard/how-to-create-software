import asyncio
import json
import os

import redis.asyncio as redis
from azure.monitor.opentelemetry import configure_azure_monitor
from opentelemetry import trace
from opentelemetry.instrumentation.redis import RedisInstrumentor
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor, OTLPSpanExporter

# Example from Azure docs on initializing the distro:
# import logging
# from azure.monitor.opentelemetry import configure_azure_monitor
# configure_azure_monitor(
#     logger_name="<your_logger_namespace>",
# )
# logger = logging.getLogger("<your_logger_namespace>")

ai_conn = os.getenv("APPLICATIONINSIGHTS_CONNECTION_STRING")
ai_key = os.getenv("APPINSIGHTS_INSTRUMENTATIONKEY") or os.getenv(
    "APPLICATIONINSIGHTS_INSTRUMENTATION_KEY"
)
if ai_conn or ai_key:
    configure_azure_monitor()
else:
    provider = TracerProvider(resource=Resource.create({"service.name": "worker"}))
    provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter()))
    trace.set_tracer_provider(provider)

RedisInstrumentor().instrument()

QUEUE = "tasks"
RESULTS = "results"

r = redis.Redis(host=os.environ.get("REDIS_HOST", "redis"), port=6379, decode_responses=True)
tracer = trace.get_tracer(__name__)

async def handle(job):
    kind = job["kind"]
    data = job["data"]
    if kind == "reverse":
        result = data[::-1]
    elif kind == "uppercase":
        result = data.upper()
    elif kind == "slow":
        await asyncio.sleep(1)
        result = f"processed:{data}"
    else:
        result = "unknown"
    await r.hset(RESULTS, job["id"], result)

async def worker_loop():
    while True:
        _, raw = await r.blpop(QUEUE)
        job = json.loads(raw)
        with tracer.start_as_current_span(f"process_{job['kind']}"):
            await handle(job)

if __name__ == "__main__":
    asyncio.run(worker_loop())
