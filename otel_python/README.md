# OTEL Python Demo

This demo shows a React frontend, FastAPI backend and background worker processing tasks via Redis.
Telemetry is sent to Azure Monitor when an Application Insights connection string or instrumentation key is supplied. Otherwise, the services use the native OpenTelemetry SDK and export to the Aspire dashboard. The provided `docker compose` setup runs in this Aspire mode by default.

## Running the stack

```
docker compose up --build
```

The `frontend` is available on http://localhost:5173 and the API on http://localhost:8000.
The Aspire observability dashboard is available on http://localhost:18888 when running in the default (non-Azure Monitor) mode.

## Tests

`docker compose` contains a `tests` service that waits for the stack and executes the end‑to‑end tests:

```
docker compose run --rm tests
```

Alternatively run them locally against a running stack:

```
python -m unittest tests/test_e2e.py -v
```
