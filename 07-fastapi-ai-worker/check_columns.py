import asyncio
import asyncpg

async def check():
    DB_URL = "postgresql://postgres.jzpvssryooucygnuifkb:z0qHzABWth61A3ah@aws-0-ap-south-1.pooler.supabase.com:6543/postgres"
    conn = await asyncpg.connect(DB_URL, statement_cache_size=0)

    for tbl in ["candidate_skill_evidence", "candidate_experience_evidence", "candidate_education_evidence", "candidate_certification_evidence"]:
        rows = await conn.fetch(
            "SELECT column_name FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position",
            tbl,
        )
        cols = [r["column_name"] for r in rows]
        print(f"{tbl}: {cols}")

    await conn.close()

asyncio.run(check())
