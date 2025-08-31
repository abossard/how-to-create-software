# 🚀 OpenTelemetry Python Demo

> A distributed tracing demonstration featuring React frontend, FastAPI backend, Redis message queue, and comprehensive observability! 🎯

This demo showcases modern distributed systems with full OpenTelemetry integration. Experience real-time task processing across multiple services while observing traces, metrics, and performance insights through the beautiful Aspire dashboard! ✨

## 🏗️ Architecture Overview

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   🌐 Frontend   │    │   🔥 FastAPI    │    │   🔧 Worker     │
│   React + Vite  │───▶│     Backend     │───▶│   Background    │
│   Port: 5173    │    │   Port: 8000    │    │   Processor     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         │              ┌─────────────────┐              │
         │              │   📦 Redis      │              │
         └──────────────│   Message Queue │◀─────────────┘
                        │   Port: 6379    │
                        └─────────────────┘
                                 │
                        ┌─────────────────┐
                        │  📊 Aspire      │
                        │  Dashboard      │
                        │  Port: 18888    │
                        └─────────────────┘
```

### 🎭 Components

- **🌐 Frontend**: React application with OpenTelemetry web tracing
- **🔥 API**: FastAPI backend with three task endpoints (`/task1`, `/task2`, `/task3`)
- **🔧 Worker**: Background processor consuming tasks from Redis queue
- **📦 Redis**: Message queue and result storage
- **📊 Aspire**: .NET OpenTelemetry dashboard for observability

### 🎯 Task Types

1. **Task1** 🔄: String reversal (`"hello"` → `"olleh"`)
2. **Task2** 📢: Uppercase conversion (`"hello"` → `"HELLO"`)
3. **Task3** ⏱️: Slow processing with 1s delay (`"hello"` → `"processed:hello"`)

## 🚀 Quick Start

### 🎬 Starting the Stack

```bash
# 🏗️ Build and start all services
docker compose up --build -d

# 🎉 That's it! Services are now running:
# 🌐 Frontend:   http://localhost:5173
# 🔥 API:        http://localhost:8000  
# 📊 Dashboard:  http://localhost:18888
# 📦 Redis:      localhost:6379
```

### 📊 Open Observability Dashboard

**One-liner to open dashboard:** 🎯
```bash
./open-dashboard.sh
```

**Manual access:**
```bash
# Open in your browser
open http://localhost:18888    # macOS
xdg-open http://localhost:18888 # Linux
# Or just visit: http://localhost:18888
```

### 🛑 Stopping the Stack

```bash
# 🛑 Stop all services gracefully
docker compose down

# 🧹 Stop and remove volumes (clean slate)
docker compose down -v

# 🗑️ Stop and remove everything including images
docker compose down -v --rmi all
```

## 🧪 Testing & Usage

### 🔬 Run Tests

```bash
# 🏃‍♂️ Run end-to-end tests
docker compose run --rm tests

# 📊 Expected output:
# test_task1_reverse ... ok
# test_task2_uppercase ... ok  
# test_task3_slow ... ok
# ✅ Ran 3 tests in ~2s - OK
```

### 🎮 Manual Testing

```bash
# 🔄 Test Task1 (reverse)
TASK_ID=$(curl -s -X POST http://localhost:8000/task1 \
  -H "Content-Type: application/json" \
  -d '"hello world"' | jq -r .task_id)
sleep 2
curl http://localhost:8000/result/$TASK_ID
# Result: {"status":"done","result":"dlrow olleh"}

# 📢 Test Task2 (uppercase)  
TASK_ID=$(curl -s -X POST http://localhost:8000/task2 \
  -H "Content-Type: application/json" \
  -d '"hello world"' | jq -r .task_id)
sleep 2
curl http://localhost:8000/result/$TASK_ID
# Result: {"status":"done","result":"HELLO WORLD"}

# ⏱️ Test Task3 (slow processing)
TASK_ID=$(curl -s -X POST http://localhost:8000/task3 \
  -H "Content-Type: application/json" \
  -d '"hello world"' | jq -r .task_id)
sleep 3
curl http://localhost:8000/result/$TASK_ID
# Result: {"status":"done","result":"processed:hello world"}
```

### 🎨 Frontend Usage

1. 🌐 Visit http://localhost:5173
2. ✍️ Enter text in the input field
3. 🔘 Click any task button (Task1, Task2, Task3)
4. 📊 Watch traces appear in the Aspire dashboard!

## 🔍 Observability Features

### 📊 What You'll See in Aspire Dashboard

- **🎯 Distributed Traces**: Follow requests across all services
- **📈 Metrics**: Performance and throughput statistics  
- **🔗 Dependencies**: Service interconnection maps
- **⏱️ Latency**: Response time analysis
- **🚨 Errors**: Exception tracking and debugging

### 🎭 Trace Examples

- **Frontend → API**: HTTP request traces with timing
- **API → Redis**: Queue operations and storage
- **Worker Processing**: Task execution spans
- **Cross-Service**: Complete request lifecycle

## 🛠️ Development Tips

### 🏃‍♂️ Local Development

```bash
# 🚀 Start individual services for debugging
docker compose up redis aspire -d    # Start dependencies
cd api && uvicorn app.main:app --reload  # API with hot reload
cd frontend && npm run dev            # Frontend with hot reload
python api/app/worker.py             # Worker locally
```

### 📝 Service Logs

```bash
# 📋 View all logs
docker compose logs

# 🔍 Follow specific service logs
docker compose logs -f api
docker compose logs -f worker
docker compose logs -f frontend

# 🎯 View last 50 lines
docker compose logs --tail=50 api
```

### 🔧 Configuration

| Service | Environment Variable | Description |
|---------|---------------------|-------------|
| All | `OTEL_EXPORTER_OTLP_ENDPOINT` | OpenTelemetry collector endpoint |
| API/Worker | `OTEL_SERVICE_NAME` | Service name in traces |
| Frontend | `VITE_OTEL_ENDPOINT` | OpenTelemetry endpoint for browser |
| Frontend | `VITE_API_URL` | Backend API URL |

## 🚨 Troubleshooting

### 🔧 Common Issues

**❌ "Cannot connect to API"**
```bash
# Check if services are running
docker compose ps
# Restart if needed  
docker compose restart api worker
```

**❌ "Dashboard not accessible"**
```bash
# Verify Aspire is running
curl http://localhost:18888
# Restart if needed
docker compose restart aspire
```

**❌ "Tests failing"**
```bash
# Check all services are healthy
docker compose ps
# View logs for errors
docker compose logs api worker
```

**❌ "Port conflicts"**
```bash
# Check what's using the ports
netstat -tulpn | grep -E ':(5173|8000|6379|18888)'
# Stop conflicting services or change ports in docker-compose.yml
```

### 🩺 Health Checks

```bash
# 🔍 Quick health check
curl http://localhost:8000     # API health
curl http://localhost:5173     # Frontend health  
curl http://localhost:18888    # Dashboard health
redis-cli -p 6379 ping        # Redis health
```

## 🎉 Fun Facts

- 🚀 **Ultra-fast**: Tasks process in milliseconds (except Task3's intentional delay)
- 🔍 **Observable**: Every request creates detailed traces
- 🎯 **Scalable**: Add more workers by scaling: `docker compose up --scale worker=3`
- 🌈 **Modern**: Uses latest OpenTelemetry standards
- 🎭 **Educational**: Perfect for learning distributed tracing

## 📚 Learn More

- 🔗 [OpenTelemetry Documentation](https://opentelemetry.io/docs/)
- 🎯 [Aspire Dashboard Guide](https://learn.microsoft.com/en-us/dotnet/aspire/fundamentals/dashboard)
- ⚡ [FastAPI Documentation](https://fastapi.tiangolo.com/)
- ⚛️ [React Documentation](https://react.dev/)

---

**🎉 Happy tracing!** Remember: every request tells a story, and now you can see it! 📊✨
