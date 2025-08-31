# OpenTelemetry Python Demo

Always reference these instructions first and fallback to additional search or bash commands only when you encounter unexpected information that does not match the info here.

This is an OpenTelemetry demonstration application featuring a React frontend, FastAPI backend, background worker, and Redis queue system. All components are instrumented to send traces to an Aspire dashboard for observability.

## Critical Build Information

**NEVER CANCEL builds or long-running commands.** Build processes may take 15+ minutes due to dependency downloads and network limitations.

### Network/SSL Issues in Sandbox Environments
- Docker builds MAY FAIL due to SSL certificate verification or DNS resolution issues in restricted environments
- Python pip installs REQUIRE trusted host flags: `--trusted-host pypi.org --trusted-host pypi.python.org --trusted-host files.pythonhosted.org`
- NPM installs MAY FAIL due to registry access restrictions

## Working Effectively

### Primary Development Approach (Docker Compose)
```bash
# Navigate to project
cd otel_python

# Build all services - NEVER CANCEL, set timeout to 20+ minutes
docker compose build

# Run the full stack - NEVER CANCEL
docker compose up

# Access points:
# - Frontend: http://localhost:5173
# - API: http://localhost:8000
# - Aspire Dashboard: http://localhost:18888
# - Redis: localhost:6379
```

**Build Timing Expectations:**
- Docker compose build: 15-20 minutes on first run (NEVER CANCEL)
- Subsequent builds: 2-5 minutes (cached layers)

### Alternative: Local Development (When Docker fails)
```bash
# Python backend setup
cd otel_python
python3 -m venv venv
source venv/bin/activate
pip install --trusted-host pypi.org --trusted-host pypi.python.org --trusted-host files.pythonhosted.org -r api/requirements.txt

# Start backend services (requires separate terminals)
# Terminal 1 - Redis (if available locally)
redis-server

# Terminal 2 - API
cd api
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
export OTEL_SERVICE_NAME=api
opentelemetry-instrument uvicorn app.main:app --host 0.0.0.0 --port 8000

# Terminal 3 - Worker  
cd api
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
export OTEL_SERVICE_NAME=worker
opentelemetry-instrument python -m app.worker

# Frontend setup (if npm works)
cd frontend
npm install
npm run dev
```

## Testing

### End-to-End Tests
```bash
# Via Docker Compose (recommended)
docker compose run --rm tests

# Local testing (requires running stack)
cd otel_python
source venv/bin/activate
python -m unittest tests/test_e2e.py -v
```

**Test Timing:** E2E tests take 30-60 seconds to complete. NEVER CANCEL.

### Manual Validation Scenarios
Always perform these validation steps after making changes:

1. **Task Processing Workflow:**
   - Navigate to http://localhost:5173
   - Enter text in the input field
   - Click "Task1" button (should reverse the text)
   - Click "Task2" button (should uppercase the text)  
   - Click "Task3" button (should add "processed:" prefix after 1-second delay)
   - Verify tasks complete successfully in backend logs

2. **API Direct Testing:**
   ```bash
   # Test task submission
   curl -X POST http://localhost:8000/task1 -H "Content-Type: application/json" -d '"hello"'
   
   # Test result retrieval (use task_id from above)
   curl http://localhost:8000/result/{task_id}
   ```

3. **OpenTelemetry Tracing:**
   - Access Aspire dashboard at http://localhost:18888
   - Verify traces appear for frontend requests, API calls, and worker processing
   - Confirm trace correlation across all three services

## Repository Structure

### Key Files and Directories
```
otel_python/
├── docker-compose.yml          # Orchestrates all services
├── Dockerfile                  # Python services (API + worker)
├── api/
│   ├── requirements.txt        # Python dependencies
│   └── app/
│       ├── main.py            # FastAPI application
│       └── worker.py          # Background task processor
├── frontend/
│   ├── Dockerfile             # Node.js frontend
│   ├── package.json           # NPM dependencies
│   └── src/
│       ├── App.jsx           # React main component
│       ├── main.jsx          # React entry point
│       └── tracing.js        # OpenTelemetry browser setup
└── tests/
    └── test_e2e.py           # End-to-end test suite
```

### Application Architecture
- **Frontend:** React app with OpenTelemetry instrumentation for fetch requests
- **API:** FastAPI with three task endpoints (/task1, /task2, /task3) and result retrieval
- **Worker:** Processes tasks from Redis queue (reverse, uppercase, slow operations)
- **Redis:** Task queue and result storage
- **Aspire:** OpenTelemetry trace collection and visualization

## Known Issues and Workarounds

### SSL Certificate Issues
If pip or npm fail with SSL errors:
```bash
# Python
pip install --trusted-host pypi.org --trusted-host pypi.python.org --trusted-host files.pythonhosted.org

# Node.js (try alternative registries)
npm config set registry https://registry.npmmirror.com
```

### Dependency Conflicts
- The requirements.txt has been fixed to use compatible OpenTelemetry versions
- If you encounter version conflicts, ensure opentelemetry-distro matches instrumentation package versions

### Network Issues in Restricted Environments
- Docker builds may fail due to DNS/firewall restrictions
- Use local development approach as fallback
- Document any persistent issues as "fails due to network limitations"

## Build Validation

Before committing changes, ALWAYS:
1. Build the Docker images successfully (or document failure reason)
2. Run the end-to-end test suite
3. Manually verify at least one complete task workflow
4. Check that OpenTelemetry traces are generated

**Expected Timing Summary:**
- Docker build: 15-20 minutes (NEVER CANCEL)
- E2E tests: 30-60 seconds
- Manual validation: 2-3 minutes per scenario

## Critical Notes

- NEVER CANCEL long-running builds or tests
- Always set timeouts of 30+ minutes for Docker operations
- Document any network-related failures as environment limitations
- Use trusted host flags for all Python package installations
- Test both Docker and local development approaches when possible