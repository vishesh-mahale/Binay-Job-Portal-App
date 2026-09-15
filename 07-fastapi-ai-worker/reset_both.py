import asyncio, asyncpg

async def reset():
    DB_URL = "postgresql://postgres.jzpvssryooucygnuifkb:z0qHzABWth61A3ah@aws-0-ap-south-1.pooler.supabase.com:6543/postgres"
    conn = await asyncpg.connect(DB_URL, statement_cache_size=0)

    users = await conn.fetch("SELECT id FROM auth.users WHERE email = ANY($1)", ["visheshmahale2@gmail.com", "visheshmahale102@gmail.com"])
    if not users:
        print("No users found"); await conn.close(); return

    for user_row in users:
        USER_ID = str(user_row["id"])
        print(f"\nProcessing: {USER_ID}")
        cand = await conn.fetchrow("SELECT id FROM candidate_profiles WHERE user_id = $1", USER_ID)
        if not cand:
            print(f"  No candidate profile"); continue
        CANDIDATE_ID = str(cand["id"])

        for tbl in ["uploaded_documents", "resume_parsed_data", "resume_parsing_artifacts", "resume_parsing_job_events", "outbox_events"]:
            rows = await conn.fetch("SELECT tgname FROM pg_trigger WHERE tgrelid = (SELECT oid FROM pg_class WHERE relname = $1) AND tgisinternal = false", tbl)
            for r in rows:
                try: await conn.execute(f"DROP TRIGGER IF EXISTS {r['tgname']} ON {tbl};")
                except: pass

        await conn.execute("DELETE FROM candidate_profile_documents WHERE candidate_id = $1", CANDIDATE_ID)
        doc_rows = await conn.fetch("SELECT id FROM uploaded_documents WHERE uploaded_by_user_id = $1", USER_ID)
        doc_ids = [str(r["id"]) for r in doc_rows]

        if doc_rows:
            job_rows = await conn.fetch("SELECT id FROM resume_parsing_jobs WHERE document_id::text = ANY($1)", doc_ids)
            job_ids = [str(r["id"]) for r in job_rows]
            if job_ids:
                for tbl in ["resume_parsed_data", "resume_parsing_artifacts", "resume_parsing_job_events"]:
                    await conn.execute(f"DELETE FROM {tbl} WHERE parsing_job_id::text = ANY($1)", job_ids)
                await conn.execute("DELETE FROM resume_parsing_jobs WHERE id::text = ANY($1)", job_ids)

        await conn.execute("DELETE FROM candidate_search_profiles WHERE candidate_id = $1", CANDIDATE_ID)
        await conn.execute("DELETE FROM uploaded_documents WHERE uploaded_by_user_id = $1", USER_ID)

        for tbl in ["candidate_skills", "candidate_experiences", "candidate_educations", "candidate_certifications", "candidate_projects", "candidate_languages", "candidate_awards", "candidate_links"]:
            await conn.execute(f"DELETE FROM {tbl} WHERE candidate_id = $1", CANDIDATE_ID)

        for ev_tbl in ["candidate_skill_evidence", "candidate_experience_evidence", "candidate_education_evidence", "candidate_certification_evidence"]:
            await conn.execute(f"DELETE FROM {ev_tbl} WHERE asserted_by_user_id = $1", USER_ID)

        await conn.execute("UPDATE candidate_profiles SET profile_completed_at = NULL, profile_revision = profile_revision + 1 WHERE id = $1", CANDIDATE_ID)

        await conn.execute("CREATE TRIGGER uploaded_documents_no_hard_delete BEFORE DELETE ON uploaded_documents FOR EACH ROW EXECUTE FUNCTION reject_immutable_row_change()")
        await conn.execute("CREATE TRIGGER resume_parsed_data_immutable BEFORE UPDATE ON resume_parsed_data FOR EACH ROW EXECUTE FUNCTION reject_immutable_row_change()")
        await conn.execute("CREATE TRIGGER resume_parsing_artifacts_immutable BEFORE UPDATE ON resume_parsing_artifacts FOR EACH ROW EXECUTE FUNCTION reject_immutable_row_change()")
        await conn.execute("CREATE TRIGGER resume_parsing_job_events_immutable BEFORE UPDATE ON resume_parsing_job_events FOR EACH ROW EXECUTE FUNCTION reject_immutable_row_change()")
        await conn.execute("CREATE TRIGGER enforce_outbox_event_lifecycle BEFORE UPDATE ON outbox_events FOR EACH ROW EXECUTE FUNCTION enforce_outbox_event_lifecycle()")
        print(f"  Done for {USER_ID}")

    await conn.close()
    print("\nDone! Both candidates reset.")

asyncio.run(reset())
