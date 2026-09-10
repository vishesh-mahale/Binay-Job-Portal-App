# Resume Processing Status — End-to-End Plan (v2)

## Problem

Resume upload ke baad `uploaded_documents.processing_status` hamesha `'uploaded'` rehta hai.
Worker sirf `resume_parsing_jobs.status` update karta hai, `uploaded_documents` nahi.
Frontend `processing_status` padhta hai → UI hamesha "UPLOADED" dikhata hai.

---

## Architecture: Source of Truth Distinction

```
resume_parsing_jobs.status        = Canonical parsing-job state (job-level)
uploaded_documents.security_scan_status = Canonical security state (document-level)
uploaded_documents.processing_status    = Derived document-level parsing projection (auto via trigger)
API stage                              = Derived UI-level stage (security + processing)
```

Ye distinction important hai — security lifecycle aur parsing lifecycle alag hain.

---

## Flow Overview

```
User uploads resume
  ↓
NestJS: INSERT uploaded_documents (processing_status='uploaded', security_scan_status='pending')
  ↓
FastAPI Worker (security scan task):
  UPDATE uploaded_documents SET security_scan_status = 'scanning'/'clean'/'infected'/'failed'
  ↓ (if clean)
NestJS: INSERT resume_parsing_jobs (status='queued')
  ↓ [TRIGGER FIRES: processing_status → queued]
FastAPI Worker (resume parse task):
  UPDATE resume_parsing_jobs SET status = 'processing'
  ↓ [TRIGGER FIRES: processing_status → processing]
FastAPI Worker:
  UPDATE resume_parsing_jobs SET status = 'completed'/'failed'/'partial'
  ↓ [TRIGGER FIRES: processing_status → completed/failed/partial]
Frontend polls GET /api/v1/resumes/:id/status → renders stage
```

---

## Table 1: uploaded_documents (Document-Level Status)

| Column | Type | Default | Updated By |
|---|---|---|---|
| `security_scan_status` | `security_scan_status` enum | `'pending'` | FastAPI Worker (security scan task) |
| `processing_status` | `resume_processing_status` enum | `'uploaded'` | **DB Trigger** (auto from resume_parsing_jobs) |

### processing_status transitions:

```
uploaded → queued → processing → completed
                          ↓          ↓
                        failed     partial
                          ↓
                     cancelled → failed (mapped)
```

---

## Table 2: resume_parsing_jobs (Job-Level Status)

| Column | Type | Default | Updated By |
|---|---|---|---|
| `status` | `parsing_job_status` enum | `'queued'` | FastAPI Worker |

### Status transitions:

```
queued → processing → completed
                  ↓       ↓
                failed  partial
                  ↓
              cancelled
```

---

## Service Responsibility Matrix

| Service | Tables it WRITES | Tables it READS |
|---|---|---|
| **NestJS API** | `uploaded_documents` (INSERT only), `resume_parsing_jobs` (INSERT only) | Both (for status/queries) |
| **FastAPI Worker** | `uploaded_documents.security_scan_status` (UPDATE), `resume_parsing_jobs.status` (UPDATE), `resume_parsed_data`, `resume_parsing_job_events`, `resume_parsing_artifacts`, `outbox_events` | `uploaded_documents`, `resume_parsing_jobs` |
| **DB Trigger** | `uploaded_documents.processing_status` (auto-sync) | `resume_parsing_jobs` |
| **Outbox Dispatcher** | `outbox_events` (status UPDATE) | `outbox_events` |
| **Frontend (Next.js)** | None (READ only) | All via API |

---

## Status Mapping: resume_parsing_jobs → uploaded_documents

| resume_parsing_jobs.status | uploaded_documents.processing_status | Reason |
|---|---|---|
| `queued` | `queued` | Direct mapping |
| `processing` | `processing` | Direct mapping |
| `completed` | `completed` | Direct mapping |
| `partial` | `partial` | Direct mapping |
| `failed` | `failed` | Direct mapping |
| `cancelled` | `failed` | `resume_processing_status` enum mein `cancelled` nahi hai. `failed` safest terminal state hai. UI `PARSING_FAILED` dikhayega. |

### Why `cancelled → failed`?

- `resume_processing_status` enum mein `cancelled` value exist nahi karta
- Agar `cancelled` ko "no change" rakhein to UI indefinitely `PARSING_IN_PROGRESS` dikhata rahega
- `failed` ek valid terminal state hai jo `resume_processing_status` enum mein hai
- UI stage derivation `PARSING_FAILED` dega — candidate ko pata chalega ki kuch gadbad hui

---

## Security Precedence Rule

Trigger mein ye check hoga:

```
IF uploaded_documents.security_scan_status IN ('infected', 'quarantined')
THEN
    DO NOT update processing_status
    (security reject ke baad parsing status irrelevant hai)
END IF
```

**Note:** Agar baad mein `security_scan_status` clean ho jaye (retry), to trigger parsing state ko automatically reconstruct nahi karega. Security state machine aur parsing state machine deliberately separate hain.

---

## Latest Job Rule

Trigger mein:

```
SELECT id, status FROM resume_parsing_jobs
WHERE document_id = v_doc_id
ORDER BY created_at DESC, id DESC
LIMIT 1

-- Only update if NEW.id = latest job id
-- Agar purana job complete hai but naya job hai → naye job ka status use karo
```

### Why `created_at DESC, id DESC`?

- `created_at` primary ordering hai — ye determine karta hai kaunsa job latest hai
- `id DESC` sirf tie-breaker hai — jab do jobs same `created_at` timestamp share karein
- UUID v4 random hota hai (monotonically increasing nahi), but `id DESC` same-timestamp rows ke liye deterministic order deta hai

---

## Trigger Design

### File: `20_resume_processing_status_sync.sql`

 Filename `20_...` hai kyunki `08_candidates.sql` already exist karta hai.

```sql
-- ============================================================================
-- Sync uploaded_documents.processing_status from resume_parsing_jobs
--
-- TRIGGER: trg_sync_processing_status
-- WHEN: AFTER INSERT OR UPDATE OF status ON resume_parsing_jobs
-- WHAT: Derives document-level processing_status from latest parsing job
--
-- RULES:
--   1. Only latest/current parsing job can update the document projection
--   2. Old/reparse jobs must never overwrite a newer job's status
--   3. Security scan state (infected/quarantined) must not be overwritten
--   4. cancelled maps to failed (resume_processing_status has no cancelled value)
-- ============================================================================

CREATE OR REPLACE FUNCTION sync_processing_status()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_doc_id UUID;
    v_latest_job_id UUID;
    v_latest_status parsing_job_status;
    v_scan_status security_scan_status;
BEGIN
    -- Get document_id from NEW row
    v_doc_id := NEW.document_id;

    -- Guard: document must exist (FK ensures this in normal flow, but guard for safety)
    IF NOT EXISTS (
        SELECT 1 FROM uploaded_documents WHERE id = v_doc_id
    ) THEN
        RETURN NEW;
    END IF;

    -- Find the latest parsing job for this document (deterministic tie-breaker)
    SELECT id, status INTO v_latest_job_id, v_latest_status
    FROM resume_parsing_jobs
    WHERE document_id = v_doc_id
    ORDER BY created_at DESC, id DESC
    LIMIT 1;

    -- Only proceed if the triggering job is the latest one
    IF v_latest_job_id IS DISTINCT FROM NEW.id THEN
        RETURN NEW;
    END IF;

    -- Check security scan status — security precedence
    SELECT security_scan_status INTO v_scan_status
    FROM uploaded_documents
    WHERE id = v_doc_id;

    IF v_scan_status IN ('infected', 'quarantined') THEN
        RETURN NEW;  -- Don't update processing_status
    END IF;

    -- Map job status → processing_status
    -- cancelled → failed because resume_processing_status enum has no cancelled value
    UPDATE uploaded_documents
    SET processing_status = CASE v_latest_status
        WHEN 'queued'     THEN 'queued'::resume_processing_status
        WHEN 'processing'  THEN 'processing'::resume_processing_status
        WHEN 'completed'   THEN 'completed'::resume_processing_status
        WHEN 'partial'     THEN 'partial'::resume_processing_status
        WHEN 'failed'      THEN 'failed'::resume_processing_status
        WHEN 'cancelled'   THEN 'failed'::resume_processing_status
        ELSE processing_status
    END,
    updated_at = NOW()
    WHERE id = v_doc_id;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_processing_status
    AFTER INSERT OR UPDATE OF status ON resume_parsing_jobs
    FOR EACH ROW
    EXECUTE FUNCTION sync_processing_status();
```

---

## API: UI Live Status

### API 1: Resume List (Resume Center card list)

```
GET /api/v1/resumes
```

**Response per resume:**
```json
{
  "document_id": "uuid",
  "security_scan_status": "clean",
  "processing_status": "completed",
  "stage": "REVIEW_READY",
  "retryable": false,
  "uploaded_at": "2026-09-09T..."
}
```

**Stage derivation (NestJS `candidate.ts` line 55-62):**
```typescript
scan pending/scanning      → UPLOADED / SECURITY_SCANNING
scan infected/quarantined  → SECURITY_REJECTED
scan failed                → SECURITY_RETRYABLE_FAILURE
processing uploaded/queued → UPLOADED / PARSING_QUEUED
processing processing      → PARSING_IN_PROGRESS
processing partial         → REVIEW_READY_PARTIAL
processing completed       → REVIEW_READY
else                       → PARSING_FAILED
```

**File:** `04-nestjs-api/04-nestjs-api-app/src/modules/candidates/candidate.ts:37-65`

---

### API 2: Single Resume Status (polling endpoint)

```
GET /api/v1/resumes/:id/status
```

**Response:**
```json
{
  "document_id": "uuid",
  "security_scan_status": "clean",
  "processing_status": "completed",
  "stage": "REVIEW_READY",
  "retryable": false,
  "parsing_job_id": "uuid",
  "parsing_job_status": "completed",
  "uploaded_at": "...",
  "updated_at": "..."
}
```

**File:** `04-nestjs-api/04-nestjs-api-app/src/modules/candidates/candidate.ts:88-119`

---

### API 3: Parsed Resume Data (after REVIEW_READY)

```
GET /api/v1/resumes/:id/parsed-data
```

**Response:**
```json
{
  "document_id": "uuid",
  "parsing_job_id": "uuid",
  "schema_version": "1.0",
  "overall_confidence": 100.0,
  "normalized_output": {
    "contact_info": { "name": "...", "email": "...", "phone": "..." },
    "professional_title": "...",
    "skills": ["..."],
    "experiences": [{ "years_total": 9.9 }],
    "educations": [{ "raw": "..." }]
  },
  "partial": false,
  "created_at": "..."
}
```

**File:** `04-nestjs-api/04-nestjs-api-app/src/modules/candidates/candidate.ts:121-157`

---

## Frontend Polling Flow

```
Page load → GET /api/v1/resumes (list all resumes with stage)
  ↓
User selects resume → GET /api/v1/resumes/:id/status (poll every 2-10s)
  ↓
stage = REVIEW_READY / REVIEW_READY_PARTIAL → GET /api/v1/resumes/:id/parsed-data
  ↓
Display parsed JSON in textarea → User confirms → POST /api/v1/resumes/:id/confirm
```

**File:** `03-nextjs-web/03-nextjs-web-app/src/app/dashboard/candidate/page.tsx:70-99`

---

## Enum Mapping Summary

| resume_parsing_jobs.status | uploaded_documents.processing_status | UI Stage |
|---|---|---|
| `queued` | `queued` | PARSING_QUEUED |
| `processing` | `processing` | PARSING_IN_PROGRESS |
| `completed` | `completed` | REVIEW_READY |
| `partial` | `partial` | REVIEW_READY_PARTIAL |
| `failed` | `failed` | PARSING_FAILED |
| `cancelled` | `failed` | PARSING_FAILED |

---

## Test Cases (Trigger Verification)

| # | Scenario | Expected processing_status |
|---|---|---|
| 1 | INSERT job with status='queued' | `queued` |
| 2 | UPDATE job status 'queued' → 'processing' | `processing` |
| 3 | UPDATE job status 'processing' → 'completed' | `completed` |
| 4 | UPDATE job status 'processing' → 'failed' | `failed` |
| 5 | UPDATE job status 'processing' → 'partial' | `partial` |
| 6 | UPDATE job status 'processing' → 'cancelled' | `failed` |
| 7 | Old job completed, new job processing → document shows `processing` | `processing` |
| 8 | Old job update cannot overwrite latest job | *(no change)* |
| 9 | security_scan_status='infected' → trigger does NOT update processing_status | *(unchanged)* |
| 10 | security_scan_status='clean' + new job → trigger updates normally | *(updated)* |
| 11 | Document missing (FK edge case) → trigger returns without error | *(no change)* |

---

## Pre-Implementation Verification

Migration deploy karne se pehle ye verify karna zaroori hai:

| Check | Status | Notes |
|---|---|---|
| `resume_processing_status` enum values match trigger mapping | ✅ Verified | `uploaded, queued, processing, parsed, ai_enriching, completed, failed, partial` |
| `parsing_job_status` enum values match trigger mapping | ✅ Verified | `queued, processing, completed, partial, failed, cancelled` |
| `uploaded_documents.processing_status` column exists | ✅ Verified | `06_documents.sql:86` |
| `resume_parsing_jobs.document_id` FK exists | ✅ Verified | `07_resume_processing.sql:41` |
| No existing trigger on `uploaded_documents.processing_status` | ✅ Verified | Only `updated_guard` and `no_hard_delete` triggers exist |
| No existing trigger on `resume_parsing_jobs` that conflicts | ✅ Verified | Only `updated_at` trigger exists |
| Worker terminal states reach trigger | ✅ Verified | `mark_completed()` and `mark_failed()` update `resume_parsing_jobs.status` |
| `ON DELETE CASCADE` on `resume_parsing_jobs.document_id` | ✅ Verified | Document delete cascades to job delete |

---

## What Changes Are Needed

### 1. New Migration File (primary change)
- `02-database/migrations/baseline/20_resume_processing_status_sync.sql`
- Trigger function + trigger definition

### 2. No Worker Code Changes
- Worker already updates `resume_parsing_jobs.status` correctly
- Trigger handles the rest automatically

### 3. No NestJS Code Changes (for status)
- `listOwnResumes()` and `getResumeStatus()` already read `processing_status` correctly
- Stage derivation logic already correct

### 4. Optional: Frontend Badge Enhancement
- Currently raw strings → add Badge component with colors
- Not blocking, can be done later

---

## Files to Create/Modify

| File | Action |
|---|---|
| `02-database/migrations/baseline/20_resume_processing_status_sync.sql` | **CREATE** — trigger |
| `07-fastapi-ai-worker/app/api/v1/task_handlers.py` | No change needed |
| `07-fastapi-ai-worker/app/repositories/parsing_job_repo.py` | No change needed |
| `04-nestjs-api/04-nestjs-api-app/src/modules/candidates/candidate.ts` | No change needed |
| `03-nextjs-web/03-nextjs-web-app/src/app/dashboard/candidate/page.tsx` | Optional: badge enhancement |
