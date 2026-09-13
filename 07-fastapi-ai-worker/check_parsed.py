import asyncio
import asyncpg
import json

async def check():
    DB_URL = "postgresql://postgres.jzpvssryooucygnuifkb:z0qHzABWth61A3ah@aws-0-ap-south-1.pooler.supabase.com:6543/postgres"
    conn = await asyncpg.connect(DB_URL, statement_cache_size=0)

    USER_ID = "f0149de7-ff89-4184-977c-6de1bb071a3c"

    doc_rows = await conn.fetch(f"SELECT id FROM uploaded_documents WHERE uploaded_by_user_id = '{USER_ID}'")
    doc_ids = [str(r["id"]) for r in doc_rows]
    print(f"Documents: {doc_ids}")

    if not doc_ids:
        print("No documents found")
        await conn.close()
        return

    doc_ids_sql = ",".join(f"'{d}'" for d in doc_ids)
    job_rows = await conn.fetch(f"SELECT id, status FROM resume_parsing_jobs WHERE document_id IN ({doc_ids_sql}) ORDER BY created_at DESC")
    
    for job in job_rows:
        print(f"\nJob: {job['id']}, Status: {job['status']}")
        
        parsed_rows = await conn.fetch(f"SELECT normalized_output, confidence_details, overall_confidence FROM resume_parsed_data WHERE parsing_job_id = '{job['id']}'")
        
        for row in parsed_rows:
            output = json.loads(row['normalized_output']) if isinstance(row['normalized_output'], str) else row['normalized_output']
            print(f"\n=== NORMALIZED OUTPUT ===")
            print(json.dumps(output, indent=2))
            
            conf = json.loads(row['confidence_details']) if isinstance(row['confidence_details'], str) else row['confidence_details']
            print(f"\n=== CONFIDENCE DETAILS ===")
            print(json.dumps(conf, indent=2))
            
            print(f"\nOverall Confidence: {row['overall_confidence']}")

    await conn.close()

asyncio.run(check())
