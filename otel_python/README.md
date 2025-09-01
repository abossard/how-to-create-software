# OTEL Python Demo

This demo shows a React frontend, FastAPI backend and background worker processing tasks via Redis.
Telemetry is sent to Azure Monitor when an Application Insights connection string or instrumentation key is supplied. Otherwise, the services use the native OpenTelemetry SDK and export to the Aspire dashboard. The provided `docker compose` setup runs in this Aspire mode by default.

## Running the stack

```
docker compose up --build
```

The `frontend` is available on http://localhost:5173 and the API on http://localhost:8000.
The Aspire observability dashboard is available on http://localhost:18888 when running in the default (non-Azure Monitor) mode.

### Frontend production build & Fastify static server

For a production-like local run (serving the built static assets with security headers) use:

```
cd frontend
npm run serve:build
```

This runs a minimal Fastify server (`server.mjs`) that serves the built assets from `dist/` with a few basic security headers and an SPA fallback. (A stricter CSP was previously enabled and can be reintroduced later if desired.)

### Configuring the API base URL in the frontend

The React app sends POST requests to `/task1`, `/task2`, `/task3` on the API service. By default it assumes the API is reachable at the same host on port `8000` (e.g. `http://localhost:8000`). You can override this by setting `VITE_API_URL` in `frontend/.env.local` (no trailing slash), for example:

```
VITE_API_URL="https://staging-api.example.com"
```

At runtime the resolved API base is shown at the top of the page in a monospace line.

## Tests

`docker compose` contains a `tests` service that waits for the stack and executes the end‑to‑end tests:

```
docker compose run --rm tests
```

Alternatively run them locally against a running stack:

```
python -m unittest tests/test_e2e.py -v
```
