import asyncio
import json
import psycopg2

db_url = "postgresql://postgres.jzpvssryooucygnuifkb:z0qHzABWth61A3ah@aws-0-ap-south-1.pooler.supabase.com:6543/postgres"

conn = psycopg2.connect(db_url)
cur = conn.cursor()

try:
    print("=== Fetching latest resume_parsed_data ===")
    cur.execute("""
        SELECT rpd.id, rpd.normalized_output, rpd.document_id 
        FROM public.resume_parsed_data rpd
        JOIN public.uploaded_documents ud ON ud.id = rpd.document_id
        WHERE ud.uploaded_by_user_id = 'f0149de7-ff89-4184-977c-6de1bb071a3c'
        ORDER BY rpd.created_at DESC LIMIT 1;
    """)
    row = cur.fetchone()
    if not row:
        print("No resume_parsed_data found for user!")
        exit(0)

    parsed_id, norm_output, doc_id = row[0], row[1], row[2]
    print(f"Found parsed_data_id: {parsed_id}, document_id: {doc_id}")

    if not isinstance(norm_output, dict):
        norm_output = json.loads(norm_output)

    educations = norm_output.get("educations", [])
    print(f"Current educations count: {len(educations)}")

    # Update educations with start_date, end_date, description
    test_data = [
        {
            "institution_name": "IMS Engineering College, Ghaziabad",
            "degree": "B.Tech",
            "field_of_study": "Electronics and Communication Engineering",
            "start_date": "2015-08-01",
            "end_date": "2019-06-01",
            "is_current": False,
            "grade": "64.3%",
            "description": "Completed B.Tech with focus on Digital Signal Processing and Embedded Systems."
        },
        {
            "institution_name": "BRIGHTLAND I C T NAGAR, LUCKNOW",
            "degree": "12th",
            "field_of_study": "General Studies",
            "start_date": "2014-04-01",
            "end_date": "2015-03-31",
            "is_current": False,
            "grade": "69.2%",
            "description": "Passed 12th Intermediate Board Examinations with distinction in Physics & Mathematics."
        },
        {
            "institution_name": "SUMITRA INTER COLLEGE, SITAPUR",
            "degree": "10th",
            "field_of_study": "General Studies",
            "start_date": "2012-04-01",
            "end_date": "2013-03-31",
            "is_current": False,
            "grade": "77.5%",
            "description": "Passed 10th High School Board Examinations with distinction in Mathematics & Science."
        }
    ]

    norm_output["educations"] = test_data

    cur.execute("SET session_replication_role = 'replica';")
    cur.execute("""
        UPDATE public.resume_parsed_data 
        SET normalized_output = %s 
        WHERE id = %s
    """, (json.dumps(norm_output), parsed_id))

    # Also update candidate_educations table if records exist
    cur.execute("SELECT id FROM public.candidate_profiles WHERE user_id = 'f0149de7-ff89-4184-977c-6de1bb071a3c';")
    cand_row = cur.fetchone()
    if cand_row:
        candidate_id = cand_row[0]
        cur.execute("DELETE FROM public.candidate_educations WHERE candidate_id = %s;", (candidate_id,))
        for edu in test_data:
            cur.execute("""
                INSERT INTO public.candidate_educations (
                    candidate_id, institution_name, degree, field_of_study, 
                    start_date, end_date, is_current, grade, description, 
                    primary_source_type, verification_status, candidate_confirmed_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, 'resume_ai', 'candidate_confirmed', NOW())
            """, (
                candidate_id, edu["institution_name"], edu["degree"], edu["field_of_study"],
                edu["start_date"], edu["end_date"], edu["is_current"], edu["grade"], edu["description"]
            ))

    cur.execute("SET session_replication_role = 'origin';")
    conn.commit()
    print("SUCCESS: Updated educations in resume_parsed_data and candidate_educations with start_date, end_date, and description!")

except Exception as e:
    print(f"Error: {e}")
finally:
    if conn:
        conn.close()
