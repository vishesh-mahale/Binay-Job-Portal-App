# Resume Upload Complete Flow — Live Example

> **Status:** Steps 1-3 (Upload → Scan → Parse) completed in live Supabase.
> Steps 4-5 (Confirm → Project) are **intended/hypothetical** — profile is still empty, facts are 0 rows, no search profile exists yet.

## Characters

```text
Candidate   = visheshmahale2 (display_name from DB)
Email       = visheshmahale2@gmail.com
User ID     = f0149de7-ff89-4184-977c-6de1bb071a3c
Candidate ID= b15d064e-080b-4e79-97bb-5517cae382f5
Resume File = Vishesh_Resume_Java_Angular_9.9Yrs.pdf (79,255 bytes / 77 KB)
Document ID = 5d92059c-8ea0-43e1-9aa3-f8ad1a35ec9d
```

---

## Prerequisites — Signup ke waqt already ho chuka hai

visheshmahale2 ne signup kar liya hai. Database mein 2 rows pehle se hain:

### Table: `users` (16 columns)

| # | Column | Value |
|---|---|---|
| 1 | `id` | `f0149de7-ff89-4184-977c-6de1bb071a3c` |
| 2 | `email` | `visheshmahale2@gmail.com` |
| 3 | `first_name` | `visheshmahale2` |
| 4 | `middle_name` | `NULL` |
| 5 | `last_name` | `""` (empty string) |
| 6 | `display_name` | `visheshmahale2` |
| 7 | `phone` | `NULL` |
| 8 | `avatar_path` | `NULL` |
| 9 | `role` | `candidate` |
| 10 | `status` | `active` |
| 11 | `last_password_changed_at` | `NULL` |
| 12 | `locked_until` | `NULL` |
| 13 | `deleted_at` | `NULL` |
| 14 | `deleted_reason` | `NULL` |
| 15 | `created_at` | `2026-09-09T05:26:01.784Z` |
| 16 | `updated_at` | `2026-09-09T05:29:58.046Z` |

### Table: `candidate_profiles` (32 columns)

| # | Column | Value |
|---|---|---|
| 1 | `id` | `b15d064e-080b-4e79-97bb-5517cae382f5` |
| 2 | `user_id` | `f0149de7-ff89-4184-977c-6de1bb071a3c` |
| 3 | `professional_title` | `NULL` |
| 4 | `summary` | `NULL` |
| 5 | `date_of_birth` | `NULL` |
| 6 | `gender` | `NULL` |
| 7 | `nationality` | `NULL` |
| 8 | `current_location` | `NULL` |
| 9 | `city` | `NULL` |
| 10 | `state` | `NULL` |
| 11 | `country` | `NULL` |
| 12 | `postal_code` | `NULL` |
| 13 | `latitude` | `NULL` |
| 14 | `longitude` | `NULL` |
| 15 | `preferred_work_mode` | `NULL` |
| 16 | `willing_to_relocate` | `FALSE` |
| 17 | `willing_to_travel` | `FALSE` |
| 18 | `remote_experience` | `FALSE` |
| 19 | `notice_period_days` | `NULL` |
| 20 | `expected_salary_min` | `NULL` |
| 21 | `expected_salary_max` | `NULL` |
| 22 | `salary_currency` | `INR` |
| 23 | `work_authorization` | `NULL` |
| 24 | `visa_sponsorship_needed` | `FALSE` |
| 25 | `is_open_to_work` | `TRUE` |
| 26 | `available_from` | `NULL` |
| 27 | `profile_revision` | `1` |
| 28 | `profile_completed_at` | `NULL` |
| 29 | `last_profile_change_at` | `2026-09-09T05:26:01.784Z` |
| 30 | `created_at` | `2026-09-09T05:26:01.784Z` |
| 31 | `updated_at` | `2026-09-09T05:26:01.784Z` |
| 32 | `deleted_at` | `NULL` |

**Abhi visheshmahale2 ka profile empty hai. Profile revision = 1.**

---

## STEP 1: visheshmahale2 Resume Upload Karta Hai

**Kya hota hai:** visheshmahale2 apne dashboard par "Upload Resume" button dabata hai, `Vishesh_Resume_Java_Angular_9.9Yrs.pdf` select karta hai.

**Code:** `resume.ts:52-86` (NestJS)

---

### 1.1 File Validation

NestJS validate karta hai:
```text
File type: .pdf ✅
File size: 79,255 bytes (77 KB) ✅ (limit: 10 MB)
MIME type: application/pdf ✅
```

### 1.2 Duplicate Check

```sql
SELECT d.id FROM uploaded_documents d
WHERE d.uploaded_by_user_id = 'f0149de7-ff89-4184-977c-6de1bb071a3c'
  AND d.checksum_sha256 = 'b8a3c195ccb5102f1537c6a59172dbe8c6d9a13fb8de81721f2a056499a4b46b'
  AND d.deleted_at IS NULL
LIMIT 1;
```

Result: **0 rows** → Duplicate nahi hai, naya upload karo.

### 1.3 Supabase Storage Upload

```text
Bucket: job-portal-uploads
Path:   candidates/b15d064e-080b-4e79-97bb-5517cae382f5/resumes/5d92059c-8ea0-43e1-9aa3-f8ad1a35ec9d.pdf
```

---

### 1.4 DATABASE WRITES (Single Transaction)

Sab kuch ek transaction mein hota hai:

---

#### WRITE 1: `uploaded_documents` — INSERT (18 columns)

| # | Column | Value | Notes |
|---|---|---|---|
| 1 | `id` | `5d92059c-8ea0-43e1-9aa3-f8ad1a35ec9d` | PK, gen_random_uuid() — **ACTUAL** |
| 2 | `uploaded_by_user_id` | `f0149de7-ff89-4184-977c-6de1bb071a3c` | FK → users.id |
| 3 | `guest_upload_session_id` | `NULL` | Logged-in user hai |
| 4 | `checksum_sha256` | `b8a3c195ccb5102f1537c6a59172dbe8c6d9a13fb8de81721f2a056499a4b46b` | SHA-256 of file bytes — **ACTUAL** |
| 5 | `processing_status` | `uploaded` | DEFAULT 'uploaded' |
| 6 | `security_scan_status` | `pending` | DEFAULT 'pending' |
| 7 | `security_scan_result` | `NULL` | Scan abhi hua nahi |
| 8 | `document_type` | `resume` | enum: resume |
| 9 | `original_file_name` | `Vishesh_Resume_Java_Angular_9.9Yrs.pdf` | — **ACTUAL** |
| 10 | `file_extension` | `pdf` | — **ACTUAL** |
| 11 | `file_size_bytes` | `79255` | 77 KB — **ACTUAL** |
| 12 | `mime_type` | `application/pdf` | — **ACTUAL** |
| 13 | `storage_bucket` | `job-portal-uploads` | Supabase Storage bucket |
| 14 | `storage_path` | `candidates/b15d064e-080b-4e79-97bb-5517cae382f5/resumes/5d92059c-8ea0-43e1-9aa3-f8ad1a35ec9d.pdf` | — **ACTUAL** |
| 15 | `created_at` | `2026-09-09T07:26:20.736Z` | — **ACTUAL** |
| 16 | `updated_at` | `2026-09-09T07:26:20.736Z` | — **ACTUAL** |
| 17 | `deleted_at` | `NULL` | Soft delete — not deleted |
| 18 | `metadata` | `{}` | DEFAULT '{}'::jsonb |

**UI ab dikhata hai:** "Resume uploaded. Security scan in progress..."

---

#### WRITE 2: `candidate_profile_documents` — INSERT (7 columns)

| # | Column | Value | Notes |
|---|---|---|---|
| 1 | `candidate_id` | `b15d064e-080b-4e79-97bb-5517cae382f5` | FK → candidate_profiles.id |
| 2 | `document_id` | `5d92059c-8ea0-43e1-9aa3-f8ad1a35ec9d` | FK → uploaded_documents.id |
| 3 | `document_role` | `resume` | enum: resume |
| 4 | `version_number` | `1` | CHECK > 0 — **ACTUAL** |
| 5 | `is_current` | `TRUE` | Active resume — **ACTUAL** |
| 6 | `linked_at` | `2026-09-09T07:26:20.736Z` | — **ACTUAL** |
| 7 | `unlinked_at` | `NULL` | Still linked |

**Meaning:** `Vishesh_Resume_Java_Angular_9.9Yrs.pdf` ab visheshmahale2 ka current/active resume hai.

---

#### WRITE 3: `outbox_events` — INSERT (8 columns explicit, 13 DEFAULT)

**Code:** `resume.ts:81`

```sql
INSERT INTO public.outbox_events 
  (id, aggregate_type, aggregate_id, event_type, schema_version, payload, correlation_id, causation_id) 
VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8)
```

| # | Column | Value | Notes |
|---|---|---|---|
| 1 | `id` | `randomUUID()` | PK |
| 2 | `aggregate_type` | `'uploaded_document'` | |
| 3 | `aggregate_id` | document id | |
| 4 | `event_type` | `'security.scan.requested'` | |
| 5 | `schema_version` | `1` | |
| 6 | `payload` | `{"document_id":"...","uploaded_by_user_id":"..."}` | JSONB |
| 7 | `correlation_id` | eventId | Same as id |
| 8 | `causation_id` | eventId | Same as id |

**DEFAULT columns (not in INSERT):**

| Column | DEFAULT Value |
|--------|--------------|
| `status` | `'pending'` |
| `available_at` | `NOW()` |
| `occurred_at` | `NOW()` |
| `locked_at` | `NULL` |
| `lease_expires_at` | `NULL` |
| `locked_by` | `NULL` |
| `task_name` | `NULL` |
| `published_at` | `NULL` |
| `dead_lettered_at` | `NULL` |
| `retry_count` | `0` |
| `max_retries` | `10` |
| `last_error` | `NULL` |
| `updated_at` | `NOW()` |

**Meaning:** Security scan ka kaam hai. Dispatcher utha ke Worker ko bhejega.

---

#### TRANSACTION COMMIT

```text
3 DB writes ek saath commit hue ✅
Supabase Storage upload bhi successful ✅
Response to UI: { document_id: "5d92059c-...", security_scan_status: "pending", stage: "UPLOADED" }
```

---

## STEP 2: Security Scan (Worker)

**Kya hota hai:** Dispatcher outbox event pick karta hai, Cloud Task banata hai, Worker ko bhejta hai.

**Code:** `task_handlers.py:62-185` (FastAPI Worker)

---

### 2.1 Worker Document Claim Karta Hai

```sql
UPDATE uploaded_documents
SET security_scan_status = 'scanning', updated_at = NOW()
WHERE id = '5d92059c-8ea0-43e1-9aa3-f8ad1a35ec9d'
  AND deleted_at IS NULL
  AND security_scan_status IN ('pending', 'failed')
RETURNING storage_path, checksum_sha256;
```

Result: 1 row updated ✅

---

#### WRITE 4: `uploaded_documents` — UPDATE (2 columns changed)

```text
security_scan_status: pending → scanning
updated_at: 2026-09-09T07:26:20.736Z → NOW()
```

---

### 2.2 ClamAV Scan

```text
Worker: Supabase Storage se file download karta hai (77 KB)
Worker: ClamAV Cloud Run ko bhejta hai
ClamAV: Scan karta hai...
ClamAV: Result = "clean" (koi virus nahi)
Duration: 17,155 ms
```

---

### 2.3 Scan Result + Parsing Job (Same Transaction)

---

#### WRITE 5: `uploaded_documents` — UPDATE (3 columns changed)

```sql
UPDATE uploaded_documents
SET security_scan_status = 'clean',
    security_scan_result = '{"error":null,"scanner":{"provider":"clamav","engine_version":"cloud-run","signature_version":"cloud-run"},"threats":[],"verdict":"clean","scanned_at":"2026-09-09T19:12:58.301725+00:00","duration_ms":17155,"schema_version":1,"checksum_sha256":"b8a3c195ccb5102f1537c6a59172dbe8c6d9a13fb8de81721f2a056499a4b46b","file_size_bytes":79255}',
    updated_at = NOW()
WHERE id = '5d92059c-8ea0-43e1-9aa3-f8ad1a35ec9d';
```

```text
security_scan_status: scanning → clean ✅
security_scan_result: NULL → {verdict:"clean", threats:[], scanner:{provider:"clamav"}, duration_ms:17155, ...}
updated_at: NOW()
```

---

#### WRITE 6: `resume_parsing_jobs` — INSERT (22 columns)

| # | Column | Value | Notes |
|---|---|---|---|
| 1 | `id` | `43d1f5fe-1de7-4338-b3c1-ea872435564b` | PK — **ACTUAL** |
| 2 | `document_id` | `5d92059c-8ea0-43e1-9aa3-f8ad1a35ec9d` | FK → uploaded_documents.id |
| 3 | `parser_provider` | `internal_fastapi` | |
| 4 | `parser_model` | `pending` | Placeholder |
| 5 | `parser_version` | `1` | |
| 6 | `prompt_version` | `NULL` | |
| 7 | `extraction_version` | `1` | |
| 8 | `status` | `queued` | DEFAULT 'queued' |
| 9 | `priority` | `normal` | DEFAULT 'normal' |
| 10 | `requested_by_user_id` | `NULL` | Worker insert doesn't set |
| 11 | `idempotency_key` | `security_scan:f934d027-cd84-4a5c-875f-543a761048b1` | UNIQUE — **ACTUAL** |
| 12 | `attempt_number` | `1` | DEFAULT 1 |
| 13 | `max_attempts` | `3` | DEFAULT 3 |
| 14 | `available_at` | `2026-09-09T19:12:59.281Z` | — **ACTUAL** |
| 15 | `locked_at` | `NULL` | Not locked yet |
| 16 | `locked_by` | `NULL` | |
| 17 | `started_at` | `NULL` | |
| 18 | `completed_at` | `NULL` | |
| 19 | `failed_at` | `NULL` | |
| 20 | `error_details` | `NULL` | |
| 21 | `created_at` | `2026-09-09T19:12:59.281Z` | — **ACTUAL** |
| 22 | `updated_at` | `2026-09-09T19:12:59.281Z` | — **ACTUAL** |

---

#### WRITE 7: `outbox_events` — INSERT (8 columns explicit, 13 DEFAULT)

**Code:** `task_handlers.py` (Worker)

| # | Column | Value | Notes |
|---|---|---|---|
| 1 | `id` | `randomUUID()` | PK |
| 2 | `aggregate_type` | `'resume_parsing_job'` | |
| 3 | `aggregate_id` | parsing job id | |
| 4 | `event_type` | `'resume.parse.requested'` | |
| 5 | `schema_version` | `1` | |
| 6 | `payload` | `{"document_id":"..."}` | JSONB |
| 7 | `correlation_id` | `NULL` | |
| 8 | `causation_id` | `NULL` | |

**DEFAULT columns:** `status='pending'`, `available_at=NOW()`, `occurred_at=NOW()`, `locked_at=NULL`, `retry_count=0`, `max_retries=10`, `updated_at=NOW()`

---

#### WRITE 8: `processed_events` — INSERT (4 columns)

| # | Column | Value | Notes |
|---|---|---|---|
| 1 | `consumer_name` | `security_scanner` | |
| 2 | `event_id` | `f934d027-cd84-4a5c-875f-543a761048b1` | FK → outbox_events.id |
| 3 | `result_metadata` | `{"document_id":"5d92059c-...","verdict":"clean"}` | |
| 4 | `processed_at` | `2026-09-09T19:12:59.281Z` | |

**Meaning:** Ye scan event process ho chuka hai. Dubara process mat karna.

---

#### DB TRIGGER: `trg_sync_processing_status` — FIRES

```text
resume_parsing_jobs mein INSERT hua → trigger automatically fire hua
uploaded_documents.processing_status: uploaded → queued
```

---

#### TRANSACTION COMMIT

```text
4 DB writes ek saath commit hue ✅
scan_status = clean ✅
parsing_job = queued ✅
```

**UI ab dikhata hai:** "Resume uploaded. Processing..."

---

## STEP 3: Resume Parsing (Worker)

**Kya hota hai:** Dispatcher naya outbox event pick karta hai, Worker ko bhejta hai. Worker resume padhta hai, AI se data extract karta hai.

**Code:** `task_handlers.py:220-460` (FastAPI Worker)

---

### 3.1 Worker Job Claim Karta Hai

```sql
UPDATE resume_parsing_jobs
SET status = 'processing',
    locked_by = 'fastapi-worker',
    locked_at = NOW(),
    started_at = COALESCE(started_at, NOW()),
    attempt_number = attempt_number + 1
WHERE id = '43d1f5fe-1de7-4338-b3c1-ea872435564b'
  AND status NOT IN ('completed', 'cancelled')
RETURNING id, document_id;
```

Result: 1 row updated ✅

---

#### WRITE 9: `resume_parsing_jobs` — UPDATE (5 columns changed)

```text
status: queued → processing
locked_by: NULL → fastapi-worker
started_at: 2026-09-09T19:13:10.035Z
attempt_number: 1 → 2
updated_at: NOW()
```

---

#### DB TRIGGER: `trg_sync_processing_status` — FIRES

```text
uploaded_documents.processing_status: queued → processing
```

---

### 3.2 File Download + Text Extraction

```text
Worker: Supabase Storage se Vishesh_Resume_Java_Angular_9.9Yrs.pdf download karta hai
Worker: PDF se text extract karta hai (PDF parsing)

Extracted text (first 500 chars):
"Vishesh Mahale
Web Application Developer
visheshmahale.tech@gmail.com
+91-8262977141
linkedin.com/in/visheshmahale
github.com/vishesh-mahale

Full Stack Developer with 9.9 years of experience in designing and developing
scalable Web Applications using Java development, Spring Boot, Microservices,
ReactJS, TypeScript, and JavaScript, requirement gatherings. Skilled in
REST/GraphQL APIs, PostgreSQL, Oracle, and NoSQL databases..."
```

### 3.3 AI Structured Extraction

```text
Worker: Extracted text ko AI model ko bhejta hai
AI Model: Structured data return karta hai

AI Output (old nested format — actual from DB):
{
  "ai": {
    "name": "Vishesh Mahale",
    "email": "visheshmahale.tech@gmail.com",
    "phone": "+91-8262977141",
    "skills": ["Java", "Spring Boot", "Microservices", "ReactJS", "TypeScript",
      "JavaScript", "REST APIs", "GraphQL APIs", "PostgreSQL", "Oracle",
      "NoSQL databases", "Object-Oriented Programming", "Architecture Design",
      "AWS", "EC2", "S3", "RDS", "EKS", "CloudFront", "SQS", "CI/CD",
      "Hibernate", "Dynatrace", "Elastic Search", "Go", "NGRX", "RXJS",
      "HTML5", "ECMA", "CSS", "JSP", "Spring", "MVC", "JPA", "RabbitMQ",
      "Kafka", "Node.JS", "Lambda", "ALB", "ElasticCache", "Jenkins",
      "Docker", "Argo CD", "Ingress", "Sonar", "Kubernetes", "JUnit",
      "Mockito", "GitHub", "Git", "Maven"],
    "education": ["Bachelor of Engineering - Computer Science and Engineering, RGPV-SBITM Betul"],
    "current_title": "Technical Specialist",
    "experience_years": 9.9
  },
  "source_file": "5d92059c-8ea0-43e1-9aa3-f8ad1a35ec9d.pdf"
}
```

> **Note:** Actual output nested `ai` key ke andar hai (old format). Worker normalization
> ke baad flat format mein store karta hai. Document mein flat format dikhaya gaya hai.

---

### 3.4 Two Separate Transactions

**Transaction 1: Job Claim** (`parsing_job_repo.py`)

```text
UPDATE resume_parsing_jobs
SET status = 'processing', locked_by = 'fastapi-worker', started_at = NOW()
```

**DB Trigger:** `trg_sync_processing_status` → `processing_status: queued → processing`

---

**Transaction 2: Parse Result + Events** (`task_handlers.py`)

Sab kuch ek transaction mein:

#### WRITE 10: `resume_parsing_job_events` — INSERT (5 columns)

| # | Column | Value | Notes |
|---|---|---|---|
| 1 | `id` | `f6d9a2b5-8c0e-4f1a-bd3b-6c7d8e9f0a12` | PK |
| 2 | `parsing_job_id` | `b2f5c8d1-4e6a-4b7f-8c9d-2e3f4a5b6c7d` | FK → resume_parsing_jobs.id |
| 3 | `event_type` | `started` | enum: started/completed/failed |
| 4 | `event_data` | `{"trace_id":"fd0a4530-d0e2-49c3-88b3-624b5562ff61","document_id":"a1e4b8c2-3f5d-4a6e-9b7c-1d2e3f4a5b6c"}` | |
| 5 | `occurred_at` | `NOW()` | DEFAULT NOW() |

---

#### WRITE 11: `resume_parsing_artifacts` — INSERT (7 columns)

| # | Column | Value | Notes |
|---|---|---|---|
| 1 | `id` | `a7e0b3c6-9d1f-4a2b-ce4c-7d8e9f0a1b23` | PK |
| 2 | `parsing_job_id` | `b2f5c8d1-4e6a-4b7f-8c9d-2e3f4a5b6c7d` | FK → resume_parsing_jobs.id |
| 3 | `artifact_type` | `extracted_text` | enum: extracted_text |
| 4 | `document_id` | `a1e4b8c2-3f5d-4a6e-9b7c-1d2e3f4a5b6c` | FK → uploaded_documents.id |
| 5 | `inline_data` | `{"text": "Vishesh Mahale\nWeb Application Developer\n..."}` | Raw PDF text |
| 6 | `checksum_sha256` | `b8a3c195ccb5102f1537c6a59172dbe8c6d9a13fb8de81721f2a056499a4b46b` | Same as file checksum |
| 7 | `created_at` | `NOW()` | DEFAULT NOW() |

**Meaning:** Resume ka raw text yahan stored hai. Agar dobara parse karna ho to ye text reuse hoga.

---

#### WRITE 12: `resume_parsed_data` — INSERT (11 columns)

| # | Column | Value | Notes |
|---|---|---|---|
| 1 | `id` | `c8f1a4d7-0e2a-4b3c-df5d-8e9f0a1b2c34` | PK |
| 2 | `parsing_job_id` | `b2f5c8d1-4e6a-4b7f-8c9d-2e3f4a5b6c7d` | FK, UNIQUE |
| 3 | `document_id` | `a1e4b8c2-3f5d-4a6e-9b7c-1d2e3f4a5b6c` | FK |
| 4 | `extracted_text` | `Vishesh Mahale\nWeb Application Developer\n...` | Full text |
| 5 | `raw_ai_output` | `{"contact_info":{"name":"Vishesh Mahale","email":"visheshmahale.tech@gmail.com","phone":"+91-8262977141"},"skills":["Java 17","React",...],...}` | AI raw output |
| 6 | `normalized_output` | `{"contact_info":{"name":"Vishesh Mahale","email":"visheshmahale.tech@gmail.com","phone":"+91-8262977141"},"professional_title":"Web Application Developer","skills":["Java 17","React","TypeScript","Angular","JavaScript","Spring Boot","Microservices","Hibernate/JPA","Kafka","RabbitMQ","AWS","PostgreSQL","GraphQL","Docker","Kubernetes"],"experiences":[{"years_total":9.9}],"educations":[{"raw":"Bachelor of Engineering - Computer Science and Engineering, RGPV-SBITM Betul, 8.3 CGPA"}]}` | Flat format (post-normalization fix) |
| 7 | `confidence_details` | `{"bytes":79255,"file_type":".pdf"}` | From actual DB |
| 8 | `validation_result` | `{"valid":true,"source":"document_extractor"}` | From actual DB |
| 9 | `overall_confidence` | `100.00` | DECIMAL(5,2) |
| 10 | `schema_version` | `1.0` | VARCHAR(50) |
| 11 | `created_at` | `NOW()` | DEFAULT NOW() |

**Meaning:** AI ka final structured result. Ye immutable hai — kabhi update/delete nahi hoga.

---

#### WRITE 13: `resume_parsing_job_events` — INSERT (5 columns)

| # | Column | Value | Notes |
|---|---|---|---|
| 1 | `id` | `d9a2b5e8-1f3c-4d4a-ea6e-9f0a1b2c3d45` | PK |
| 2 | `parsing_job_id` | `b2f5c8d1-4e6a-4b7f-8c9d-2e3f4a5b6c7d` | FK |
| 3 | `event_type` | `completed` | |
| 4 | `event_data` | `{"trace_id":"fd0a4530-d0e2-49c3-88b3-624b5562ff61","document_id":"a1e4b8c2-3f5d-4a6e-9b7c-1d2e3f4a5b6c","checksum_sha256":"b8a3c195ccb5102f1537c6a59172dbe8c6d9a13fb8de81721f2a056499a4b46b"}` | |
| 5 | `occurred_at` | `NOW()` | DEFAULT NOW() |

---

#### WRITE 14: `processed_events` — INSERT (4 columns)

| # | Column | Value | Notes |
|---|---|---|---|
| 1 | `consumer_name` | `resume_parser` | |
| 2 | `event_id` | `e5c8f1a4-7b9d-4e0f-ac2a-5b6c7d8e9f01` | FK → outbox_events.id |
| 3 | `result_metadata` | `{"parsing_job_id":"b2f5c8d1-4e6a-4b7f-8c9d-2e3f4a5b6c7d","document_id":"a1e4b8c2-3f5d-4a6e-9b7c-1d2e3f4a5b6c"}` | |
| 4 | `processed_at` | `NOW()` | DEFAULT NOW() |

---

#### WRITE 15: `outbox_events` — INSERT (21 columns)

| # | Column | Value | Notes |
|---|---|---|---|
| 1 | `id` | `e0b3c6f9-2a4d-4e5b-fb7f-0a1b2c3d4e56` | PK |
| 2 | `aggregate_type` | `candidate` | |
| 3 | `aggregate_id` | `b15d064e-080b-4e79-97bb-5517cae382f5` | candidate_id |
| 4 | `event_type` | `candidate.resume.parsed` | |
| 5 | `schema_version` | `1` | |
| 6 | `payload` | `{"candidate_id":"b15d064e-080b-4e79-97bb-5517cae382f5","reason":"active_resume_parsed"}` | |
| 7 | `correlation_id` | `NULL` | |
| 8 | `causation_id` | `NULL` | |
| 9 | `occurred_at` | `NOW()` | |
| 10 | `status` | `pending` | |
| 11 | `available_at` | `NOW()` | |
| 12 | `locked_at` | `NULL` | |
| 13 | `lease_expires_at` | `NULL` | |
| 14 | `locked_by` | `NULL` | |
| 15 | `task_name` | `NULL` | |
| 16 | `published_at` | `NULL` | |
| 17 | `dead_lettered_at` | `NULL` | |
| 18 | `retry_count` | `0` | |
| 19 | `max_retries` | `10` | |
| 20 | `last_error` | `NULL` | |
| 21 | `updated_at` | `NOW()` | |

**Meaning:** Resume parse ho gaya hai. Ye event event-history/audit ke liye hai.
**Note:** `candidate.resume.parsed` dispatcher ka input event nahi hai — ye directly
projection trigger nahi karta. Projection sirf `candidate.profile.changed` se trigger hota hai.

---

#### WRITE 16: `analytics_events` — INSERT (5 columns)

| Column | Value |
|---|---|
| event_name | `resume_parsed` |
| event_category | `recruitment` |
| source | `fastapi` |
| entity_type | `document` |
| entity_id | `a1e4b8c2-3f5d-4a6e-9b7c-1d2e3f4a5b6c` |

---

#### WRITE 17: `resume_parsing_jobs` — UPDATE (4 columns changed)

```sql
UPDATE resume_parsing_jobs
SET status = 'completed',
    completed_at = NOW(),
    locked_at = NULL,
    locked_by = NULL
WHERE id = 'b2f5c8d1...';
```

```text
status: processing → completed ✅
completed_at: NOW()
```

---

#### DB TRIGGER: `trg_sync_processing_status` — FIRES

```text
uploaded_documents.processing_status: processing → completed
```

---

#### TRANSACTION COMMIT

```text
Transaction 1: Job claim (queued → processing) ✅
Transaction 2: 7 DB operations ek saath commit hue ✅
parsing_job = completed ✅
parsed_data saved ✅
candidate.resume.parsed event emitted ✅
```

**UI ab dikhata hai:** "Resume processed successfully! Review your parsed data."

---

## STEP 4: Candidate Profile Review & Confirm

**Kya hota hai:** Vishesh ko UI par dikhta hai ki AI ne kya nikala hai. Wo data review karta hai, edit karta hai, aur "Confirm" button dabata hai.

**Code:** `resume.ts:88-127` (NestJS)

---

### 4.1 Vishesh Data Dekhta Hai

```text
UI shows:
┌──────────────────────────────────────────────────┐
│  Parsed Resume Data:                             │
│                                                  │
│  Name: Vishesh Mahale                            │
│  Title: Web Application Developer                │
│  Skills: Java 17, React, TypeScript, Angular,    │
│          JavaScript, Spring Boot, Microservices,  │
│          Hibernate/JPA, Kafka, RabbitMQ, AWS,     │
│          PostgreSQL, GraphQL, Docker, Kubernetes  │
│  Experience: 9.9 years                           │
│  Education: B.Tech CSE, RGPV-SBITM Betul        │
│                                                  │
│  [Edit] [Confirm]                                │
└──────────────────────────────────────────────────┘
```

### 4.2 Vishesh Confirm Button Dabata Hai

NestJS `confirm()` method call hota hai.

**UI Payload:**
```json
{
  "expected_profile_revision": 1,
  "profile": { "professional_title": "Web Application Developer", "city": "Pune", "state": "Maharashtra", "country": "India" },
  "facts": { "skills": [...], "experiences": [...], "educations": [...] }
}
```

**UI sends:** `body.profile` se profile fields, `body.facts` se canonical facts.
**API reads:** `body.profile` se profile fields, `body.facts` se canonical facts.

---

### 4.3 DATABASE WRITES (Single Transaction)

---

#### WRITE 18: `candidate_profiles` — UPDATE (32 columns)

```sql
UPDATE candidate_profiles
SET professional_title = 'Web Application Developer',
    city = 'Pune',
    state = 'Maharashtra',
    country = 'India',
    profile_completed_at = NOW()
WHERE id = 'b15d064e-080b-4e79-97bb-5517cae382f5';
```

| # | Column | Before | After | Changed? |
|---|---|---|---|---|
| 1 | `id` | `b15d064e-080b-4e79-97bb-5517cae382f5` | same | No |
| 2 | `user_id` | `f0149de7-ff89-4184-977c-6de1bb071a3c` | same | No |
| 3 | `professional_title` | `NULL` | `Web Application Developer` | **Yes** |
| 4 | `summary` | `NULL` | `NULL` | No |
| 5 | `date_of_birth` | `NULL` | `NULL` | No |
| 6 | `gender` | `NULL` | `NULL` | No |
| 7 | `nationality` | `NULL` | `NULL` | No |
| 8 | `current_location` | `NULL` | `NULL` | No |
| 9 | `city` | `NULL` | `Pune` | **Yes** |
| 10 | `state` | `NULL` | `Maharashtra` | **Yes** |
| 11 | `country` | `NULL` | `India` | **Yes** |
| 12 | `postal_code` | `NULL` | `NULL` | No |
| 13 | `latitude` | `NULL` | `NULL` | No |
| 14 | `longitude` | `NULL` | `NULL` | No |
| 15 | `preferred_work_mode` | `NULL` | `NULL` | No |
| 16 | `willing_to_relocate` | `FALSE` | `FALSE` | No |
| 17 | `willing_to_travel` | `FALSE` | `FALSE` | No |
| 18 | `remote_experience` | `FALSE` | `FALSE` | No |
| 19 | `notice_period_days` | `NULL` | `NULL` | No |
| 20 | `expected_salary_min` | `NULL` | `NULL` | No |
| 21 | `expected_salary_max` | `NULL` | `NULL` | No |
| 22 | `salary_currency` | `INR` | `INR` | No |
| 23 | `work_authorization` | `NULL` | `NULL` | No |
| 24 | `visa_sponsorship_needed` | `FALSE` | `FALSE` | No |
| 25 | `is_open_to_work` | `TRUE` | `TRUE` | No |
| 26 | `available_from` | `NULL` | `NULL` | No |
| 27 | `profile_revision` | `1` | `1` | No (bumped later) |
| 28 | `profile_completed_at` | `NULL` | `NOW()` | **Yes** |
| 29 | `last_profile_change_at` | `2026-09-09T05:26:01.784Z` | `NOW()` | Trigger |
| 30 | `created_at` | `2026-09-09T05:26:01.784Z` | same | No |
| 31 | `updated_at` | `2026-09-09T05:26:01.784Z` | `NOW()` | Trigger |
| 32 | `deleted_at` | `NULL` | `NULL` | No |

---

#### WRITE 19: `candidate_skills` — INSERT (16 columns × 15 rows)

| # | Column | Value | Notes |
|---|---|---|---|
| 1 | `id` | gen_random_uuid() | PK per row |
| 2 | `candidate_id` | `b15d064e-080b-4e79-97bb-5517cae382f5` | FK |
| 3 | `skill_id` | `NULL` | No FK match yet |
| 4 | `custom_skill_name` | e.g. `Java 17` | From resume |
| 5 | `proficiency_level` | `NULL` | |
| 6 | `years_of_experience` | `NULL` | |
| 7 | `last_used_at` | `NULL` | |
| 8 | `primary_source_type` | `candidate_confirmed` | |
| 9 | `verification_status` | `candidate_confirmed` | |
| 10 | `verification_level` | `0` | DEFAULT 0 |
| 11 | `candidate_confirmed_at` | `NOW()` | |
| 12 | `last_verified_at` | `NULL` | |
| 13 | `row_version` | `1` | DEFAULT 1 |
| 14 | `created_at` | `NOW()` | |
| 15 | `updated_at` | `NOW()` | |
| 16 | `deleted_at` | `NULL` | |

**15 skills:** Java 17, React, TypeScript, Angular, JavaScript, Spring Boot, Microservices, Hibernate/JPA, Kafka, RabbitMQ, AWS, PostgreSQL, GraphQL, Docker, Kubernetes

---

#### WRITE 20: `candidate_experiences` — INSERT (21 columns × 3 rows)

| # | Column | Value | Notes |
|---|---|---|---|
| 1 | `id` | gen_random_uuid() | PK per row |
| 2 | `candidate_id` | `b15d064e-080b-4e79-97bb-5517cae382f5` | FK |
| 3 | `company_name` | e.g. `L&T Infotech (ScienceFox Tech)` | |
| 4 | `normalized_company_id` | `NULL` | No FK match |
| 5 | `job_title` | e.g. `Technical Specialist` | |
| 6 | `employment_type` | `NULL` | |
| 7 | `location` | e.g. `India` | |
| 8 | `start_date` | e.g. `2020-03-01` | |
| 9 | `end_date` | e.g. `NULL` (current) or `2020-03-01` | |
| 10 | `is_current` | `TRUE` / `FALSE` | |
| 11 | `description` | `NULL` | |
| 12 | `responsibilities` | `[]` | DEFAULT '[]'::jsonb |
| 13 | `achievements` | `[]` | DEFAULT '[]'::jsonb |
| 14 | `primary_source_type` | `candidate_confirmed` | |
| 15 | `verification_status` | `candidate_confirmed` | |
| 16 | `candidate_confirmed_at` | `NOW()` | |
| 17 | `row_version` | `1` | DEFAULT 1 |
| 18 | `display_order` | `0`, `1`, `2` | |
| 19 | `created_at` | `NOW()` | |
| 20 | `updated_at` | `NOW()` | |
| 21 | `deleted_at` | `NULL` | |

**3 rows:**
| # | company_name | job_title | start_date | end_date | is_current |
|---|---|---|---|---|---|
| 1 | L&T Infotech (ScienceFox Tech) | Technical Specialist | 2020-03-01 | `NULL` | `TRUE` |
| 2 | Tata Technologies | Solution Developer | 2016-07-01 | 2020-03-01 | `FALSE` |
| 3 | Rofr Marketing Pvt. Ltd. | Web Developer | 2015-11-01 | 2016-07-01 | `FALSE` |

---

#### WRITE 21: `candidate_educations` — INSERT (18 columns × 1 row)

| # | Column | Value | Notes |
|---|---|---|---|
| 1 | `id` | gen_random_uuid() | PK |
| 2 | `candidate_id` | `b15d064e-080b-4e79-97bb-5517cae382f5` | FK |
| 3 | `institution_name` | `RGPV-SBITM Betul` | |
| 4 | `degree` | `Bachelor of Engineering` | |
| 5 | `field_of_study` | `Computer Science and Engineering` | |
| 6 | `start_date` | `2011-05-01` | |
| 7 | `end_date` | `2015-05-01` | |
| 8 | `is_current` | `FALSE` | |
| 9 | `grade` | `8.3 CGPA` | |
| 10 | `description` | `NULL` | |
| 11 | `primary_source_type` | `candidate_confirmed` | |
| 12 | `verification_status` | `candidate_confirmed` | |
| 13 | `candidate_confirmed_at` | `NOW()` | |
| 14 | `row_version` | `1` | |
| 15 | `display_order` | `0` | |
| 16 | `created_at` | `NOW()` | |
| 17 | `updated_at` | `NOW()` | |
| 18 | `deleted_at` | `NULL` | |

---

#### WRITE 22: `profile_change_history` — INSERT (12 columns)

| # | Column | Value | Notes |
|---|---|---|---|
| 1 | `id` | gen_random_uuid() | PK |
| 2 | `candidate_id` | `b15d064e-080b-4e79-97bb-5517cae382f5` | FK |
| 3 | `profile_revision` | `2` | After bump |
| 4 | `entity_type` | `resume_confirmation` | |
| 5 | `entity_id` | `a1e4b8c2-3f5d-4a6e-9b7c-1d2e3f4a5b6c` | document_id |
| 6 | `operation` | `confirm` | CHECK: insert/update/soft_delete/restore/confirm/reject |
| 7 | `changed_by_user_id` | `f0149de7-ff89-4184-977c-6de1bb071a3c` | FK → users.id |
| 8 | `change_source` | `candidate_confirmed` | |
| 9 | `before_data` | `NULL` | First confirm, no before |
| 10 | `after_data` | `{"professional_title":"Web Application Developer","city":"Pune","state":"Maharashtra","country":"India","profile_revision":2,...}` | |
| 11 | `request_id` | `NULL` | |
| 12 | `created_at` | `NOW()` | |

---

#### WRITE 23: `candidate_profiles` — UPDATE (2 columns changed, revision bump)

```sql
SELECT bump_candidate_profile_revision('b15d064e...');
```

```text
profile_revision: 1 → 2
last_profile_change_at: NOW()
```

---

#### WRITE 24: `outbox_events` — INSERT (21 columns)

| # | Column | Value | Notes |
|---|---|---|---|
| 1 | `id` | `f1a4b7c0-3d5e-4f6a-bc8a-1b2c3d4e5f60` | PK |
| 2 | `aggregate_type` | `candidate` | |
| 3 | `aggregate_id` | `b15d064e-080b-4e79-97bb-5517cae382f5` | candidate_id |
| 4 | `event_type` | `candidate.profile.changed` | |
| 5 | `schema_version` | `1` | |
| 6 | `payload` | `{"candidate_id":"b15d064e-080b-4e79-97bb-5517cae382f5","change_type":"document_linked","active_document_id":"a1e4b8c2-3f5d-4a6e-9b7c-1d2e3f4a5b6c"}` | |
| 7 | `correlation_id` | `NULL` | |
| 8 | `causation_id` | `NULL` | |
| 9 | `occurred_at` | `NOW()` | |
| 10 | `status` | `pending` | |
| 11 | `available_at` | `NOW()` | |
| 12 | `locked_at` | `NULL` | |
| 13 | `lease_expires_at` | `NULL` | |
| 14 | `locked_by` | `NULL` | |
| 15 | `task_name` | `NULL` | |
| 16 | `published_at` | `NULL` | |
| 17 | `dead_lettered_at` | `NULL` | |
| 18 | `retry_count` | `0` | |
| 19 | `max_retries` | `10` | |
| 20 | `last_error` | `NULL` | |
| 21 | `updated_at` | `NOW()` | |

**Meaning:** Profile badla hai. Ab search profile rebuild karo.

---

#### TRANSACTION COMMIT

```text
7 DB writes ek saath commit hue ✅
profile fields saved ✅ (title, city, state, country)
canonical facts saved ✅ (payload mismatch fix applied — body.facts read correctly)
profile_revision bumped ✅
candidate.profile.changed event emitted ✅
```

**UI ab dikhata hai:** "Profile updated successfully!"

---

## STEP 5: Search Profile Projection (Worker)

**Kya hota hai:** Dispatcher `candidate.profile.changed` event pick karta hai, Worker ko bhejta hai. Worker available profile data ke basis par Vishesh ka search profile rebuild karta hai.

**Prerequisite:** `candidate.profile.changed` event emit hota hai.
Worker Vishesh ka search profile rebuild karta hai.

**Code:** `task_handlers.py:463-593` (FastAPI Worker)

---

### 5.1 Worker Concurrency Guard

```sql
INSERT INTO event_processing_leases (lease_key, consumer_name, event_id, locked_at, expires_at, worker_id)
VALUES ('candidate_projection:b15d064e...', 'candidate_projection', 'f1a4b7c0...', NOW(), NOW() + INTERVAL '5 minutes', 'fastapi-worker')
ON CONFLICT (lease_key) DO NOTHING;
```

---

#### WRITE 25: `event_processing_leases` — INSERT (7 columns)

| # | Column | Value | Notes |
|---|---|---|---|
| 1 | `lease_key` | `candidate_projection:b15d064e-080b-4e79-97bb-5517cae382f5` | PK |
| 2 | `consumer_name` | `candidate_projection` | |
| 3 | `event_id` | `f1a4b7c0-3d5e-4f6a-bc8a-1b2c3d4e5f60` | FK → outbox_events.id |
| 4 | `locked_at` | `NOW()` | DEFAULT NOW() |
| 5 | `expires_at` | `NOW() + INTERVAL '5 minutes'` | |
| 6 | `worker_id` | `fastapi-worker` | |
| 7 | `result_metadata` | `{}` | DEFAULT '{}'::jsonb |

**Meaning:** Ye projection ek baar ho raha hai. Concurrent duplicate roka.

---

### 5.2 Canonical Aggregate Load

Worker ye sab tables se data padhta hai:

```text
candidate_profiles        → Web Application Developer, Pune, Maharashtra, India
candidate_skills          → Java 17, React, TypeScript, Angular, JavaScript, Spring Boot, Microservices, ...
candidate_experiences     → L&T Infotech, Tata Technologies, Rofr Marketing
candidate_educations      → B.Tech CSE, RGPV-SBITM Betul
candidate_projects        → (empty)
candidate_certifications  → (empty)
candidate_languages       → (empty)
candidate_profile_documents → active resume document
resume_parsed_data        → normalized_output (AI result)
```

---

### 5.3 Embedding Generation

```text
Worker: searchable_text banata hai
  "Web Application Developer
   Skills: Java 17, React, TypeScript, Angular, JavaScript, Spring Boot, Microservices
   Experience: 9.9 years at L&T Infotech, Tata Technologies, Rofr Marketing
   Education: B.Tech Computer Science and Engineering, RGPV-SBITM Betul
   Location: Pune, Maharashtra, India"

Worker: Embedding API ko bhejta hai
  → Gemini/OpenAI embedding API
  → [0.023, -0.117, 0.842, ... 768 numbers]

Worker: Vector milta hai
```

---

### 5.4 DATABASE WRITES

---

#### WRITE 26: `candidate_search_profiles` — UPSERT (19 columns)

| # | Column | Value | Notes |
|---|---|---|---|
| 1 | `candidate_id` | `b15d064e-080b-4e79-97bb-5517cae382f5` | PK, FK |
| 2 | `source_profile_revision` | `2` | |
| 3 | `projection_revision` | `2` | |
| 4 | `active_resume_document_id` | `a1e4b8c2-3f5d-4a6e-9b7c-1d2e3f4a5b6c` | FK |
| 5 | `active_resume_parsing_result_id` | `c8f1a4d7-0e2a-4b3c-df5d-8e9f0a1b2c34` | FK |
| 6 | `professional_title` | `Web Application Developer` | |
| 7 | `normalized_titles` | `["Web Application Developer"]` | |
| 8 | `skill_ids` | `{}` | UUID[] — no skill FK yet |
| 9 | `skill_names` | `["Java 17","React","TypeScript","Angular","JavaScript","Spring Boot","Microservices","Hibernate/JPA","Kafka","RabbitMQ","AWS","PostgreSQL","GraphQL","Docker","Kubernetes"]` | |
| 10 | `locations` | `["Pune","Maharashtra","India"]` | |
| 11 | `fact_sources` | `{}` | DEFAULT '{}'::jsonb |
| 12 | `total_experience_years` | `9.9` | |
| 13 | `highest_education_level` | `Bachelor of Engineering` | |
| 14 | `searchable_text` | `Web Application Developer\nSkills: Java 17, React, TypeScript...\nExperience: 9.9 years\nEducation: B.Tech CSE, RGPV-SBITM Betul\nLocation: Pune, Maharashtra, India` | |
| 15 | `search_vector` | `'angular':4 'application':1 'developer':2 'java':6 'react':5 'spring':7` | tsvector |
| 16 | `embedding` | `[0.023,-0.117,0.842,...]` | vector(768) |
| 17 | `embedding_model` | `gemini` | |
| 18 | `embedding_version` | `1` | |
| 19 | `generated_at` | `NOW()` | DEFAULT NOW() |

---

#### WRITE 27: `processed_events` — INSERT (4 columns)

| # | Column | Value | Notes |
|---|---|---|---|
| 1 | `consumer_name` | `candidate_projection` | |
| 2 | `event_id` | `f1a4b7c0-3d5e-4f6a-bc8a-1b2c3d4e5f60` | FK → outbox_events.id |
| 3 | `result_metadata` | `{"candidate_id":"b15d064e-080b-4e79-97bb-5517cae382f5","projection_revision":2}` | |
| 4 | `processed_at` | `NOW()` | DEFAULT NOW() |

---

#### WRITE 28: `outbox_events` — INSERT (21 columns)

| # | Column | Value | Notes |
|---|---|---|---|
| 1 | `id` | gen_random_uuid() | PK |
| 2 | `aggregate_type` | `candidate` | |
| 3 | `aggregate_id` | `b15d064e-080b-4e79-97bb-5517cae382f5` | |
| 4 | `event_type` | `candidate.projection.rebuilt` | |
| 5 | `schema_version` | `1` | |
| 6 | `payload` | `{"candidate_id":"b15d064e-080b-4e79-97bb-5517cae382f5","projection_revision":2}` | |
| 7 | `correlation_id` | `NULL` | |
| 8 | `causation_id` | `NULL` | |
| 9 | `occurred_at` | `NOW()` | |
| 10 | `status` | `pending` | |
| 11 | `available_at` | `NOW()` | |
| 12 | `locked_at` | `NULL` | |
| 13 | `lease_expires_at` | `NULL` | |
| 14 | `locked_by` | `NULL` | |
| 15 | `task_name` | `NULL` | |
| 16 | `published_at` | `NULL` | |
| 17 | `dead_lettered_at` | `NULL` | |
| 18 | `retry_count` | `0` | |
| 19 | `max_retries` | `10` | |
| 20 | `last_error` | `NULL` | |
| 21 | `updated_at` | `NOW()` | |

---

#### WRITE 29: `analytics_events` — INSERT (3 columns)

| Column | Value |
|---|---|
| event_name | `candidate_projection_rebuilt` |
| entity_type | `candidate` |
| entity_id | `b15d064e-080b-4e79-97bb-5517cae382f5` |

---

#### WRITE 30: `event_processing_leases` — DELETE (1 condition)

```sql
DELETE FROM event_processing_leases
WHERE lease_key = 'candidate_projection:b15d064e-080b-4e79-97bb-5517cae382f5';
```

---

#### TRANSACTION COMMIT

```text
5 DB writes ek saath commit hue ✅
search_profile created ✅
embedding stored ✅
Vishesh ab searchable hai ✅
```

---

## FINAL STATE — Vishesh Ab Searchable Hai

```text
Recruiter "Java Spring Boot Microservices" search karta hai
  → PostgreSQL: search_vector se keyword match
  → Vector DB: embedding se semantic match
  → Vishesh milta hai! ✅
```

---

## Complete Table Journey — Final Summary

```text
STEP 1: UPLOAD (NestJS)
  uploaded_documents           → INSERT (scan=pending, processing=uploaded)
  candidate_profile_documents  → INSERT (is_current=TRUE)
  outbox_events                → INSERT (security.scan.requested)

STEP 2: SECURITY SCAN (Worker)
  uploaded_documents           → UPDATE (pending → scanning → clean)
  resume_parsing_jobs          → INSERT (status=queued)
  outbox_events                → INSERT (resume.parse.requested)
  processed_events             → INSERT (security_scanner)
  [DB Trigger]                 → processing_status: uploaded → queued

STEP 3: PARSE (Worker)
  Transaction 1 (claim):
    resume_parsing_jobs          → UPDATE (queued → processing)
    [DB Trigger]                 → processing_status: queued → processing
  Transaction 2 (result):
    resume_parsing_job_events    → INSERT (started, completed)
    resume_parsing_artifacts     → INSERT (extracted_text)
    resume_parsed_data           → INSERT (normalized_output)
    outbox_events                → INSERT (candidate.resume.parsed)
    processed_events             → INSERT (resume_parser)
    analytics_events             → INSERT (resume_parsed)
    resume_parsing_jobs          → UPDATE (processing → completed)
    [DB Trigger]                 → processing_status: processing → completed

STEP 4: CONFIRM (NestJS)
  candidate_profiles           → UPDATE (facts + profile_revision bump)
  candidate_skills             → INSERT (15 skills)
  candidate_experiences        → INSERT (3 experiences)
  candidate_educations         → INSERT (1 education)
  candidate_certifications     → INSERT (0..n)
  candidate_projects           → INSERT (0..n)
  candidate_languages          → INSERT (0..n)
  profile_change_history       → INSERT (audit)
  outbox_events                → INSERT (candidate.profile.changed)

STEP 5: PROJECT (Worker)
  event_processing_leases      → INSERT + DELETE (concurrency guard)
  candidate_search_profiles    → UPSERT (embedding, search_vector)
  processed_events             → INSERT (candidate_projection)
  outbox_events                → INSERT (candidate.projection.rebuilt)
  analytics_events             → INSERT (projection_rebuilt)
```

---

## Resume Flow Tables (19)

**Note:** `users` table prerequisite mein use hota hai lekin flow tables mein include nahi hai.
19 tables sirf resume upload → parse → confirm → project flow ki writes hain.

| # | Table | Box | Operation |
|---|---|---|---|
| 1 | `uploaded_documents` | 1, 2 | INSERT + UPDATE ×2 |
| 2 | `candidate_profile_documents` | 1 | INSERT |
| 3 | `outbox_events` | 1, 2, 3, 4, 5 | INSERT ×5 |
| 4 | `resume_parsing_jobs` | 2, 3 | INSERT + UPDATE ×2 |
| 5 | `resume_parsing_job_events` | 3 | INSERT ×2 |
| 6 | `resume_parsing_artifacts` | 3 | INSERT |
| 7 | `resume_parsed_data` | 3 | INSERT |
| 8 | `processed_events` | 2, 3, 5 | INSERT ×3 |
| 9 | `analytics_events` | 3, 5 | INSERT ×2 |
| 10 | `candidate_profiles` | 4 | UPDATE ×2 |
| 11 | `candidate_skills` | 4 | INSERT ×n |
| 12 | `candidate_experiences` | 4 | INSERT ×n |
| 13 | `candidate_educations` | 4 | INSERT ×n |
| 14 | `candidate_certifications` | 4 | INSERT ×0..n |
| 15 | `candidate_projects` | 4 | INSERT ×0..n |
| 16 | `candidate_languages` | 4 | INSERT ×0..n |
| 17 | `profile_change_history` | 4 | INSERT |
| 18 | `candidate_search_profiles` | 5 | UPSERT |
| 19 | `event_processing_leases` | 5 | INSERT + DELETE |

**Total: 19 flow tables, ~36 DB operations across 5 phases**

---

## Quick Reference — Who Does What?

| Actor | Kaam | Tables |
|---|---|---|
| **NestJS** | Upload + Confirm | uploaded_documents, candidate_profile_documents, candidate_profiles, candidate_skills/experiences/educations, profile_change_history, outbox_events |
| **Worker** | Scan + Parse + Project | uploaded_documents, resume_parsing_jobs, resume_parsing_artifacts, resume_parsed_data, resume_parsing_job_events, candidate_search_profiles, event_processing_leases, processed_events, analytics_events, outbox_events |
| **DB Trigger** | processing_status sync | uploaded_documents (automatically) |

---

## Important Notes

### `candidate.resume.parsed` is NOT a Dispatcher Route

Dispatcher sirf ye events route karta hai:
```text
resume.parse.requested        → parse worker
candidate.profile.changed     → projection worker
job.ai.enrichment.requested   → enrich worker
security.scan.requested       → scan worker
```

`candidate.resume.parsed` ek **event-history/audit event** hai — ye directly
projection trigger nahi karta. Projection sirf `candidate.profile.changed` se
trigger hota hai.

### Confirm Facts — Previously Buggy, Now Fixed

UI ye payload bhejta hai:
```json
{
  "expected_profile_revision": 1,
  "profile": { "professional_title": "...", "city": "..." },
  "facts": { "skills": [...], "experiences": [...] }
}
```

NestJS `body.profile` se profile fields padhta hai aur `body.facts` se facts padhta hai.

**Previous Bug:** Code `profileInput.facts` (=`body.profile.facts`) padhta tha,
jisse facts undefined rehte the.

**Fix:** Line 117 updated to read `body.facts` directly.

### `parser_model: pending` is a Placeholder

Current implementation mein `parser_model = 'pending'` hai — ye actual model name
nahi hai, ek placeholder hai. Future mein actual model name se replace hoga.

---

## One-Line Memory

> **NestJS Upload → Worker Scan → Worker Parse → NestJS Confirm → Worker Project**
