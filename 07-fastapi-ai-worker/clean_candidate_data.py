import psycopg2

db_url = "postgresql://postgres.jzpvssryooucygnuifkb:z0qHzABWth61A3ah@aws-0-ap-south-1.pooler.supabase.com:6543/postgres"

conn = psycopg2.connect(db_url)
cur = conn.cursor()

try:
    print("=== Cleaning candidate data for visheshmahale2@gmail.com ===")
    cur.execute("SELECT id FROM public.users WHERE email = 'visheshmahale2@gmail.com';")
    user_row = cur.fetchone()
    if not user_row:
        print("User visheshmahale2@gmail.com not found!")
        exit(0)

    user_id = user_row[0]
    print(f"User ID: {user_id}")

    cur.execute("SELECT id FROM public.candidate_profiles WHERE user_id = %s;", (user_id,))
    cand_row = cur.fetchone()
    if not cand_row:
        print("Candidate profile not found!")
        exit(0)

    candidate_id = cand_row[0]
    print(f"Candidate ID: {candidate_id}")

    cur.execute("SELECT id FROM public.uploaded_documents WHERE uploaded_by_user_id = %s;", (user_id,))
    doc_rows = cur.fetchall()
    doc_ids = [r[0] for r in doc_rows]
    print(f"Documents to delete: {doc_ids}")

    cur.execute("SET session_replication_role = 'replica';")

    # Clean facts
    cur.execute("DELETE FROM public.candidate_skills WHERE candidate_id = %s;", (candidate_id,))
    cur.execute("DELETE FROM public.candidate_experiences WHERE candidate_id = %s;", (candidate_id,))
    cur.execute("DELETE FROM public.candidate_educations WHERE candidate_id = %s;", (candidate_id,))
    cur.execute("DELETE FROM public.candidate_certifications WHERE candidate_id = %s;", (candidate_id,))
    cur.execute("DELETE FROM public.candidate_projects WHERE candidate_id = %s;", (candidate_id,))
    cur.execute("DELETE FROM public.candidate_languages WHERE candidate_id = %s;", (candidate_id,))
    cur.execute("DELETE FROM public.candidate_awards WHERE candidate_id = %s;", (candidate_id,))
    cur.execute("DELETE FROM public.candidate_links WHERE candidate_id = %s;", (candidate_id,))

    # Clean documents and parsing jobs/data
    if doc_ids:
        cur.execute("DELETE FROM public.resume_parsed_data WHERE document_id::text = ANY(%s);", (doc_ids,))
        cur.execute("DELETE FROM public.resume_parsing_jobs WHERE document_id::text = ANY(%s);", (doc_ids,))
        cur.execute("DELETE FROM public.candidate_profile_documents WHERE candidate_id = %s;", (candidate_id,))
        cur.execute("DELETE FROM public.uploaded_documents WHERE uploaded_by_user_id = %s;", (user_id,))

    # Reset profile fields
    cur.execute("""
        UPDATE public.candidate_profiles
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
            salary_currency = 'INR'
        WHERE id = %s;
    """, (candidate_id,))

    cur.execute("SET session_replication_role = 'origin';")
    conn.commit()
    print("SUCCESS: Cleaned all candidate resume documents, parsed data, facts, and profile fields!")

except Exception as e:
    print(f"Error: {e}")
finally:
    if conn:
        conn.close()
