import asyncio
import asyncpg

async def reset():
    DB_URL = "postgresql://postgres.jzpvssryooucygnuifkb:z0qHzABWth61A3ah@aws-0-ap-south-1.pooler.supabase.com:6543/postgres"
    conn = await asyncpg.connect(DB_URL, statement_cache_size=0)

    CANDIDATE_ID = "b15d064e-080b-4e79-97bb-5517cae382f5"
    USER_ID = "f0149de7-ff89-4184-977c-6de1bb071a3c"

    # 1. Drop triggers
    print("Dropping triggers...")
    for tbl in ["uploaded_documents", "resume_parsed_data", "resume_parsing_artifacts", "resume_parsing_job_events", "outbox_events"]:
        rows = await conn.fetch(
            "SELECT tgname FROM pg_trigger WHERE tgrelid = (SELECT oid FROM pg_class WHERE relname = $1) AND tgisinternal = false",
            tbl,
        )
        for r in rows:
            try:
                await conn.execute(f"DROP TRIGGER IF EXISTS {r['tgname']} ON {tbl};")
                print(f"  Dropped {r['tgname']} on {tbl}")
            except Exception as e:
                print(f"  Skip {r['tgname']}: {e}")
    print("Triggers dropped.")

    # 2. candidate_profile_documents FIRST (FK on uploaded_documents)
    r = await conn.execute(f"DELETE FROM candidate_profile_documents WHERE candidate_id = '{CANDIDATE_ID}'")
    print(f"  candidate_profile_documents: {r}")

    # 3. Find document IDs (column: uploaded_by_user_id)
    doc_rows = await conn.fetch(f"SELECT id FROM uploaded_documents WHERE uploaded_by_user_id = '{USER_ID}'")
    doc_ids = [str(r["id"]) for r in doc_rows]
    print(f"  Found {len(doc_ids)} documents")

    # 4. Find parsing jobs linked to those documents
    if doc_rows:
        doc_ids_sql = ",".join(f"'{d}'" for d in doc_ids)
        job_rows = await conn.fetch(f"SELECT id FROM resume_parsing_jobs WHERE document_id IN ({doc_ids_sql})")
        job_ids = [str(r["id"]) for r in job_rows]
        print(f"  Found {len(job_ids)} parsing jobs")
    else:
        job_ids = []

    # 5. Delete child tables (column: parsing_job_id)
    if job_ids:
        job_ids_sql = ",".join(f"'{j}'" for j in job_ids)
        for tbl in ["resume_parsed_data", "resume_parsing_artifacts", "resume_parsing_job_events"]:
            r = await conn.execute(f"DELETE FROM {tbl} WHERE parsing_job_id IN ({job_ids_sql})")
            print(f"  {tbl}: {r}")
        r = await conn.execute(f"DELETE FROM resume_parsing_jobs WHERE id IN ({job_ids_sql})")
        print(f"  resume_parsing_jobs: {r}")

    # 6. Null out FK references before deleting uploaded_documents
    await conn.execute(f"UPDATE candidate_search_profiles SET active_resume_document_id = NULL WHERE candidate_id = '{CANDIDATE_ID}'")
    print(f"  candidate_search_profiles FK nulled")

    # 7. Delete uploaded_documents
    r = await conn.execute(f"DELETE FROM uploaded_documents WHERE uploaded_by_user_id = '{USER_ID}'")
    print(f"  uploaded_documents: {r}")

    # 7. Fact tables (delete first so evidence can cascade)
    for tbl in ["candidate_skills", "candidate_experiences", "candidate_educations", "candidate_certifications", "candidate_projects", "candidate_languages", "candidate_awards", "candidate_links"]:
        r = await conn.execute(f"DELETE FROM {tbl} WHERE candidate_id = '{CANDIDATE_ID}'")
        print(f"  {tbl}: {r}")

    # 8. Evidence tables (via asserted_by_user_id or remaining orphans)
    for ev_tbl in ["candidate_skill_evidence", "candidate_experience_evidence", "candidate_education_evidence", "candidate_certification_evidence"]:
        r = await conn.execute(f"DELETE FROM {ev_tbl} WHERE asserted_by_user_id = '{USER_ID}'")
        print(f"  {ev_tbl}: {r}")

    # 9. Events - processed_events links via event_id to outbox_events.id
    outbox_rows = await conn.fetch(f"SELECT id FROM outbox_events WHERE payload::text LIKE '%{CANDIDATE_ID}%'")
    if outbox_rows:
        outbox_ids_sql = ",".join(f"'{r['id']}'" for r in outbox_rows)
        r = await conn.execute(f"DELETE FROM processed_events WHERE event_id IN ({outbox_ids_sql})")
        print(f"  processed_events: {r}")
    r = await conn.execute(f"DELETE FROM outbox_events WHERE payload::text LIKE '%{CANDIDATE_ID}%'")
    print(f"  outbox_events: {r}")

    # 10. Reset profile
    r = await conn.execute(f"UPDATE candidate_profiles SET profile_completed_at = NULL, profile_revision = profile_revision + 1 WHERE id = '{CANDIDATE_ID}'")
    print(f"  candidate_profiles reset: {r}")

    # 11. Recreate triggers
    print("Recreating triggers...")
    await conn.execute("""CREATE TRIGGER uploaded_documents_no_hard_delete
        BEFORE DELETE ON uploaded_documents
        FOR EACH ROW EXECUTE FUNCTION reject_immutable_row_change()""")
    await conn.execute("""CREATE TRIGGER resume_parsed_data_immutable
        BEFORE UPDATE ON resume_parsed_data
        FOR EACH ROW EXECUTE FUNCTION reject_immutable_row_change()""")
    await conn.execute("""CREATE TRIGGER resume_parsing_artifacts_immutable
        BEFORE UPDATE ON resume_parsing_artifacts
        FOR EACH ROW EXECUTE FUNCTION reject_immutable_row_change()""")
    await conn.execute("""CREATE TRIGGER resume_parsing_job_events_immutable
        BEFORE UPDATE ON resume_parsing_job_events
        FOR EACH ROW EXECUTE FUNCTION reject_immutable_row_change()""")
    await conn.execute("""CREATE TRIGGER enforce_outbox_event_lifecycle
        BEFORE UPDATE ON outbox_events
        FOR EACH ROW EXECUTE FUNCTION enforce_outbox_event_lifecycle()""")
    
    await conn.close()
    print("Done! Profile reset to first-time (completed_at=NULL).")

asyncio.run(reset())
