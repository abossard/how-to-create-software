# OpenTelemetry Python Demo

This repository contains an OpenTelemetry demo application consisting of a React frontend, FastAPI backend, Redis background worker, and observability dashboard. The application demonstrates distributed tracing across a multi-service architecture.

Always reference these instructions first and fallback to search or bash commands only when you encounter unexpected information that does not match the info here.

## Working Effectively

### Bootstrap and Build
- **Build the entire stack**: 
  - `cd otel_python`
  - `docker compose up --build -d` -- takes 6-10 minutes to complete (download base images + build). NEVER CANCEL. Set timeout to 15+ minutes.
- **Known Issue**: In sandboxed environments, SSL certificate issues may occur with pip and npm:
  - If pip fails with SSL errors, temporarily modify `otel_python/Dockerfile` line 4 to: `RUN pip install --no-cache-dir --trusted-host pypi.org --trusted-host pypi.python.org --trusted-host files.pythonhosted.org -r requirements.txt`
  - If npm fails with SSL errors, temporarily modify `otel_python/frontend/Dockerfile` line 4 to: `RUN npm config set strict-ssl false && npm install`
  - **CRITICAL**: Always revert these SSL workarounds before committing code.
- **Dependency Conflict**: If you encounter OpenTelemetry dependency conflicts, update `otel_python/api/requirements.txt` line 9 from `opentelemetry-distro==0.45b0` to `opentelemetry-distro==0.57b0`, then revert after build succeeds.

### Test the Application
- **End-to-end tests via Docker**: 
  - `docker compose run --rm tests` -- takes 1-2 seconds. NEVER CANCEL. Set timeout to 30+ seconds.
- **End-to-end tests locally** (requires running stack):
  - Install dependencies: `pip install --trusted-host pypi.org --trusted-host pypi.python.org --trusted-host files.pythonhosted.org -r otel_python/api/requirements.txt`
  - Run tests: `python -m unittest otel_python/tests/test_e2e.py -v` -- takes 1-2 seconds.

### Run the Application
- **Start all services**: `docker compose up --build -d`
- **Access points**:
  - Frontend: http://localhost:5173 (React app with task submission buttons)
  - API: http://localhost:8000 (FastAPI backend with task endpoints)
  - Aspire Dashboard: http://localhost:18888 (OpenTelemetry observability)
  - Redis: localhost:6379 (message queue, not HTTP accessible)
- **Stop services**: `docker compose down`

### Frontend Development
- **Build frontend**: 
  - `cd otel_python/frontend`
  - `npm install` -- may take 5+ minutes with SSL workarounds in sandboxed environments. NEVER CANCEL. Set timeout to 10+ minutes.
  - `npm run build` -- takes 10-30 seconds.
- **Development server**: `npm run dev` (runs on http://localhost:5173)

## Validation

### Always Test Core Functionality
After making changes to the API or worker, ALWAYS validate the complete task processing workflow:

1. **Start the stack**: `docker compose up --build -d`
2. **Test task submission and processing**:
   ```bash
   # Submit a reverse task and extract task ID
   TASK_ID=$(curl -s -X POST http://localhost:8000/task1 -H "Content-Type: application/json" -d '"hello world"' | grep -o '"task_id":"[^"]*"' | cut -d'"' -f4)
   
   # Wait a moment for processing
   sleep 2
   
   # Check result (should be "dlrow olleh")
   curl -X GET http://localhost:8000/result/$TASK_ID
   ```
3. **Verify all task types work**:
   - Task1 (reverse): `curl -X POST http://localhost:8000/task1 -H "Content-Type: application/json" -d '"test"'` → result: "tset"
   - Task2 (uppercase): `curl -X POST http://localhost:8000/task2 -H "Content-Type: application/json" -d '"test"'` → result: "TEST"  
   - Task3 (slow processing): `curl -X POST http://localhost:8000/task3 -H "Content-Type: application/json" -d '"test"'` → result: "processed:test"

### Frontend Testing
- Access http://localhost:5173 and verify the UI loads
- Test that the input field and three task buttons are present
- Cannot fully test frontend functionality in headless environments, but ensure it serves without errors

### Always Run Tests
- **ALWAYS run the test suite** before committing changes: `docker compose run --rm tests`
- **Expected behavior**: All 3 tests (test_task1_reverse, test_task2_uppercase, test_task3_slow) should pass in ~1 second

## Architecture Overview

### Key Services
- **frontend/**: React application with Vite (port 5173)
  - Uses OpenTelemetry web SDK for client-side tracing
  - Sends tasks to the API backend
- **api/**: FastAPI backend (port 8000)  
  - Three endpoints: `/task1` (reverse), `/task2` (uppercase), `/task3` (slow processing)
  - `/result/{task_id}` for checking task completion
  - Queues tasks in Redis, returns task IDs immediately
- **worker**: Background processor
  - Consumes tasks from Redis queue, processes them, stores results
  - Implements the actual business logic for each task type
- **redis**: Message queue and result storage (port 6379)
- **aspire**: .NET Aspire dashboard for OpenTelemetry observability (port 18888)

### Key Files
- **API Implementation**: `otel_python/api/app/main.py` (FastAPI endpoints and Redis queuing)
- **Worker Implementation**: `otel_python/api/app/worker.py` (task processing logic)
- **Frontend**: `otel_python/frontend/src/App.jsx` (React UI)
- **Tests**: `otel_python/tests/test_e2e.py` (end-to-end test scenarios)
- **Docker Configuration**: `otel_python/docker-compose.yml` (service orchestration)

## Common Tasks

### Build Times and Expectations
- **Docker build (clean)**: 6-10 minutes -- download base images, install dependencies. NEVER CANCEL.
- **Docker build (cached)**: 30 seconds -- reuse cached layers
- **npm install**: 5+ minutes in sandboxed environments due to SSL issues. NEVER CANCEL.  
- **pip install**: 15-30 seconds per service
- **Test execution**: 1-2 seconds
- **Frontend build**: 10-30 seconds

### Debugging Common Issues
- **"Cannot connect to API"**: Ensure all services are running with `docker compose ps`
- **SSL certificate errors**: Use the SSL workarounds documented above (temporarily)
- **Port conflicts**: Stop other services using ports 5173, 8000, 6379, 18888
- **Dependency conflicts**: Update OpenTelemetry versions to match as documented above

### Working with the Code
- **Making API changes**: Edit `otel_python/api/app/main.py`, then `docker compose up --build -d`
- **Making worker changes**: Edit `otel_python/api/app/worker.py`, then restart: `docker compose restart worker` 
- **Making frontend changes**: Edit files in `otel_python/frontend/src/`, Vite will hot-reload in dev mode
- **Adding dependencies**: Update `otel_python/api/requirements.txt` or `otel_python/frontend/package.json`

### Logs and Debugging
- **View all logs**: `docker compose logs`
- **View specific service logs**: `docker compose logs api` (or `worker`, `frontend`, etc.)
- **Follow logs**: `docker compose logs -f api`

## Repository Structure
```
/
├── README.md                     # Minimal repository description
└── otel_python/                  # Main demo application  
    ├── README.md                 # Application-specific documentation
    ├── docker-compose.yml        # Service orchestration
    ├── Dockerfile               # Python services (api, worker, tests)
    ├── api/
    │   ├── requirements.txt      # Python dependencies
    │   └── app/
    │       ├── main.py          # FastAPI backend
    │       └── worker.py        # Background task processor
    ├── frontend/
    │   ├── Dockerfile           # Node.js frontend
    │   ├── package.json         # npm dependencies and scripts
    │   └── src/
    │       ├── App.jsx          # React application
    │       ├── main.jsx         # React entry point
    │       └── tracing.js       # OpenTelemetry web configuration
    └── tests/
        └── test_e2e.py          # End-to-end test suite
```