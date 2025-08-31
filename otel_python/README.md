# OTEL Python Demo

This demo shows a React frontend, FastAPI backend and background worker processing tasks via Redis.
OpenTelemetry traces from all services are sent to an Aspire dashboard.

## Running the stack

```
docker compose up --build
```

The `frontend` is available on http://localhost:5173, the API on http://localhost:8000 and the Aspire dashboard on http://localhost:18888.

## Tests

`docker compose` contains a `tests` service that waits for the stack and executes the end‑to‑end tests:

```
docker compose run --rm tests
```

Alternatively run them locally against a running stack:

```
python -m unittest tests/test_e2e.py -v
```
