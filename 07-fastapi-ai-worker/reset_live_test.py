import asyncio
import asyncpg

async def reset():
    DB_URL = "postgresql://postgres.jzpvssryooucygnuifkb:z0qHzABWth61A3ah@aws-0-ap-south-1.pooler.supabase.com:6543/postgres"
    conn = await asyncpg.connect(DB_URL, statement_cache_size=0)

    USER_ID = "5e848142-1ec1-46cb-b544-f4ef9046e181"

    # Find candidate_id
    row = await conn.fetchrow("SELECT id FROM candidate_profiles WHERE user_id = $1", USER_ID)
    if not row:
        print("No candidate profile found for this user")
        await conn.close()
        return
    CANDIDATE_ID = str(row["id"])
    print(f"Candidate ID: {CANDIDATE_ID}")
    print(f"User ID: {USER_ID}")

    # 1. Drop triggers
    print("\n[1/10] Dropping triggers...")
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

    # 2. candidate_profile_documents
    print("\n[2/10] candidate_profile_documents...")
    r = await conn.execute("DELETE FROM candidate_profile_documents WHERE candidate_id = $1", CANDIDATE_ID)
    print(f"  {r}")

    # 3. Find document IDs
    print("\n[3/10] Finding documents...")
    doc_rows = await conn.fetch("SELECT id FROM uploaded_documents WHERE uploaded_by_user_id = $1", USER_ID)
    doc_ids = [str(r["id"]) for r in doc_rows]
    print(f"  Found {len(doc_ids)} documents")

    # 4. Find parsing jobs
    print("\n[4/10] Finding parsing jobs...")
    if doc_rows:
        job_rows = await conn.fetch("SELECT id FROM resume_parsing_jobs WHERE document_id::text = ANY($1)", doc_ids)
        job_ids = [str(r["id"]) for r in job_rows]
        print(f"  Found {len(job_ids)} parsing jobs")
    else:
        job_ids = []

    # 5. Delete child tables
    print("\n[5/10] Deleting parsing child tables...")
    if job_ids:
        for tbl in ["resume_parsed_data", "resume_parsing_artifacts", "resume_parsing_job_events"]:
            r = await conn.execute(f"DELETE FROM {tbl} WHERE parsing_job_id::text = ANY($1)", job_ids)
            print(f"  {tbl}: {r}")
        r = await conn.execute("DELETE FROM resume_parsing_jobs WHERE id::text = ANY($1)", job_ids)
        print(f"  resume_parsing_jobs: {r}")

    # 6. Null out FK
    print("\n[6/10] Nulling FKs...")
    await conn.execute("UPDATE candidate_search_profiles SET active_resume_document_id = NULL WHERE candidate_id = $1", CANDIDATE_ID)
    print("  candidate_search_profiles FK nulled")

    # 7. Delete uploaded_documents
    print("\n[7/10] uploaded_documents...")
    r = await conn.execute("DELETE FROM uploaded_documents WHERE uploaded_by_user_id = $1", USER_ID)
    print(f"  {r}")

    # 8. Fact tables
    print("\n[8/10] Fact tables...")
    for tbl in ["candidate_skills", "candidate_experiences", "candidate_educations", "candidate_certifications", "candidate_projects", "candidate_languages", "candidate_awards", "candidate_links"]:
        r = await conn.execute("DELETE FROM {} WHERE candidate_id = $1".format(tbl), CANDIDATE_ID)
        print(f"  {tbl}: {r}")

    # 9. Evidence tables
    print("\n[9/10] Evidence tables...")
    for ev_tbl in ["candidate_skill_evidence", "candidate_experience_evidence", "candidate_education_evidence", "candidate_certification_evidence"]:
        r = await conn.execute("DELETE FROM {} WHERE asserted_by_user_id = $1".format(ev_tbl), USER_ID)
        print(f"  {ev_tbl}: {r}")

    # 10. Reset profile
    print("\n[10/10] Resetting profile...")
    r = await conn.execute("UPDATE candidate_profiles SET profile_completed_at = NULL, profile_revision = profile_revision + 1 WHERE id = $1", CANDIDATE_ID)
    print(f"  candidate_profiles reset: {r}")

    # Recreate triggers
    print("\nRecreating triggers...")
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
    print("\nDone! Profile reset to first-time (completed_at=NULL). You can now upload a fresh resume.")

asyncio.run(reset())
