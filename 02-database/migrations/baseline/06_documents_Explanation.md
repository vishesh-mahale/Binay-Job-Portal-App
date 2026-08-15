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
| `document_type` | `resume` | Validated request |
| `original_file_name` | `Rahul_Resume.pdf` | Original display name |
| `file_extension` | `pdf` | Server-derived/validated |
| `file_size_bytes` | `245760` | Uploaded stream |
| `mime_type` | `application/pdf` | Server validation |
| `storage_bucket` | Private bucket | Server config |
| `storage_path` | Generated object path | NestJS, client nahi |
| `checksum_sha256` | 64-char lowercase hash | Required; NestJS streaming upload |
| `security_scan_status` | `pending → clean` | Security worker |
| `security_scan_result` | Scanner JSON | Security worker |
| `processing_status` | `uploaded → processing...` | Processing orchestration |
| `metadata` | Upload-source JSON | NestJS |
| `updated_at` | Last mutable-state timestamp | Database trigger on scan/processing update |
| `deleted_at` | NULL/timestamp | Soft-delete/retention flow |

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
  "document_type": "resume",
  "original_file_name": "Rahul_Resume.pdf",
  "file_size_bytes": 245760,
  "mime_type": "application/pdf",
  "checksum_sha256": "a4f916...",
  "security_scan_status": "pending",
  "processing_status": "uploaded"
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

## 5. Duplicate file

Unique checksum indexes owner/session scope mein duplicate active file rokti hain.

```text
Same user + same checksum → existing document reuse
Same guest session + same checksum → existing document reuse
Different users + same checksum → separate private ownership allowed
```

NestJS unique error expose nahi karega; concurrent conflict par existing row load
karke idempotent response dega.

## 6. Security scan

```text
pending → scanning → clean
                   └→ infected/quarantined/failed
```

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
status `clean` ho. Failed/infected/quarantined file se parsing job start nahi hogi.

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
