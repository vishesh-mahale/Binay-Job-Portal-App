import asyncpg, asyncio, uuid

async def main():
    conn = await asyncpg.connect("postgresql://postgres.jzpvssryooucygnuifkb:z0qHzABWth61A3ah@aws-0-ap-south-1.pooler.supabase.com:6543/postgres", statement_cache_size=0)
    
    user_id = "f0149de7-ff89-4184-977c-6de1bb071a3c"
    
    # Find current doc and job
    doc = await conn.fetchrow("SELECT id FROM uploaded_documents WHERE uploaded_by_user_id = $1 AND deleted_at IS NULL", user_id)
    if not doc:
        print("No documents found")
        await conn.close()
        return
    
    doc_id = str(doc['id'])
    job = await conn.fetchrow("SELECT id FROM resume_parsing_jobs WHERE document_id = $1", doc_id)
    if not job:
        print("No job found")
        await conn.close()
        return
    
    job_id = str(job['id'])
    
    # Reset job
    await conn.execute("UPDATE resume_parsing_jobs SET status = 'queued', started_at = NULL, available_at = NOW(), locked_at = NULL, locked_by = NULL, updated_at = NOW() WHERE id = $1", job_id)
    await conn.execute("UPDATE uploaded_documents SET processing_status = 'queued', updated_at = NOW() WHERE id = $1", doc_id)
    
    # Delete old events for this job
    await conn.execute("DELETE FROM outbox_events WHERE aggregate_id = $1", job_id)
    
    # Fresh event
    event_id = str(uuid.uuid4())
    await conn.execute("""
        INSERT INTO outbox_events (id, aggregate_type, aggregate_id, event_type, schema_version, payload, correlation_id, causation_id, status, available_at, retry_count, max_retries)
        VALUES ($1, 'resume_parsing_job', $2, 'resume.parse.requested', 1, $3::jsonb, $1, $1, 'pending', NOW(), 0, 10)
    """, event_id, job_id, '{"document_id": "' + doc_id + '", "trace_id": "' + event_id + '"}')
    
    print(f"Job reset + fresh pending event: {event_id}")
    await conn.close()

asyncio.run(main())
