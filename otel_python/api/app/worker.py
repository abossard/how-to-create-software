import asyncio
import json
import os
import redis.asyncio as redis
from opentelemetry import trace

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
