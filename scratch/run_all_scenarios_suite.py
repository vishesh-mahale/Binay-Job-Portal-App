import asyncio
import uuid
import json
import os
import sys
import urllib.request
import urllib.error
import asyncpg
from dotenv import load_dotenv

load_dotenv('07-fastapi-ai-worker/.env')
db_url = os.getenv('DATABASE_URL', '').replace('postgresql+asyncpg://', 'postgresql://')

# Safety guard: Never run smoke suite against production DB
assert "prod" not in db_url.lower(), "Safety Guard: Do not run smoke suite against production database!"

DISPATCHER_URL = os.getenv("DISPATCHER_URL", "http://localhost:3000")
FASTAPI_DEV_TUNNEL = os.getenv("FASTAPI_DEV_TUNNEL", "http://localhost:8080")
webhook_secret_env = os.getenv("WEBHOOK_SECRET")
if not webhook_secret_env:
    raise ValueError("WEBHOOK_SECRET environment variable is required and missing!")
WEBHOOK_SECRET = webhook_secret_env

def trigger_wake(secret=WEBHOOK_SECRET):
    req = urllib.request.Request(
        f"{DISPATCHER_URL}/internal/dispatcher/wake",
        data=json.dumps({}).encode('utf-8'),
        headers={
            "Content-Type": "application/json",
            "x-webhook-secret": secret
        }
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode('utf-8'))

async def run_scenario_1_happy_path(conn):
    print("\n--------------------------------------------------------------------------")
    print(" [SCENARIO A-01] HAPPY PATH E2E (Dispatcher -> GCP Tasks -> FastAPI -> DB)")
    print("--------------------------------------------------------------------------")
    cand = await conn.fetchrow("SELECT id, user_id FROM candidate_profiles ORDER BY created_at DESC LIMIT 1")
    if not cand:
        return False, "No candidate_profiles found in DB"
    candidate_id = cand['id']
    event_id = uuid.uuid4()
    
    payload = {
        "schema_version": 1,
        "event_id": str(event_id),
        "aggregate_id": str(candidate_id),
        "trace_id": str(event_id),
        "candidate_id": str(candidate_id),
        "change_type": "experience_added"
    }

    # 1. Insert outbox
    await conn.execute("""
        INSERT INTO outbox_events (id, aggregate_type, aggregate_id, event_type, payload, status)
        VALUES ($1, 'candidate', $2, 'candidate.profile.changed', $3::jsonb, 'pending')
    """, event_id, candidate_id, json.dumps(payload))
    
    # 2. Wake
    resp = trigger_wake()
    print(f"   Dispatcher Wake Response: {resp}")

    # 3. Poll for processed_events
    for _ in range(20):
        await asyncio.sleep(1)
        oe = await conn.fetchrow("SELECT status, task_name FROM outbox_events WHERE id = $1", event_id)
        pe = await conn.fetchrow("SELECT consumer_name, processed_at FROM processed_events WHERE event_id = $1", event_id)
        if oe and oe['status'] == 'published' and pe:
            print(f"   [PASS] Outbox published (Task: {oe['task_name'][:20]}...)")
            print(f"   [PASS] Processed by '{pe['consumer_name']}' at {pe['processed_at']}")
            return True, "Happy path E2E delivered & recorded in DB"

    return False, "Timed out waiting for processed_events"

async def run_scenario_2_duplicate_idempotency(conn):
    print("\n--------------------------------------------------------------------------")
    print(" [SCENARIO A-08] DUPLICATE TASK DELIVERY (FastAPI Idempotency Guard)")
    print("--------------------------------------------------------------------------")
    pe = await conn.fetchrow("SELECT event_id, consumer_name FROM processed_events ORDER BY processed_at DESC LIMIT 1")
    if not pe:
        return False, "No existing processed event found"
    
    event_id = str(pe['event_id'])
    print(f"   Testing Duplicate Submission with already processed Event: {event_id}")

    cand = await conn.fetchrow("SELECT id FROM candidate_profiles ORDER BY created_at DESC LIMIT 1")
    cand_id = str(cand['id']) if cand else "f754c22f-97dd-4b88-b0e5-f52b3bc3a8b1"

    payload = {
        "schema_version": 1,
        "event_id": event_id,
        "aggregate_id": cand_id,
        "trace_id": event_id
    }
    
    req = urllib.request.Request(
        f"{FASTAPI_DEV_TUNNEL}/internal/tasks/candidate/projection",
        data=json.dumps(payload).encode('utf-8'),
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req) as resp:
        body = json.loads(resp.read().decode('utf-8'))
        print(f"   FastAPI Response on duplicate: {body}")
        if body.get("status") == "success" and body.get("skipped") is True:
            print("   [PASS] Duplicate cleanly skipped by idempotency guard (Zero duplicate work)")
            return True, "FastAPI idempotency skipped duplicate task"

    return False, f"Unexpected response: {body}"

async def run_scenario_3_unknown_route(conn):
    print("\n--------------------------------------------------------------------------")
    print(" [SCENARIO A-06] UNKNOWN / UNROUTED EVENT (Fail-Closed Safety Guard)")
    print("--------------------------------------------------------------------------")
    event_id = uuid.uuid4()
    dummy_id = uuid.uuid4()
    
    await conn.execute("""
        INSERT INTO outbox_events (id, aggregate_type, aggregate_id, event_type, payload, status)
        VALUES ($1, 'unknown_aggregate', $2, 'notification.sms.unsupported', '{\"dummy\": true}'::jsonb, 'pending')
    """, event_id, dummy_id)
    print(f"   Inserted unrouted event: 'notification.sms.unsupported' ({event_id})")

    resp = trigger_wake()
    print(f"   Dispatcher Wake Response: {resp}")

    await asyncio.sleep(1)
    row = await conn.fetchrow("SELECT status, last_error FROM outbox_events WHERE id = $1", event_id)
    print(f"   Outbox Row Status: {row['status']}, Last Error: {row['last_error']}")
    
    if row['status'] == 'failed' and 'unknown_route' in str(row['last_error']):
        print("   [PASS] Fail-closed policy caught unrouted event and marked failed (No queue blockage)")
        return True, "Unregistered event caught & failed-closed"
    
    return False, f"Unexpected row state: {dict(row)}"

async def run_scenario_4_contract_validation():
    print("\n--------------------------------------------------------------------------")
    print(" [SCENARIO A-13] TASK CONTRACT VALIDATION (Pydantic 422 Rejection)")
    print("--------------------------------------------------------------------------")
    payload = {
        "schema_version": 0,  # Invalid: schema_version must be >= 1
        "event_id": "test-event-id",
        "aggregate_id": "test-agg-id"
    }
    req = urllib.request.Request(
        f"{FASTAPI_DEV_TUNNEL}/internal/tasks/candidate/projection",
        data=json.dumps(payload).encode('utf-8'),
        headers={"Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(req) as resp:
            return False, f"Expected 422, got {resp.status}"
    except urllib.error.HTTPError as e:
        print(f"   FastAPI HTTP Error Code: {e.code}")
        body = json.loads(e.read().decode('utf-8'))
        print(f"   FastAPI Validation Details: {body}")
        if e.code == 422:
            print("   [PASS] Malformed contract rejected with 422 Unprocessable Entity")
            return True, "Invalid schema rejected with 422"
    return False, "Failed contract validation"

async def run_scenario_5_webhook_auth_rejection():
    print("\n--------------------------------------------------------------------------")
    print(" [SCENARIO A-09] WEBHOOK AUTH REJECTION (Invalid Secret -> 401)")
    print("--------------------------------------------------------------------------")
    try:
        trigger_wake(secret="completely-wrong-secret")
        return False, "Expected 401 Unauthorized"
    except urllib.error.HTTPError as e:
        print(f"   Dispatcher HTTP Status Code: {e.code}")
        if e.code == 401:
            print("   [PASS] Webhook secret guard rejected invalid secret with 401")
            return True, "Invalid secret rejected with 401"
    return False, "Failed webhook auth test"

async def run_scenario_6_concurrent_wake_storm():
    print("\n--------------------------------------------------------------------------")
    print(" [SCENARIO A-15] CONCURRENT WAKE STORM (Single-Flight Latching & Metric Assertion)")
    print("--------------------------------------------------------------------------")
    print("   Firing 10 concurrent requests to POST /internal/dispatcher/wake...")
    
    async def call_wake_async():
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, trigger_wake)

    tasks = [call_wake_async() for _ in range(10)]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    
    accepted_count = sum(1 for r in results if isinstance(r, dict) and r.get('accepted') is True)
    print(f"   Received responses for 10 concurrent wakes: {accepted_count}/10 Accepted (200 OK)")
    
    executed_responses = [r for r in results if isinstance(r, dict) and 'iterations' in r]
    print(f"   Executed batch responses returned metrics: {executed_responses}")
    
    all_iterations_valid = (
        len(executed_responses) >= 1
        and all(
            r.get('iterations', 0) >= 1 and r.get('budget_exhausted') is False
            for r in executed_responses
        )
    )
    
    if accepted_count == 10 and all_iterations_valid:
        print("   [PASS] Single-flight latching confirmed (len >= 1, iterations >= 1, budget_exhausted: false)")
        return True, "10/10 concurrent wakes safely latched & verified"
    
    return False, f"Metrics assertion failed on results: {results}"

async def run_scenario_7_recovery_behavior_check(conn):
    print("\n--------------------------------------------------------------------------")
    print(" [SCENARIO A-10] OUTBOX RECOVERY STATE-TRANSITION CHECK (outbox_recovery_needed)")
    print("--------------------------------------------------------------------------")
    # Step 0: Baseline check
    trigger_wake()
    await asyncio.sleep(0.5)
    pre_check = await conn.fetchval("SELECT public.outbox_recovery_needed();")
    print(f"   0. Baseline outbox_recovery_needed() before insertion: {pre_check}")
    
    # Step 1: Insert pending event
    temp_event_id = uuid.uuid4()
    dummy_id = uuid.uuid4()
    await conn.execute("""
        INSERT INTO outbox_events (id, aggregate_type, aggregate_id, event_type, payload, status)
        VALUES ($1, 'recovery_test', $2, 'notification.test.recovery', '{\"temp\": true}'::jsonb, 'pending')
    """, temp_event_id, dummy_id)
    
    post_insert_check = await conn.fetchval("SELECT public.outbox_recovery_needed();")
    print(f"   1. outbox_recovery_needed() after pending row: {post_insert_check} (Assert: True)")
    
    # Step 2: Drain via approved Dispatcher procedure
    resp = trigger_wake()
    print(f"   2. Draining recovery test event via approved Dispatcher procedure: {resp}")
    
    row = await conn.fetchrow("SELECT status, last_error FROM outbox_events WHERE id = $1", temp_event_id)
    print(f"   3. Final row state: status = '{row['status']}', error = '{row['last_error']}'")
    
    state_transition_valid = (pre_check is False) and (post_insert_check is True) and (row['status'] == 'failed')
    
    if state_transition_valid:
        print("   [PASS] Strict state transition verified: False -> True -> Drained to lifecycle-safe failed state")
        return True, "Recovery state-transition (False -> True -> Drained) verified via approved procedures"
    
    return False, f"State transition failure: pre={pre_check}, post={post_insert_check}, final_row={dict(row) if row else None}"

async def main():
    print("==========================================================================")
    print("       OUTBOX DISPATCHER & CLOUD TASKS: UNIFIED SMOKE TEST SUITE          ")
    print("==========================================================================")
    
    try:
        conn = await asyncpg.connect(db_url, statement_cache_size=0)
    except Exception as e:
        print(f"FATAL: Could not connect to PostgreSQL database: {e}")
        sys.exit(1)
    
    tests = [
        ("Scenario A-01: Happy Path E2E", run_scenario_1_happy_path, [conn]),
        ("Scenario A-08: Worker Duplicate Idempotency", run_scenario_2_duplicate_idempotency, [conn]),
        ("Scenario A-06: Unknown Route Fail-Closed", run_scenario_3_unknown_route, [conn]),
        ("Scenario A-13: Task Contract Validation (422)", run_scenario_4_contract_validation, []),
        ("Scenario A-09: Webhook Auth Rejection (401)", run_scenario_5_webhook_auth_rejection, []),
        ("Scenario A-15: Concurrent Wake Latching Metrics", run_scenario_6_concurrent_wake_storm, []),
        ("Scenario A-10: Outbox Recovery State-Transition Check", run_scenario_7_recovery_behavior_check, [conn]),
    ]
    
    results = []
    
    for name, fn, args in tests:
        try:
            ok, msg = await fn(*args)
            results.append((name, ok, msg))
        except Exception as err:
            print(f"   [ERROR in {name}]: {err}")
            results.append((name, False, f"Exception: {str(err)[:80]}"))

    await conn.close()

    print("\n==========================================================================")
    print("                          FINAL EXECUTION REPORT                          ")
    print("==========================================================================")
    passed_count = sum(1 for _, ok, _ in results if ok)
    total_count = len(results)
    pass_pct = (passed_count / total_count * 100) if total_count > 0 else 0
    
    for name, ok, msg in results:
        status_icon = "[PASS]" if ok else "[FAIL]"
        print(f"{status_icon} | {name:<48} | {msg}")
    
    print("==========================================================================")
    print(f"SMOKE SUITE RESULT: {passed_count}/{total_count} SCENARIOS PASSED ({pass_pct:.1f}% PASS RATE)")
    print("==========================================================================")

    # Return proper exit code for CI/CD runners
    if passed_count < total_count:
        sys.exit(1)
    else:
        sys.exit(0)

if __name__ == '__main__':
    asyncio.run(main())
