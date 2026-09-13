import asyncio, asyncpg

async def reset():
    DB_URL = "postgresql://postgres.jzpvssryooucygnuifkb:z0qHzABWth61A3ah@aws-0-ap-south-1.pooler.supabase.com:6543/postgres"
    conn = await asyncpg.connect(DB_URL, statement_cache_size=0)

    USER_ID = "f0149de7-ff89-4184-977c-6de1bb071a3c"
    CANDIDATE_ID = "b15d064e-080b-4e79-97bb-5517cae382f5"

    TRIGGER_TABLES = [
        "uploaded_documents", "resume_parsed_data", "resume_parsing_artifacts",
        "resume_parsing_job_events", "outbox_events", "candidate_skills",
        "candidate_experiences", "candidate_educations", "candidate_certifications",
        "candidate_projects", "candidate_languages", "candidate_awards", "candidate_links"
    ]

    print("Dropping triggers...")
    for tbl in TRIGGER_TABLES:
        rows = await conn.fetch("SELECT tgname FROM pg_trigger WHERE tgrelid = (SELECT oid FROM pg_class WHERE relname = $1) AND tgisinternal = false", tbl)
        for r in rows:
            try:
                await conn.execute(f"DROP TRIGGER IF EXISTS {r['tgname']} ON {tbl};")
            except Exception as e:
                print(f"  Error dropping trigger {r['tgname']}: {e}")

    print("Nulling FKs on candidate_search_profiles...")
    await conn.execute("UPDATE candidate_search_profiles SET active_resume_document_id = NULL, active_resume_parsing_result_id = NULL WHERE candidate_id = $1", CANDIDATE_ID)

    print("Deleting candidate_profile_documents...")
    r = await conn.execute("DELETE FROM candidate_profile_documents WHERE candidate_id = $1", CANDIDATE_ID)
    print(f"  {r}")

    print("Deleting Evidence tables...")
    for ev_tbl in ["candidate_skill_evidence", "candidate_experience_evidence", "candidate_education_evidence", "candidate_certification_evidence"]:
        r = await conn.execute(f"DELETE FROM {ev_tbl} WHERE asserted_by_user_id = $1", USER_ID)
        print(f"  {ev_tbl}: {r}")

    print("Deleting Fact tables...")
    for tbl in ["candidate_skills", "candidate_experiences", "candidate_educations", "candidate_certifications", "candidate_projects", "candidate_languages", "candidate_awards", "candidate_links"]:
        r = await conn.execute(f"DELETE FROM {tbl} WHERE candidate_id = $1", CANDIDATE_ID)
        print(f"  {tbl}: {r}")

    print("Finding documents...")
    doc_rows = await conn.fetch("SELECT id FROM uploaded_documents WHERE uploaded_by_user_id = $1", USER_ID)
    doc_ids = [str(r["id"]) for r in doc_rows]
    print(f"  Found {len(doc_ids)} documents")

    if doc_rows:
        print("Finding parsing jobs...")
        job_rows = await conn.fetch("SELECT id FROM resume_parsing_jobs WHERE document_id::text = ANY($1)", doc_ids)
        job_ids = [str(r["id"]) for r in job_rows]
        print(f"  Found {len(job_ids)} parsing jobs")

        print("Deleting child tables of parsing jobs...")
        for tbl in ["resume_parsed_data", "resume_parsing_artifacts", "resume_parsing_job_events"]:
            r = await conn.execute(f"DELETE FROM {tbl} WHERE parsing_job_id::text = ANY($1)", job_ids)
            print(f"  {tbl}: {r}")
        r = await conn.execute("DELETE FROM resume_parsing_jobs WHERE id::text = ANY($1)", job_ids)
        print(f"  resume_parsing_jobs: {r}")

    print("Deleting uploaded_documents...")
    r = await conn.execute("DELETE FROM uploaded_documents WHERE uploaded_by_user_id = $1", USER_ID)
    print(f"  {r}")

    print("Resetting profile fields...")
    r = await conn.execute("""
      UPDATE candidate_profiles
      SET professional_title = NULL,
          summary = NULL,
          current_location = NULL,
          city = NULL,
          state = NULL,
          country = NULL,
          postal_code = NULL,
          preferred_work_mode = NULL,
          notice_period_days = NULL,
          expected_salary_min = NULL,
          expected_salary_max = NULL,
          work_authorization = NULL,
          available_from = NULL,
          date_of_birth = NULL,
          gender = NULL,
          nationality = NULL,
          salary_currency = 'INR',
          profile_completed_at = NULL,
          profile_revision = profile_revision + 1
      WHERE id = $1
    """, CANDIDATE_ID)
    print(f"  {r}")

    print("Recreating triggers...")
    triggers_to_create = [
        ("uploaded_documents", "uploaded_documents_no_hard_delete", "BEFORE DELETE ON uploaded_documents FOR EACH ROW EXECUTE FUNCTION reject_immutable_row_change()"),
        ("resume_parsed_data", "resume_parsed_data_immutable", "BEFORE UPDATE ON resume_parsed_data FOR EACH ROW EXECUTE FUNCTION reject_immutable_row_change()"),
        ("resume_parsing_artifacts", "resume_parsing_artifacts_immutable", "BEFORE UPDATE ON resume_parsing_artifacts FOR EACH ROW EXECUTE FUNCTION reject_immutable_row_change()"),
        ("resume_parsing_job_events", "resume_parsing_job_events_immutable", "BEFORE UPDATE ON resume_parsing_job_events FOR EACH ROW EXECUTE FUNCTION reject_immutable_row_change()"),
        ("outbox_events", "enforce_outbox_event_lifecycle", "BEFORE UPDATE ON outbox_events FOR EACH ROW EXECUTE FUNCTION enforce_outbox_event_lifecycle()"),
        ("candidate_skills", "candidate_skills_no_hard_delete", "BEFORE DELETE ON candidate_skills FOR EACH ROW EXECUTE FUNCTION reject_immutable_row_change()"),
        ("candidate_experiences", "candidate_experiences_no_hard_delete", "BEFORE DELETE ON candidate_experiences FOR EACH ROW EXECUTE FUNCTION reject_immutable_row_change()"),
        ("candidate_educations", "candidate_educations_no_hard_delete", "BEFORE DELETE ON candidate_educations FOR EACH ROW EXECUTE FUNCTION reject_immutable_row_change()"),
        ("candidate_certifications", "candidate_certifications_no_hard_delete", "BEFORE DELETE ON candidate_certifications FOR EACH ROW EXECUTE FUNCTION reject_immutable_row_change()"),
        ("candidate_projects", "candidate_projects_no_hard_delete", "BEFORE DELETE ON candidate_projects FOR EACH ROW EXECUTE FUNCTION reject_immutable_row_change()"),
        ("candidate_languages", "candidate_languages_no_hard_delete", "BEFORE DELETE ON candidate_languages FOR EACH ROW EXECUTE FUNCTION reject_immutable_row_change()"),
        ("candidate_awards", "candidate_awards_no_hard_delete", "BEFORE DELETE ON candidate_awards FOR EACH ROW EXECUTE FUNCTION reject_immutable_row_change()"),
        ("candidate_links", "candidate_links_no_hard_delete", "BEFORE DELETE ON candidate_links FOR EACH ROW EXECUTE FUNCTION reject_immutable_row_change()"),
    ]
    for table, name, definition in triggers_to_create:
        try:
            await conn.execute(f"CREATE TRIGGER {name} {definition}")
        except Exception as e:
            print(f"  Trigger creation note ({name}): {e}")

    await conn.close()
    print("Done! Candidate profile and uploaded resume data cleaned successfully.")

asyncio.run(reset())
