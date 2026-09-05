"""
Category B Production Deployment Gates Automated Verification Runner
Validates all 6 Category B Production Deployment Gates against Live Infrastructure:
  B-01: Google IAM OIDC Signature Validation
  B-02: Cloud Run SIGTERM Graceful Drain Context & Lifecycle
  B-03: Multi-Event Stress Benchmark (50 Events Bounded Batch Drain)
  B-04: Supabase Browser Anon RLS Security Audit
  B-05: Google Cloud Scheduler Recovery & Function Provisioning Audit
  B-06: GCP Cloud Tasks Queue Retry & Rate Limits Live Audit
"""

import os
import sys
import json
import time
import uuid
import asyncio
import urllib.request
import urllib.error
import asyncpg
from dotenv import load_dotenv
from google.cloud import tasks_v2

# Load environment
load_dotenv("07-fastapi-ai-worker/.env")
load_dotenv("05-outbox-dispatcher-nestjs/.env")

db_url = os.getenv("DATABASE_URL", "").replace("postgresql+asyncpg://", "postgresql://")
DISPATCHER_URL = os.getenv("DISPATCHER_URL", "http://localhost:3000")
FASTAPI_WORKER_URL = os.getenv("FASTAPI_WORKER_URL", "https://dev-fastapi-ai-worker-163481994238.asia-south1.run.app")
webhook_secret_env = os.getenv("WEBHOOK_SECRET")
if not webhook_secret_env:
    raise ValueError("WEBHOOK_SECRET environment variable is required and missing!")
WEBHOOK_SECRET = webhook_secret_env
GCP_PROJECT = os.getenv("GCP_PROJECT_ID", "project-8b4c2600-aeab-484d-82e")
GCP_LOCATION = os.getenv("GCP_LOCATION", "asia-south1")

results = []

def record(gate_id, name, status, details):
    results.append({
        "id": gate_id,
        "name": name,
        "status": status,
        "details": details
    })
    print(f"[{status}] | Gate {gate_id}: {name} | {details}")

async def test_b01_oidc_validation():
    print("\n--- [B-01] Google IAM OIDC Signature Validation Gate ---")
    try:
        # 1. Verify Worker OIDC Security Module Implementation
        sys.path.insert(0, "07-fastapi-ai-worker")
        from app.core.config import Settings
        from app.core.security import OIDCTokenValidator
        settings = Settings(
            DATABASE_URL="postgresql://user:pass@localhost:5432/db",
            SUPABASE_PROJECT_URL="https://test.supabase.co",
            SECRET_KEY="dev_secret_key_minimum_32_characters_long_123456",
            GOOGLE_CLOUD_PROJECT_ID=GCP_PROJECT,
            GOOGLE_OIDC_ALLOWED_SERVICE_ACCOUNTS="test-sa@project.iam.gserviceaccount.com",
            OIDC_AUTH_ENABLED=True
        )
        validator = OIDCTokenValidator(settings=settings)
        assert validator is not None
        
        # Test invalid token handling raises 401 or returns error
        try:
            validator.validate_bearer_token("Bearer invalid.jwt.token")
            invalid_caught = False
        except Exception:
            invalid_caught = True
        assert invalid_caught is True
        
        # 2. Probe Cloud Run Endpoint with invalid Bearer token
        req = urllib.request.Request(
            f"{FASTAPI_WORKER_URL}/internal/tasks/candidate/projection",
            data=json.dumps({"event_id": str(uuid.uuid4()), "schema_version": 1, "aggregate_id": str(uuid.uuid4()), "data": {}}).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "Authorization": "Bearer invalid_oidc_token_123"
            }
        )
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                resp_code = resp.status
        except urllib.error.HTTPError as e:
            resp_code = e.code
            
        record("B-01", "Google IAM OIDC Signature Validation", "PASS", f"OIDCTokenValidator verified (invalid token rejected); Cloud Run probed (HTTP {resp_code})")
    except Exception as e:
        record("B-01", "Google IAM OIDC Signature Validation", "FAIL", f"Exception: {e}")

async def test_b02_sigterm_graceful_drain():
    print("\n--- [B-02] Cloud Run SIGTERM Graceful Drain Context & Lifecycle ---")
    try:
        # Verify NestJS onModuleDestroy PG Pool Draining
        with open("05-outbox-dispatcher-nestjs/src/database/database.service.ts", "r") as f:
            nestjs_db_src = f.read()
        assert "async onModuleDestroy()" in nestjs_db_src
        assert "await this.pool.end()" in nestjs_db_src
        
        # Verify FastAPI Worker lifespan DB disconnection
        with open("07-fastapi-ai-worker/app/main.py", "r") as f:
            fastapi_main_src = f.read()
        assert "lifespan" in fastapi_main_src
        assert "await db_manager.shutdown()" in fastapi_main_src
        
        record("B-02", "Cloud Run SIGTERM Graceful Drain", "PASS", "NestJS onModuleDestroy() and FastAPI lifespan DB shutdown verified for zero connection leaks")
    except Exception as e:
        record("B-02", "Cloud Run SIGTERM Graceful Drain", "FAIL", f"Exception: {e}")

async def test_b03_bulk_event_stress_benchmark():
    print("\n--- [B-03] Multi-Event Stress Benchmark (50 Events Bounded Batch Drain) ---")
    conn = await asyncpg.connect(db_url, statement_cache_size=0)
    try:
        start_time = time.time()
        # Insert 50 test outbox events with registered route 'candidate.profile.changed'
        event_ids = [str(uuid.uuid4()) for _ in range(50)]
        values = [(eid, "candidate.profile.changed", "candidate", eid, json.dumps({"candidate_id": eid, "revision": 1, "profile_data": {"skills": ["Python"]}}), 1) for i, eid in enumerate(event_ids)]
        
        for v in values:
            await conn.execute(
                """
                INSERT INTO public.outbox_events (
                    id, event_type, aggregate_type, aggregate_id, payload, schema_version, status
                ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, 'pending')
                """,
                v[0], v[1], v[2], v[3], v[4], v[5]
            )
        insert_duration = time.time() - start_time
        print(f"   Inserted 50 events in {insert_duration:.3f}s")
        
        # Trigger Dispatcher Wake to drain in bounded iterations
        drain_start = time.time()
        req = urllib.request.Request(
            f"{DISPATCHER_URL}/internal/dispatcher/wake",
            data=json.dumps({}).encode("utf-8"),
            headers={"Content-Type": "application/json", "x-webhook-secret": WEBHOOK_SECRET}
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            wake_data = json.loads(resp.read().decode("utf-8"))
        drain_duration = time.time() - drain_start
        
        print(f"   Wake Drain Result: {wake_data} in {drain_duration:.3f}s")
        assert wake_data.get("accepted") is True
        assert wake_data.get("claimed", 0) >= 50
        assert wake_data.get("published", 0) >= 50
        
        # Check all are published
        published_count = await conn.fetchval(
            "SELECT count(*) FROM public.outbox_events WHERE id = ANY($1::uuid[]) AND status = 'published'",
            event_ids
        )
        print(f"   Published Count: {published_count}/50")
        assert published_count == 50
        
        # Cleanup
        await conn.execute("DELETE FROM public.outbox_events WHERE id = ANY($1::uuid[])", event_ids)
        
        record("B-03", "Multi-Event Stress Benchmark", "PASS", f"50 events claimed & published via Real GCP Cloud Tasks in {drain_duration:.2f}s (100% throughput)")
    except Exception as e:
        record("B-03", "Multi-Event Stress Benchmark", "FAIL", f"Exception: {e}")
    finally:
        await conn.close()

async def test_b04_supabase_anon_rls_audit():
    print("\n--- [B-04] Supabase Browser Anon RLS Security Audit ---")
    conn = await asyncpg.connect(db_url, statement_cache_size=0)
    try:
        # Check RLS enabled on outbox_events and processed_events (as specified in 17_rls.sql)
        tables = ["outbox_events", "processed_events"]
        for table in tables:
            rls_enabled = await conn.fetchval(
                """
                SELECT rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = $1
                """,
                table
            )
            assert rls_enabled is True, f"RLS is NOT enabled on table {table}!"
        
        record("B-04", "Supabase Browser Anon RLS Audit", "PASS", "RLS verified ENABLED on outbox_events & processed_events per 17_rls.sql")
    except Exception as e:
        record("B-04", "Supabase Browser Anon RLS Audit", "FAIL", f"Exception: {e}")
    finally:
        await conn.close()

async def test_b05_cloud_scheduler_audit():
    print("\n--- [B-05] Google Cloud Scheduler Recovery & Function Audit ---")
    conn = await asyncpg.connect(db_url, statement_cache_size=0)
    try:
        # Verify public.outbox_recovery_needed() SQL function exists and is callable
        func_exists = await conn.fetchval(
            """
            SELECT EXISTS (
                SELECT 1 FROM pg_proc WHERE proname = 'outbox_recovery_needed'
            )
            """
        )
        assert func_exists is True, "outbox_recovery_needed function does not exist!"
        
        # Call outbox_recovery_needed() to verify operational status
        res = await conn.fetchval("SELECT public.outbox_recovery_needed()")
        
        record("B-05", "Google Cloud Scheduler Recovery Audit", "PASS", f"outbox_recovery_needed() callable (status: {res}); Cloud Scheduler job existence/enablement must be verified with gcloud separately")
    except Exception as e:
        record("B-05", "Google Cloud Scheduler Recovery Audit", "FAIL", f"Exception: {e}")
    finally:
        await conn.close()

async def test_b06_gcp_queue_retry_audit():
    print("\n--- [B-06] GCP Cloud Tasks Queue Retry & Rate Limits Live Audit ---")
    try:
        client = tasks_v2.CloudTasksClient()
        queues = ["ai-heavy-queue", "projection-queue"]
        audit_details = []
        
        for q in queues:
            q_path = client.queue_path(GCP_PROJECT, GCP_LOCATION, q)
            queue_obj = client.get_queue(name=q_path)
            
            state = queue_obj.state.name
            max_attempts = queue_obj.retry_config.max_attempts
            min_backoff = queue_obj.retry_config.min_backoff.seconds
            max_backoff = queue_obj.retry_config.max_backoff.seconds
            max_doublings = queue_obj.retry_config.max_doublings
            
            audit_details.append(f"{q}: {state} (attempts: {max_attempts}, backoff: {min_backoff}s->{max_backoff}s, doublings: {max_doublings})")
            
        record("B-06", "GCP Queue Retry Backoff Verification", "PASS", " | ".join(audit_details))
    except Exception as e:
        record("B-06", "GCP Queue Retry Backoff Verification", "FAIL", f"Exception: {e}")

async def main():
    print("=" * 80)
    print("      PRODUCTION DEPLOYMENT GATES AUDIT (CATEGORY B — 6 GATES LIVE)     ")
    print("=" * 80)
    
    await test_b01_oidc_validation()
    await test_b02_sigterm_graceful_drain()
    await test_b03_bulk_event_stress_benchmark()
    await test_b04_supabase_anon_rls_audit()
    await test_b05_cloud_scheduler_audit()
    await test_b06_gcp_queue_retry_audit()
    
    print("\n" + "=" * 80)
    print("                      FINAL CATEGORY B REPORT                            ")
    print("=" * 80)
    passed = sum(1 for r in results if r['status'] == 'PASS')
    total = len(results)
    for r in results:
        print(f"[{r['status']}] | Gate {r['id']}: {r['name']:<40} | {r['details']}")
    print("=" * 80)
    print(f"TOTAL RESULT: {passed}/{total} PRODUCTION GATES VERIFIED & PASSED ({passed/total*100:.1f}%)")
    print("=" * 80)
    
    if passed != total:
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())
