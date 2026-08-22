import os, asyncio, asyncpg, uuid, subprocess

load_dotenv_path = '07-fastapi-ai-worker/.env'
if os.path.exists(load_dotenv_path):
    from dotenv import load_dotenv
    load_dotenv(load_dotenv_path)

db_url = os.getenv('DATABASE_URL')
if db_url and 'postgresql+asyncpg://' in db_url:
    db_url = db_url.replace('postgresql+asyncpg://', 'postgresql://')

async def main():
    conn = await asyncpg.connect(db_url, statement_cache_size=0)
    
    # 1. Insert a fresh pending event
    event_id = uuid.uuid4()
    agg_id = uuid.uuid4()
    await conn.execute("""
        INSERT INTO outbox_events (id, aggregate_type, aggregate_id, event_type, schema_version, payload, status)
        VALUES ($1, 'candidate', $2, 'candidate.profile.changed', 1, '{"test": "SCHEDULER_DRAIN_TEST"}', 'pending');
    """, event_id, agg_id)
    print(f"[Step 1] Fresh event inserted into DB (ID: {event_id}) -> Status: pending")
    await conn.close()
    
    # 2. Trigger Cloud Scheduler Job via gcloud CLI
    print("[Step 2] Triggering GCP Cloud Scheduler Job (dev-outbox-recovery-sweep)...")
    res = subprocess.run(['cmd', '/c', 'gcloud scheduler jobs run dev-outbox-recovery-sweep --location=asia-south1'], capture_output=True, text=True)
    print("   -> Cloud Scheduler Trigger Status:", "SUCCESS" if res.returncode == 0 else "FAIL")
    
    # 3. Wait 4 seconds for Dispatcher execution
    await asyncio.sleep(4)
    conn = await asyncpg.connect(db_url, statement_cache_size=0)
    row = await conn.fetchrow('SELECT id, status, published_at, task_name FROM outbox_events WHERE id = $1;', event_id)
    print("[Step 3] Checking event status in DB after Scheduler Call:")
    print(f"   -> Event Status in DB: '{row['status']}'")
    print(f"   -> Task Name: '{row['task_name']}'")
    print(f"   -> Published At: {row['published_at']}")
    await conn.close()

if __name__ == '__main__':
    asyncio.run(main())
