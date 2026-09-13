import asyncio
import asyncpg
import json

async def check():
    DB_URL = "postgresql://postgres.jzpvssryooucygnuifkb:z0qHzABWth61A3ah@aws-0-ap-south-1.pooler.supabase.com:6543/postgres"
    conn = await asyncpg.connect(DB_URL, statement_cache_size=0)

    USER_ID = "f0149de7-ff89-4184-977c-6de1bb071a3c"

    doc_rows = await conn.fetch(f"SELECT id FROM uploaded_documents WHERE uploaded_by_user_id = '{USER_ID}'")
    doc_ids = [str(r["id"]) for r in doc_rows]

    if not doc_ids:
        print("No documents found")
        await conn.close()
        return

    doc_ids_sql = ",".join(f"'{d}'" for d in doc_ids)
    job_rows = await conn.fetch(f"SELECT id FROM resume_parsing_jobs WHERE document_id IN ({doc_ids_sql}) ORDER BY created_at DESC")

    for job in job_rows:
        parsed_rows = await conn.fetch(f"SELECT raw_ai_output FROM resume_parsed_data WHERE parsing_job_id = '{job['id']}'")
        for row in parsed_rows:
            raw = json.loads(row['raw_ai_output']) if isinstance(row['raw_ai_output'], str) else row['raw_ai_output']
            # Look for the AI output inside nested structure
            ai = raw.get('ai', raw)
            print("=== LLM RAW RESPONSE (ai key) ===")
            print(json.dumps(ai, indent=2))
            print("\n=== TOP-LEVEL KEYS ===")
            print(list(raw.keys()))

    await conn.close()

asyncio.run(check())
