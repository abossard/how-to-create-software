import json
import uuid
import redis.asyncio as redis
from fastapi import Body, FastAPI

QUEUE = "tasks"
RESULTS = "results"
r = redis.Redis(host="redis", port=6379, decode_responses=True)

async def enqueue(kind: str, payload: str) -> str:
    task_id = str(uuid.uuid4())
    await r.rpush(QUEUE, json.dumps({"id": task_id, "kind": kind, "data": payload}))
    return task_id

app = FastAPI()

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
