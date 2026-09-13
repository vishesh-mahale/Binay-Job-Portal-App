import asyncio, asyncpg

async def check():
    DB_URL = "postgresql://postgres.jzpvssryooucygnuifkb:z0qHzABWth61A3ah@aws-0-ap-south-1.pooler.supabase.com:6543/postgres"
    conn = await asyncpg.connect(DB_URL, statement_cache_size=0)
    USER_ID = "5e848142-1ec1-46cb-b544-f4ef9046e181"

    docs = await conn.fetch("SELECT id, original_file_name, processing_status, security_scan_status FROM uploaded_documents WHERE uploaded_by_user_id = $1", USER_ID)
    print(f"Documents: {len(docs)}")
    for d in docs:
        print(f"  {d['id']} | {d['original_file_name']} | {d['processing_status']} | {d['security_scan_status']}")

    row = await conn.fetchrow("SELECT id, profile_completed_at FROM candidate_profiles WHERE user_id = $1", USER_ID)
    if row:
        print(f"Candidate: {row['id']} | completed_at: {row['profile_completed_at']}")

    await conn.close()

asyncio.run(check())
