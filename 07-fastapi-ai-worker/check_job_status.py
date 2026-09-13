import psycopg2
import json

db_url = "postgresql://postgres.jzpvssryooucygnuifkb:z0qHzABWth61A3ah@aws-0-ap-south-1.pooler.supabase.com:6543/postgres"

conn = psycopg2.connect(db_url)
cur = conn.cursor()

print("=== Uploaded Documents ===")
cur.execute("SELECT id, original_file_name, processing_status, security_scan_status, created_at FROM public.uploaded_documents ORDER BY created_at DESC LIMIT 5;")
for d in cur.fetchall():
    print(d)

print("\n=== Resume Parsing Jobs ===")
cur.execute("SELECT id, document_id, status, parser_provider, parser_model, created_at FROM public.resume_parsing_jobs ORDER BY created_at DESC LIMIT 5;")
for j in cur.fetchall():
    print(j)

print("\n=== Resume Parsed Data ===")
cur.execute("SELECT id, parsing_job_id, document_id, created_at FROM public.resume_parsed_data ORDER BY created_at DESC LIMIT 5;")
for p in cur.fetchall():
    print(p)

conn.close()
