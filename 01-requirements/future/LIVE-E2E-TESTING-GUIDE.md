# 🚀 Production-Realistic Live E2E Testing Guide — Binay Job Portal

> **Authority & Compliance**: Formally aligned with Product Requirements (**Section 7 & 8**), **PD-002** (Active Resume Search Projection), **PD-003** (Application History), `02-database` Baseline Schemas (`03` to `17`), and `contracts/tasks/` Task Schemas.

---

## 👥 Real-World Test Personas

* **Candidate Persona:** **Vishesh Mahale**
  - **Email:** `visheshmahale1994@gmail.com`
  - **User ID:** `793074a4-a70c-4f6e-9e2e-2723dedbb5a3`
  - **Candidate ID:** `7a776a6e-462c-448c-8318-c358ead01d96`
  - **Role:** Candidate (`candidate`)
  - **Target Role:** Senior Python Backend Developer

* **Recruiter / HR Persona:** **Binay**
  - **Email:** `binay@gmail.com`
  - **Role:** Recruiter / Employer (`employer`)
  - **Company:** TechCorp Global (`company_id: c1a2b3c4-5678-90ab-cdef-1234567890ab`)
  - **Company Job:** Senior Python Backend Lead

---

## 🛠️ Prerequisites Before Starting Manual Steps

1. **Supabase Database Clean Reset Done:** Active user and candidate profile created in DB.
2. **Supabase Storage Bucket Setup (For Step 3 PDF Download):**
   - Bucket: **`job-portal-uploads`**
   - File uploaded: **`resumes/Vishesh_Resume_Java_Angular_9.9Yrs.pdf`**
3. **FastAPI AI Worker Environment (`07-fastapi-ai-worker/.env`):**
   - `GOOGLE_CLOUD_PROJECT_ID=binay-job-portal-dev-2026`
   - `GEMINI_MODEL=gemini-2.5-flash`
   - `GEMINI_MAX_TOKENS=8192`
   - `DATABASE_URL=postgresql+asyncpg://postgres.jzpvssryooucygnuifkb:z0qHzABWth61A3ah@aws-0-ap-south-1.pooler.supabase.com:6543/postgres`
   - `OIDC_AUTH_ENABLED=false` *(Required for Swagger testing)*
   - `DEBUG_ENDPOINTS_ENABLED=true` *(Required for /docs Swagger UI)*
   - `AI_PROVIDER=vertexai`
   - `EMBEDDING_PROVIDER=vertexai`
4. **FastAPI AI Worker Running Locally:**
   - Command: `.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8080`
   - Swagger UI: **`http://localhost:8080/docs`**

---

## 🗺️ Complete 7-Step Real-World Application Journey

```text
[STEP 1: User Signup] ➔ [STEP 2: Resume Upload & Parsing Job (PD-002)] ➔ [STEP 3: AI Resume Parsing Execution] ➔ [STEP 4: Candidate Confirmation & Canonical Save] ➔ [STEP 5: Search Projection & 768-dim Vector (PD-002)] ➔ [STEP 6: Job Posting & AI Enrichment] ➔ [STEP 7: Live pgvector Cosine Search]
```

---

## 📌 STEP 1: Candidate Account Registration (Vishesh Mahale)

### ❓ What happens in real life?
Vishesh signs up on the frontend. NestJS creates the user in Supabase Auth (`auth.users`). PostgreSQL database triggers automatically populate `public.users` and `public.candidate_profiles`.

### 🌟 State in Database (Completed):

- **Email:** `visheshmahale1994@gmail.com`
- **User ID:** `793074a4-a70c-4f6e-9e2e-2723dedbb5a3`
- **Candidate ID:** `7a776a6e-462c-448c-8318-c358ead01d96`

### 🔍 Verification SQL (Run in Supabase SQL Editor):

```sql
SELECT 
  u.id AS user_id, 
  u.email, 
  u.first_name,
  u.role, 
  cp.id AS candidate_id, 
  cp.profile_revision
FROM users u
JOIN candidate_profiles cp ON cp.user_id = u.id
WHERE u.email = 'visheshmahale1994@gmail.com';
```

---

## 📌 STEP 2: Resume Document Upload & Parsing Job Creation (PD-001 Flow)

### ❓ What happens in real life?
Vishesh uploads his PDF resume (`Vishesh_Resume_Java_Angular_9.9Yrs.pdf`) on onboarding.
1. NestJS links document in `candidate_profile_documents` (`document_role = 'resume'`, `is_current = TRUE`).
2. NestJS creates a `resume_parsing_jobs` record (`status = 'queued'`).
3. Outbox event `resume.parse.requested` is emitted.

### ✍️ Execute SQL in Supabase SQL Editor:

```sql
-- 1. Insert Uploaded Document Metadata (ID: d1e2f3a4-5678-90ab-cdef-1234567890ab)
INSERT INTO uploaded_documents (
  id,
  uploaded_by_user_id,
  document_type,
  original_file_name,
  file_extension,
  file_size_bytes,
  mime_type,
  storage_bucket,
  storage_path,
  checksum_sha256,
  security_scan_status,
  processing_status,
  created_at,
  updated_at
) VALUES (
  'd1e2f3a4-5678-90ab-cdef-1234567890ab',
  '793074a4-a70c-4f6e-9e2e-2723dedbb5a3',
  'resume'::document_type,
  'Vishesh_Resume_Java_Angular_9.9Yrs.pdf',
  'pdf',
  79255,
  'application/pdf',
  'job-portal-uploads',
  'resumes/Vishesh_Resume_Java_Angular_9.9Yrs.pdf',
  'a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3',
  'clean'::security_scan_status,
  'uploaded'::resume_processing_status,
  NOW(),
  NOW()
) ON CONFLICT (id) DO NOTHING;

-- 2. Link as Current Active Resume Document for Vishesh
INSERT INTO candidate_profile_documents (
  candidate_id,
  document_id,
  document_role,
  version_number,
  is_current,
  linked_at
) VALUES (
  '7a776a6e-462c-448c-8318-c358ead01d96',
  'd1e2f3a4-5678-90ab-cdef-1234567890ab',
  'resume'::document_role,
  1,
  TRUE,
  NOW()
) ON CONFLICT DO NOTHING;

-- 3. Create Queued Resume Parsing Job (ID: b1a2c3d4-5678-90ab-cdef-1234567890ab)
INSERT INTO resume_parsing_jobs (
  id,
  document_id,
  parser_provider,
  parser_model,
  parser_version,
  extraction_version,
  status,
  priority,
  requested_by_user_id,
  idempotency_key,
  created_at,
  updated_at
) VALUES (
  'b1a2c3d4-5678-90ab-cdef-1234567890ab',
  'd1e2f3a4-5678-90ab-cdef-1234567890ab',
  'vertexai',
  'gemini-2.5-flash',
  'v1.0',
  'v1.0',
  'queued'::parsing_job_status,
  'normal'::parsing_priority,
  '793074a4-a70c-4f6e-9e2e-2723dedbb5a3',
  'idemp_resume_b1a2c3d4',
  NOW(),
  NOW()
) ON CONFLICT (id) DO NOTHING;

-- 4. Create Outbox Event for Resume Parse Request (ID: f1a2b3c4-5678-90ab-cdef-1234567890ab)
INSERT INTO outbox_events (
  id,
  aggregate_type,
  aggregate_id,
  event_type,
  payload,
  status,
  occurred_at,
  updated_at
) VALUES (
  'f1a2b3c4-5678-90ab-cdef-1234567890ab',
  'resume_parsing_job',
  'b1a2c3d4-5678-90ab-cdef-1234567890ab',
  'resume.parse.requested',
  jsonb_build_object(
    'schema_version', 1,
    'parsing_job_id', 'b1a2c3d4-5678-90ab-cdef-1234567890ab',
    'candidate_id', '7a776a6e-462c-448c-8318-c358ead01d96',
    'document_id', 'd1e2f3a4-5678-90ab-cdef-1234567890ab'
  ),
  'pending',
  NOW(),
  NOW()
) ON CONFLICT (id) DO NOTHING;
```

---

## 📌 STEP 3: Execute AI Resume Parsing Task (FastAPI AI Worker)

### ❓ What happens in real life?
Cloud Tasks triggers FastAPI AI Worker `/internal/tasks/resume/parse`. FastAPI Worker downloads PDF bytes from Supabase Storage, extracts text via Gemini 2.5 Flash, and writes structured JSON facts to `resume_parsed_data`!

### ✍️ Manual Action in Swagger UI (`http://localhost:8080/docs`):

1. Make sure worker is running:
   ```cmd
   .\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8080
   ```
2. Open browser: **`http://localhost:8080/docs`**
3. Find **`POST /internal/tasks/resume/parse`**.
4. Click **"Try it out"**.
5. Paste Task JSON Payload:

```json
{
  "schema_version": 1,
  "event_id": "f1a2b3c4-5678-90ab-cdef-1234567890ab",
  "aggregate_id": "b1a2c3d4-5678-90ab-cdef-1234567890ab",
  "trace_id": "11a2b3c4-5678-90ab-cdef-1234567890ab"
}
```
6. Click **Execute**.

### 🔍 Verify in Supabase SQL Editor:
```sql
-- Check AI Extracted Parsed Data Evidence
SELECT parsing_job_id, document_id, extracted_text, overall_confidence, schema_version, created_at 
FROM resume_parsed_data 
WHERE parsing_job_id = 'b1a2c3d4-5678-90ab-cdef-1234567890ab';
```

---

## 📌 STEP 4: Vishesh Reviews & Confirms Canonical Profile Facts

### ❓ What happens in real life?
Frontend UI displays AI-extracted fields to Vishesh. Vishesh reviews the extracted facts (Title: "Technical Specialist", Exp: 9.9 Yrs, Skills: Java, Spring Boot, Microservices, PostgreSQL, ReactJS, AWS, Docker, Kubernetes) and clicks **"Confirm & Save Profile"**.
NestJS saves confirmed canonical facts to `candidate_profiles` and `candidate_skills`.

### ✍️ Execute SQL in Supabase SQL Editor:

```sql
-- 1. Vishesh Confirms Profile Details (from AI Extracted: "Vishesh Mahale")
UPDATE users 
SET first_name = 'Vishesh', last_name = 'Mahale'
WHERE id = '793074a4-a70c-4f6e-9e2e-2723dedbb5a3';

UPDATE candidate_profiles
SET 
  professional_title = 'Technical Specialist',
  current_location = 'Pune, India',
  city = 'Pune',
  state = 'Maharashtra',
  country = 'India',
  willing_to_relocate = TRUE,
  preferred_work_mode = 'hybrid'
WHERE id = '7a776a6e-462c-448c-8318-c358ead01d96';

-- 2. Vishesh Confirms Canonical Skills (Exact matching AI Extracted Skills)
INSERT INTO candidate_skills (
  candidate_id, custom_skill_name, primary_source_type, years_of_experience, created_at, updated_at
) VALUES 
  ('7a776a6e-462c-448c-8318-c358ead01d96', 'Java', 'candidate_manual'::profile_fact_source, 9.9, NOW(), NOW()),
  ('7a776a6e-462c-448c-8318-c358ead01d96', 'Spring Boot', 'candidate_manual'::profile_fact_source, 9.9, NOW(), NOW()),
  ('7a776a6e-462c-448c-8318-c358ead01d96', 'Microservices', 'candidate_manual'::profile_fact_source, 9.9, NOW(), NOW()),
  ('7a776a6e-462c-448c-8318-c358ead01d96', 'PostgreSQL', 'candidate_manual'::profile_fact_source, 5.0, NOW(), NOW()),
  ('7a776a6e-462c-448c-8318-c358ead01d96', 'ReactJS', 'candidate_manual'::profile_fact_source, 4.0, NOW(), NOW()),
  ('7a776a6e-462c-448c-8318-c358ead01d96', 'AWS', 'candidate_manual'::profile_fact_source, 4.0, NOW(), NOW()),
  ('7a776a6e-462c-448c-8318-c358ead01d96', 'Docker', 'candidate_manual'::profile_fact_source, 3.0, NOW(), NOW()),
  ('7a776a6e-462c-448c-8318-c358ead01d96', 'Kubernetes', 'candidate_manual'::profile_fact_source, 3.0, NOW(), NOW())
ON CONFLICT DO NOTHING;

-- 3. Emit Profile Changed Outbox Event for Projection Rebuild (ID: c1d2e3f4-1234-4567-8901-abcdef123456)
INSERT INTO outbox_events (
  id, aggregate_type, aggregate_id, event_type, payload, status, occurred_at, updated_at
) VALUES (
  'c1d2e3f4-1234-4567-8901-abcdef123456',
  'candidate',
  '7a776a6e-462c-448c-8318-c358ead01d96',
  'candidate.profile.changed',
  jsonb_build_object('schema_version', 1, 'candidate_id', '7a776a6e-462c-448c-8318-c358ead01d96', 'user_id', '793074a4-a70c-4f6e-9e2e-2723dedbb5a3'),
  'pending',
  NOW(),
  NOW()
) ON CONFLICT (id) DO NOTHING;
```

---

## 📌 STEP 5: Candidate Search Projection & 768-dim Vector Rebuild (PD-002 Pipeline)

### ❓ What happens in real life?
FastAPI Worker receives `POST /internal/tasks/candidate/projection`.
Worker executes PD-002 rule: `Confirmed Canonical Facts + Active Parsed Resume Data` ➔ Generates **768-dim `pgvector` embedding** (`text-embedding-004`) ➔ Writes to `candidate_search_profiles`.

### ✍️ Manual Action in Swagger UI (`http://localhost:8080/docs`):

1. Find **`POST /internal/tasks/candidate/projection`**.
2. Paste Task Contract JSON Payload:

```json
{
  "schema_version": 1,
  "event_id": "c1d2e3f4-1234-4567-8901-abcdef123456",
  "aggregate_id": "7a776a6e-462c-448c-8318-c358ead01d96",
  "trace_id": "11a2b3c4-5678-90ab-cdef-1234567890ab"
}
```
3. Click **Execute**.

### 🔍 Verify in Supabase SQL Editor:
```sql
SELECT 
  candidate_id,
  professional_title,
  skill_names,
  vector_dims(embedding) AS vector_dimensions,
  searchable_text
FROM candidate_search_profiles
WHERE candidate_id = '7a776a6e-462c-448c-8318-c358ead01d96';
```
*(You will see `vector_dimensions` = **768**!)*

---

## 📌 STEP 6: Recruiter Job Posting & AI Job Enrichment (Binay - HR Persona)

### ❓ What happens in real life?
Binay (HR) creates a Company (`companies`) and a Job Posting (`jobs`). FastAPI worker enriches description, creates `ai_ideal_candidate_profile` JSONB, and generates a **768-dimensional Job Vector**.

### ✍️ Execute SQL in Supabase SQL Editor:

```sql
-- 1. Update Recruiter Binay in public.users (ID: 3bfce4c4-635b-4d61-bed0-0908259c86f2)
UPDATE users 
SET 
  first_name = 'Binay',
  last_name = 'HR',
  role = 'employer'::public.user_role,
  status = 'active'::public.account_status
WHERE id = '3bfce4c4-635b-4d61-bed0-0908259c86f2';

-- 2. Create Company Entity (ID: c1a2b3c4-5678-90ab-cdef-1234567890ab)
INSERT INTO companies (
  id, name, slug, email, owner_id, created_at, updated_at
) VALUES (
  'c1a2b3c4-5678-90ab-cdef-1234567890ab',
  'TechCorp Global',
  'techcorp-global',
  'contact@techcorp.com',
  '3bfce4c4-635b-4d61-bed0-0908259c86f2',
  NOW(),
  NOW()
) ON CONFLICT (id) DO NOTHING;

-- 3. Create Job Posting by Binay (ID: 98765432-10fe-dcba-ba98-76543210fedc)
INSERT INTO jobs (
  id,
  company_id,
  created_by,
  title,
  slug,
  description,
  responsibilities,
  requirements,
  location_city,
  location_state,
  location_country,
  work_mode,
  employment_type,
  status,
  created_at,
  updated_at
) VALUES (
  '98765432-10fe-dcba-ba98-76543210fedc',
  'c1a2b3c4-5678-90ab-cdef-1234567890ab',
  '3bfce4c4-635b-4d61-bed0-0908259c86f2',
  'Senior Full Stack & Java/Spring Boot Lead',
  'senior-full-stack-java-lead',
  'We are looking for a Senior Technical Lead / Full Stack Developer with strong experience in Java, Spring Boot, Microservices, ReactJS, PostgreSQL, Docker, and AWS.',
  'Design high throughput microservices, lead architectural decisions, and build scalable web applications.',
  'At least 5+ years of experience in Java, Spring Boot, Microservices, PostgreSQL, React, AWS, Docker/Kubernetes.',
  'Pune',
  'Maharashtra',
  'India',
  'hybrid',
  'full_time',
  'published',
  NOW(),
  NOW()
) ON CONFLICT (id) DO NOTHING;

-- 4. Create Outbox Event for Job Enrichment Request (ID: e5f6a7b8-1234-5678-90ab-cdef12345678)
INSERT INTO outbox_events (
  id, aggregate_type, aggregate_id, event_type, payload, status, occurred_at, updated_at
) VALUES (
  'e5f6a7b8-1234-5678-90ab-cdef12345678',
  'job',
  '98765432-10fe-dcba-ba98-76543210fedc',
  'job.ai.enrichment.requested',
  jsonb_build_object('schema_version', 1, 'job_id', '98765432-10fe-dcba-ba98-76543210fedc'),
  'pending',
  NOW(),
  NOW()
) ON CONFLICT (id) DO NOTHING;
```

### ✍️ Manual Action in Swagger UI (`http://localhost:8080/docs`):

1. Find **`POST /internal/tasks/job/enrich`**.
2. Paste Task Contract JSON Payload:

```json
{
  "schema_version": 1,
  "event_id": "e5f6a7b8-1234-5678-90ab-cdef12345678",
  "aggregate_id": "98765432-10fe-dcba-ba98-76543210fedc",
  "trace_id": "22a3b4c5-6789-0abc-def1-234567890abc"
}
```
3. Click **Execute**.

---

## 📌 STEP 7: Live AI Match Score & Vector Cosine Similarity Search

### ✍️ Execute SQL in Supabase SQL Editor:

```sql
SELECT 
  u.first_name || ' ' || u.last_name AS candidate_name,
  c.professional_title AS candidate_role,
  j.title AS job_title,
  ROUND((1 - (c.embedding <=> j.embedding))::numeric * 100, 2) AS ai_vector_match_percentage
FROM candidate_search_profiles c
JOIN candidate_profiles cp ON cp.id = c.candidate_id
JOIN users u ON u.id = cp.user_id
CROSS JOIN jobs j
WHERE j.id = '98765432-10fe-dcba-ba98-76543210fedc';
```

**🎉 SUCCESS! You will see Vishesh Mahale matched against Binay's job with `ai_vector_match_percentage` calculated live in PostgreSQL via 768-dim `pgvector`!**
