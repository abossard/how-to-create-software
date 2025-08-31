import json
import os
import time
import unittest
import requests

BASE = os.environ.get("BASE_URL", "http://localhost:8000")

class TasksE2E(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        end = time.time() + 20
        while time.time() < end:
            try:
                requests.get(BASE)
                return
            except Exception:
                time.sleep(0.5)
        raise RuntimeError("API not reachable")

    def post_task(self, endpoint, payload):
        r = requests.post(
            f"{BASE}/{endpoint}",
            data=json.dumps(payload),
            headers={"Content-Type": "application/json"},
        )
        r.raise_for_status()
        return r.json()["task_id"]

    def get_result(self, task_id, timeout=10):
        end = time.time() + timeout
        while time.time() < end:
            r = requests.get(f"{BASE}/result/{task_id}")
            r.raise_for_status()
            data = r.json()
            if data["status"] == "done":
                return data["result"]
            time.sleep(0.5)
        self.fail("timed out waiting for result")

    def test_task1_reverse(self):
        task_id = self.post_task("task1", "hello")
        result = self.get_result(task_id)
        self.assertEqual(result, "olleh")

    def test_task2_uppercase(self):
        task_id = self.post_task("task2", "hello")
        result = self.get_result(task_id)
        self.assertEqual(result, "HELLO")

    def test_task3_slow(self):
        task_id = self.post_task("task3", "hello")
        result = self.get_result(task_id)
        self.assertEqual(result, "processed:hello")

if __name__ == "__main__":
    unittest.main()
