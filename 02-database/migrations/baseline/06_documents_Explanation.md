# 06 Documents — Detailed Hinglish Explanation

## 1. Is file ka kaam

`06_documents.sql` actual file content store nahi karti. PDF/DOCX private object
storage mein hoti hai; database mein file ki registry, ownership, checksum,
security scan aur processing state hoti hai.

```text
Browser → NestJS → Private Storage
                    +
                    → uploaded_documents row
```

## 2. Tables

```text
guest_upload_sessions(Guest user)
uploaded_documents (Authenticated user or Guest user)
```

### `guest_upload_sessions`

Guest ke paas `users.id` nahi hota. Yeh table usse limited, job-scoped upload
permission deti hai.

| Column | Example | Kab/kaun likhega |
|---|---|---|
| `id` | Session UUID | Database/NestJS create time |
| `job_id` | Java job UUID | Required; guest jis job par apply kar raha hai |
| `token_hash` | Hashed random token | NestJS; raw token DB mein nahi |
| `email` | `rahul@example.com` | Guest form, NestJS normalize/validate |
| `status` | `active` | Create par active; service later update |
| `max_upload_count` | `3` | Server policy |
| `max_total_bytes` | `31457280` | Server policy, 30 MB example |
| `uploaded_count` | `0 → 1` | Successful upload transaction |
| `uploaded_bytes` | `0 → 245760` | Successful upload transaction |
| `expires_at` | Future timestamp | NestJS policy |
| `consumed_at` | Timestamp/NULL | Application flow complete hone par |
| `revoked_at` | Timestamp/NULL | Security/cancel action par |

Lifecycle:

```text
active → consumed
active → expired
active → revoked
```

### `uploaded_documents`

Har uploaded file ki registry.

| Column | Example | Meaning/writer |
|---|---|---|
| `id` | Document UUID | Database |
| `uploaded_by_user_id` | Candidate user UUID | Registered upload mein NestJS |
| `guest_upload_session_id` | Guest session UUID | Guest upload mein NestJS |
| `checksum_sha256` | `b8a3c195...` (64 hex chars) | NestJS; `createHash('sha256').update(file.buffer).digest('hex')` — same user + same checksum → `reused: true` |
| `processing_status` | `queued` | **DB Trigger only** (trg_sync_processing_status). Worker kabhi directly update nahi karta. See lifecycle below |
| `security_scan_status` | `clean` | **FastAPI Worker** updates. ClamAV scan stages. See lifecycle below |
| `security_scan_result` | `{"verdict":"clean",...}` | **FastAPI Worker** — full scan JSON result |
| `document_type` | `resume` | Validated request — resume, cover_letter, certificate, other |
| `original_file_name` | `Rahul_Resume.pdf` | Original display name as uploaded by user |
| `file_extension` | `pdf` | Server-derived/validated |
| `file_size_bytes` | `245760` | Uploaded stream; max 10MB (`MAX_DOCUMENT_SIZE_BYTES`) |
| `mime_type` | `application/pdf` | Server validation |
| `storage_bucket` | `job-portal-uploads` | Server config — GCS bucket name |
| `storage_path` | `candidates/{id}/resumes/{id}.pdf` | NestJS-generated GCS object path |
| `created_at` | `2026-09-09 07:26:20` | Database default `NOW()` |
| `updated_at` | `2026-09-10 04:27:40` | Trigger on scan/processing update |
| `deleted_at` | `NULL` / timestamp | Soft-delete/retention flow |
| `metadata` | `{}` | Currently not in use; reserved for future (extracted text, tags, etc.) |

#### `processing_status` lifecycle (DB Trigger only)

```text
resume_parsing_jobs.status   →   processing_status
-----------------------------------
queued                       →   'queued'
processing                   →   'processing'
completed                    →   'completed'
partial                      →   'partial'
failed                       →   'failed'
cancelled                    →   'failed'
```

Worker sirf `resume_parsing_jobs.status` update karta hai.
DB trigger `trg_sync_processing_status` usse `uploaded_documents.processing_status` mein copy karta hai.

#### `security_scan_status` lifecycle (FastAPI Worker)

```text
Stage           Updated By                     Value Change                  Kab
--------------- ------------------------------ ---------------------------- -------------------------
Upload          NestJS INSERT (default)        → 'pending'                   File upload pe
Scan start      Worker (task_handlers.py)      'pending'/'failed' → 'scanning'  ClamAV scan shuru
Scan clean      Worker (task_handlers.py)      'scanning' → 'clean'         File safe hai
Scan infected   Worker (task_handlers.py)      'scanning' → 'infected'      Virus/malware mila
Scan error      Worker (task_handlers.py)      'scanning' → 'failed'        ClamAV unavailable
```

**Note:** `quarantined` enum mein exist karta hai but koi code kabhi set nahi karta.

Ownership XOR rule:

```text
Registered: uploaded_by_user_id present, guest session NULL
Guest:      uploaded_by_user_id NULL, guest session present
```

## 3. Registered upload example

```text
Candidate selects Rahul_Resume.pdf
→ Next.js POST /resumes/upload
→ NestJS validates auth/file/signature/size
→ NestJS calculates checksum
→ Existing same-user checksum check
→ Private storage upload
→ uploaded_documents + security.scan.requested outbox event in one transaction
→ commit
```

Example row:

```json
{
  "id": "doc-101",
  "uploaded_by_user_id": "user-rahul",
  "guest_upload_session_id": null,
  "checksum_sha256": "b8a3c195ccb5102f1537c6a59172dbe8c6d9a13fb8de81721f2a056499a4b46b",
  "processing_status": "uploaded",
  "security_scan_status": "pending",
  "security_scan_result": null,
  "document_type": "resume",
  "original_file_name": "Rahul_Resume.pdf",
  "file_extension": "pdf",
  "file_size_bytes": 245760,
  "mime_type": "application/pdf",
  "storage_bucket": "job-portal-uploads",
  "storage_path": "candidates/user-rahul/resumes/doc-101.pdf",
  "metadata": {}
}
```

## 4. Guest upload example

```text
Guest opens published Job A
→ NestJS creates job-scoped session/token
→ Guest uploads resume with raw session token
→ NestJS hashes/verifies token and limits
→ uploaded_documents stores guest session origin
```

Guest later registers ho to original document owner rewrite nahi hoga. Application
and profile junctions relation establish karengi; upload provenance historical hai.

## 5. Duplicate file & `.doc` rejection

Unique checksum indexes owner/session scope mein duplicate active file rokti hain.

```text
Same user + same checksum → existing document reuse (reused: true)
Same guest session + same checksum → existing document reuse (reused: true)
Different users + same checksum → separate private ownership allowed
```

NestJS unique error expose nahi karega; concurrent conflict par existing row load
karke idempotent response dega.

**`.doc` files:** Upload allowed hai (`.doc` in `allowed_extensions`), but parsing
mein `document_extractor.py` reject karta hai — error: "Legacy .doc format is not
supported. Please convert to .docx and re-upload."

## 6. Security scan

```text
pending → scanning → clean
                    └→ infected
                    └→ failed
```

**Note:** `quarantined` enum mein hai but code mein set nahi hota.

Only `clean` resume ko `07_resume_processing.sql` parsing queue mein bhejna chahiye.
Scanner fail/infected ho to candidate ko safe message mile, internal details nahi.

Final ordering:

```text
uploaded_documents + security.scan.requested outbox
→ Dispatcher → Google Cloud Tasks → security scanner
→ security_scan_status = clean
→ resume_parsing_jobs + resume.parse.requested outbox
→ Dispatcher → Google Cloud Tasks → Cloud Run FastAPI
```

Parsing task file ko tabhi download/process karegi jab document active ho aur scan
status `clean` ho. Failed/infected file se parsing job start nahi hogi.

## 7. Delete behavior

Normal API physical `DELETE` nahi karegi:

```text
deleted_at = NOW()
```

Actual file/database purge only retention worker karega after authorization,
audit event, storage deletion and retry/compensation policy.

## 8. Kaun kisko call karta hai?

| Caller | Target | Purpose |
|---|---|---|
| Next.js | NestJS | File choose/upload |
| NestJS | Storage | Private object upload |
| NestJS | PostgreSQL | Session/document registry |
| NestJS | PostgreSQL transaction | Document row + scan outbox event |
| Dispatcher | Google Cloud Tasks | Reliable scan/parse task delivery |
| Security worker | Storage/PostgreSQL | File scan and result update |
| NestJS or trusted scan-completion handler | PostgreSQL transaction | Clean document ke liye parsing job + parse outbox event |
| Cloud Run FastAPI | `07` tables | Clean resume parsing शुरू |

## 9. One-line memory rule

> `06` batati hai file kya hai, kahan rakhi hai, kis origin se aayi aur safe hai
> ya nahi; resume ke andar kya likha hai, woh `07` batati hai.
