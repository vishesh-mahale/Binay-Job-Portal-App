# Google Cloud Tasks & Dispatcher — Local Testing Options & Architecture Blueprint

[← Main README](../README.md) · [System Architecture Diagram](../docs/architecture/ARCHITECTURE-DIAGRAM.md) · [Outbox Dispatcher README](README.md) · [Implementation Plan](IMPLEMENTATION-PLAN.md)

---

## 1. Context & Objective

Production environment mein **Outbox Dispatcher** (`05-outbox-dispatcher-nestjs`) events ko **Google Cloud Tasks** queue mein push karta hai, jo OIDC tokens ke sath **FastAPI AI Worker** (`07-fastapi-ai-worker`) ko trigger karta hai.

Local developer machine par is pure flow ko test karne ke liye hamare paas **4 Distinct Architecture Options** hain:

```text
                               ┌─► Option 1: Direct Mode (Zero Setup, In-Memory)
                               ├─► Option 2: Real GCP Tasks + ngrok / DevTunnel (100% Prod Fidelity)
Local Testing Options Available ┼─► Option 3: Real GCP Tasks + Deployed Cloud Run (Hybrid Cloud Dev)
                               └─► Option 4: Local Docker Emulator (Offline Queue Simulation)
```

---

## 2. Comparison Matrix

| Option | Architecture Flow | Real GCP Queue? | Offline / Tunnel? | Setup Time | Best Used For |
|---|---|:---:|:---:|:---:|---|
| **Option 1: Direct Mode** *(Built-in)* | `Dispatcher ➔ Direct HTTP ➔ Local FastAPI` | ❌ No (In-Memory) | 🟢 100% Offline (No Tunnel) | **0 Mins** (Already Built) | **Daily Feature Dev & Instant Unit Tests** |
| **Option 2: Real GCP + Tunnel (ngrok)** | `Dispatcher ➔ Real GCP Tasks ➔ ngrok ➔ Local FastAPI` | ✅ Yes (100% Real GCP) | 🟡 Needs ngrok / Tunnel | **2 Mins** | **100% Production Accuracy & Cloud SDK Verification** |
| **Option 3: Real GCP + Deployed Cloud Run** | `Dispatcher ➔ Real GCP Tasks ➔ Dev Cloud Run FastAPI` | ✅ Yes (100% Real GCP) | 🟢 No Tunnel Needed | **5 Mins** | **Full Cloud Integration Testing** |
| **Option 4: Local Docker Emulator** | `Dispatcher ➔ Local Emulator (8123) ➔ Local FastAPI` | ❌ No (Local Mock) | 🟢 100% Offline (Docker) | **5 Mins** | **Offline Queue Rate-Limit & Delay Testing** |

---

## 3. Deep Dive: The 4 Architecture Options

---

### 🌟 Option 1: Direct Mode (`DISPATCH_MODE=direct`) — *[Fastest Development Loop]*

Dispatcher internet ke zariye Supabase Cloud DB se row claim karta hai aur bina kisi external queue ke seedha local FastAPI endpoint ko call karta hai.

#### Architecture Flow:
```mermaid
flowchart TD
    subgraph Cloud_Services["☁️ Supabase Cloud (Internet / AWS ap-south-1)"]
        DB[("Supabase PostgreSQL DB\n(outbox_events)")]
    end

    subgraph Local_Machine["💻 Local Developer Machine (Laptop)"]
        Dispatcher["05-outbox-dispatcher-nestjs\n(DISPATCH_MODE=direct)"]
        FastAPI["07-fastapi-ai-worker\n(http://127.0.0.1:8080)"]
        
        Dispatcher -->|"2. Direct HTTP POST"| FastAPI
        FastAPI -->|"3. 200 OK Response"| Dispatcher
    end

    DB -->|"1. Outbound Claim Batch"| Dispatcher
    Dispatcher -->|"4. Mark Event Published"| DB
```

#### `.env` Configuration (`05-outbox-dispatcher-nestjs/.env`):
```env
PORT=3000
DATABASE_URL=postgresql://postgres.xxx:password@aws-0-ap-south-1.pooler.supabase.com:6543/postgres
DISPATCH_MODE=direct
FASTAPI_WORKER_URL=http://127.0.0.1:8080
WEBHOOK_SECRET=dev-secret
```

#### How to Run:
```bash
# Terminal 1: FastAPI AI Worker
cd 07-fastapi-ai-worker
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8080

# Terminal 2: Outbox Dispatcher
cd 05-outbox-dispatcher-nestjs
npm.cmd run start:dev
```
* **Pros:** Zero setup, zero cloud credentials, instant execution (< 10ms), in-memory task deduplication.
* **Cons:** Does not test Google Cloud Tasks client library.

---

### 🌟 Option 2: Real GCP Cloud Tasks + ngrok / DevTunnel — *[100% Production Fidelity]*

Dispatcher Google Cloud Tasks API mein real task create karta hai. GCP queue internet ke zariye aapke local FastAPI worker ko task deliver karti hai.

#### Architecture Flow:
```mermaid
flowchart TD
    subgraph Cloud_Services["☁️ Cloud Infrastructure (Internet)"]
        DB[("Supabase PostgreSQL DB\n(outbox_events)")]
        GCP_Tasks["Google Cloud Tasks Queue\n(ai-heavy-queue)"]
    end

    subgraph Local_Machine["💻 Local Developer Machine (Laptop)"]
        Dispatcher["05-outbox-dispatcher-nestjs\n(gcloud auth ADC)"]
        Tunnel["ngrok / VS Code DevTunnel\n(https://xyz.ngrok-free.app)"]
        FastAPI["07-fastapi-ai-worker\n(localhost:8080)"]
        
        Tunnel -->|"4. Forward Task to Worker"| FastAPI
    end

    DB -->|"1. Claim Batch"| Dispatcher
    Dispatcher -->|"2. Create Task via SDK"| GCP_Tasks
    GCP_Tasks -->|"3. Deliver Task HTTPS"| Tunnel
    FastAPI -->|"5. 200 OK Delivery Ack"| GCP_Tasks
    Dispatcher -->|"6. Mark Event Published"| DB
```

#### Setup & Steps:
1. **Local FastAPI expose karein:**
   ```bash
   # Option A: ngrok
   ngrok http 8080
   # -> Gives: https://abc1234.ngrok-free.app

   # Option B: VS Code built-in Ports tab
   # Forward port 8080 -> Visibility Public -> Copy generated https:// URL
   ```
2. **Google Cloud ADC login:**
   ```bash
   gcloud auth application-default login
   ```
3. **Dispatcher `.env`:**
   ```env
   DISPATCH_MODE=cloud_tasks
   GCP_PROJECT_ID=project-8b4c2600-aeab-484d-82e
   GCP_LOCATION=asia-south1
   FASTAPI_WORKER_URL=https://abc1234.ngrok-free.app
   WEBHOOK_SECRET=dev-secret
   ```
* **Pros:** 100% Real Google Cloud Tasks behavior (GCP Free tier: 10,00,000 tasks/month free), real retries & task deduplication.
* **Cons:** Requires active tunnel and internet connection.

---

### 🌟 Option 3: Real GCP Cloud Tasks + Deployed Dev Cloud Run — *[Zero Tunnel Hybrid]*

Dispatcher local machine par chalta hai, Real GCP Tasks queue mein task banata hai, aur queue deployed Dev Cloud Run Worker ko trigger karti hai.

#### Architecture Flow:
```mermaid
flowchart TD
    subgraph Cloud_Services["☁️ Cloud Infrastructure (Internet)"]
        DB[("Supabase PostgreSQL DB\n(outbox_events)")]
        GCP_Tasks["Google Cloud Tasks Queue\n(ai-heavy-queue)"]
        CloudRun_Worker["Deployed Dev Cloud Run Worker\n(https://dev-worker-xyz.run.app)"]
        
        GCP_Tasks -->|"3. OIDC Invoke Task"| CloudRun_Worker
        CloudRun_Worker -->|"4. Process & Save Results"| DB
    end

    subgraph Local_Machine["💻 Local Developer Machine (Laptop)"]
        Dispatcher["05-outbox-dispatcher-nestjs\n(gcloud auth ADC)"]
    end

    DB -->|"1. Claim Batch"| Dispatcher
    Dispatcher -->|"2. Create Task via SDK"| GCP_Tasks
    Dispatcher -->|"5. Mark Event Published"| DB
```

#### Dispatcher `.env`:
```env
DISPATCH_MODE=cloud_tasks
GCP_PROJECT_ID=project-8b4c2600-aeab-484d-82e
GCP_LOCATION=asia-south1
FASTAPI_WORKER_URL=https://dev-fastapi-worker-xyz.a.run.app
WEBHOOK_SECRET=dev-secret
```
* **Pros:** 100% Production accurate, laptop par kisi tunnel ya port forwarding ki zaroorat nahi.
* **Cons:** Requires deploying FastAPI to Cloud Run once.

---

### 🌟 Option 4: Local Docker Emulator (`cloud-tasks-emulator`) — *[Offline Queue Simulation]*

Docker container ke andar open-source Cloud Tasks emulator chalta hai jo rate limiting aur task scheduling ko locally simulate karta hai.

#### Architecture Flow:
```mermaid
flowchart TD
    subgraph Cloud_Services["☁️ Supabase Cloud (Internet)"]
        DB[("Supabase PostgreSQL DB\n(outbox_events)")]
    end

    subgraph Local_Machine["💻 Local Developer Machine (Laptop)"]
        Dispatcher["05-outbox-dispatcher-nestjs"]
        Emulator["Docker Cloud Tasks Emulator\n(http://localhost:8123)"]
        FastAPI["07-fastapi-ai-worker\n(http://localhost:8080)"]
        
        Dispatcher -->|"2. gRPC/HTTP Task"| Emulator
        Emulator -->|"3. Rate-Limited Dispatch"| FastAPI
    end

    DB -->|"1. Claim Batch"| Dispatcher
    Dispatcher -->|"4. Mark Event Published"| DB
```

#### Run Emulator:
```bash
docker run -p 8123:8123 ghcr.io/aertje/cloud-tasks-emulator -p 8123
```
* **Pros:** Offline testing with queue rate limits (e.g. max 3 dispatches/sec).
* **Cons:** Third-party community tool, requires Docker.

---

## 4. Recommended Decision Tree

```text
Aapko kya test karna hai?
   │
   ├─► Rapid coding, bug fixes, or daily feature work?
   │   └─► USE OPTION 1 (Direct Mode — 0 setup, instant feedback)
   │
   ├─► Google Cloud Tasks SDK & real queue delivery locally?
   │   └─► USE OPTION 2 (Real GCP + ngrok / DevTunnel)
   │
   ├─► End-to-end integration before production deployment?
   │   └─► USE OPTION 3 (Real GCP + Deployed Cloud Run)
   │
   └─► Offline queue burst/stress test without GCP account?
       └─► USE OPTION 4 (Docker Emulator)
```
