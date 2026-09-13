import asyncio, asyncpg

async def check():
    DB_URL = "postgresql://postgres.jzpvssryooucygnuifkb:z0qHzABWth61A3ah@aws-0-ap-south-1.pooler.supabase.com:6543/postgres"
    conn = await asyncpg.connect(DB_URL, statement_cache_size=0)

    # Find user by email
    row = await conn.fetchrow("SELECT id FROM auth.users WHERE email = $1", "visheshmahale2@gmail.com")
    if not row:
        print("User not found")
        await conn.close()
        return
    USER_ID = str(row["id"])
    print(f"User ID: {USER_ID}")

    # Find candidate
    cand = await conn.fetchrow("SELECT id, profile_completed_at FROM candidate_profiles WHERE user_id = $1", USER_ID)
    if cand:
        CANDIDATE_ID = str(cand["id"])
        print(f"Candidate ID: {CANDIDATE_ID} | completed_at: {cand['profile_completed_at']}")
    else:
        print("No candidate profile")
        await conn.close()
        return

    # Check docs
    docs = await conn.fetch("SELECT id, original_file_name FROM uploaded_documents WHERE uploaded_by_user_id = $1", USER_ID)
    print(f"Documents: {len(docs)}")
    for d in docs:
        print(f"  {d['id']} | {d['original_file_name']}")

    await conn.close()

asyncio.run(check())
