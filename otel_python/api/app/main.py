import json
import os
import uuid

import redis.asyncio as redis
from fastapi import Body, FastAPI
from azure.monitor.opentelemetry import configure_azure_monitor
from opentelemetry import trace
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.redis import RedisInstrumentor
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter

app = FastAPI()

ai_conn = os.getenv("APPLICATIONINSIGHTS_CONNECTION_STRING")
ai_key = os.getenv("APPINSIGHTS_INSTRUMENTATIONKEY") or os.getenv(
    "APPLICATIONINSIGHTS_INSTRUMENTATION_KEY"
)
if ai_conn or ai_key:
    configure_azure_monitor()
else:
    provider = TracerProvider(resource=Resource.create({"service.name": "api"}))
    provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter()))
    trace.set_tracer_provider(provider)

FastAPIInstrumentor().instrument_app(app)
RedisInstrumentor().instrument()

QUEUE = "tasks"
RESULTS = "results"
r = redis.Redis(host="redis", port=6379, decode_responses=True)

async def enqueue(kind: str, payload: str) -> str:
    task_id = str(uuid.uuid4())
    await r.rpush(QUEUE, json.dumps({"id": task_id, "kind": kind, "data": payload}))
    return task_id

@app.post("/task1")
async def task1(payload: str = Body(...)):
    task_id = await enqueue("reverse", payload)
    return {"task_id": task_id}

@app.post("/task2")
async def task2(payload: str = Body(...)):
    task_id = await enqueue("uppercase", payload)
    return {"task_id": task_id}

@app.post("/task3")
async def task3(payload: str = Body(...)):
    task_id = await enqueue("slow", payload)
    return {"task_id": task_id}

@app.get("/result/{task_id}")
async def get_result(task_id: str):
    result = await r.hget(RESULTS, task_id)
    if result is None:
        return {"status": "pending"}
    return {"status": "done", "result": result}
