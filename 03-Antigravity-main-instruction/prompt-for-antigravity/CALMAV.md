```
┌─────────────────────────────────────────────────────────────────────────┐
│                    RESUME UPLOAD — COMPLETE FLOW                        │
│                    (Cloud Run ClamAV — Zero Cost)                       │
└─────────────────────────────────────────────────────────────────────────┘


 ┌──────────────┐
 │  CANDIDATE    │
 │  Upload PDF   │
 │  Resume       │
 └──────┬───────┘
        │
        ▼
═══════════════════════════════════════════════════════════════
 STEP 1: VALIDATE & STORE (NestJS — resume.ts)
═══════════════════════════════════════════════════════════════
        │
        ▼
 ┌──────────────────────────────┐
 │  validateResumeFile()        │
 │  ✅ Magic bytes check        │
 │  ✅ File size limit          │
 │  ✅ Extension + MIME match   │
 │  ✅ Path traversal check     │
 │  ✅ SHA256 checksum          │
 └──────────┬───────────────────┘
            │
            ▼
 ┌──────────────────────────────┐     ┌─────────────────────┐
 │  Upload to Supabase Storage  │────▶│  Supabase Storage    │
 │  path: candidates/{id}/      │     │  (Cloud Bucket)      │
 │       resumes/{docId}.pdf    │     └─────────────────────┘
 └──────────┬───────────────────┘
            │
            ▼
 ┌──────────────────────────────┐
 │  INSERT uploaded_documents   │
 │  security_scan_status        │
 │       = 'pending'  ◄─────────┼──── DB me record save
 │  processing_status           │
 │       = 'uploaded'           │
 └──────────┬───────────────────┘
            │
            ▼
 ┌──────────────────────────────┐
 │  INSERT outbox_events        │
 │  event_type =                │
 │    'security.scan.requested' │ ◄── Dispatcher ko signal
 └──────────┬───────────────────┘
            │
            │  ══════════════════════════════
            │  ║   DISPATCHER (Port 3002)   ║
            │  ║   Har 10 sec wake check    ║
            │  ║   outbox_events scan karta  ║
            │  ║   hai aur FastAPI ko call   ║
            │  ║   karta hai                 ║
            │  ══════════════════════════════
            │
            ▼
═══════════════════════════════════════════════════════════════
 STEP 2: SECURITY SCAN (FastAPI — task_handlers.py)
═══════════════════════════════════════════════════════════════
            │
            ▼
 ┌──────────────────────────────┐
 │  Claim the document          │
 │  UPDATE uploaded_documents   │
 │  SET security_scan_status =  │
 │    'scanning'                │ ◄── Duplicate task avoid
 │  WHERE status IN             │
 │    ('pending','failed')      │ ◄── Retry bhi allowed
 └──────────┬───────────────────┘
            │
            ▼
 ┌──────────────────────────────┐     ┌─────────────────────┐
 │  Download file from          │────▶│  Supabase Storage    │
 │  SupabaseStorageClient       │◀────│  (Cloud Bucket)      │
 │  .download(storage_path)     │     └─────────────────────┘
 └──────────┬───────────────────┘
            │
            ▼
 ┌──────────────────────────────┐     ┌─────────────────────────────┐
 │  ClamAV Scanner              │────▶│  Cloud Run: clamav-scanner  │
 │  (HTTP or TCP)               │◀────│                             │
 │                              │     │  ┌───────────────────────┐  │
 │  security_scanner.py         │     │  │ ClamAV daemon (clamd) │  │
 │  ┌────────────────────────┐  │     │  │ Port: 3310 (internal) │  │
 │  │ if http:// or https:// │  │     │  └───────────┬───────────┘  │
 │  │   → _scan_http()      │  │     │              │              │
 │  │   → POST /scan         │  │     │  ┌───────────▼───────────┐  │
 │  │ else                   │  │     │  │ Python HTTP Wrapper   │  │
 │  │   → _scan_tcp()       │  │     │  │ Port: 8080 (HTTP)     │  │
 │  │   → clamd instream     │  │     │  │ POST /scan → verdict  │  │
 │  └────────────────────────┘  │     │  └───────────────────────┘  │
 └──────────┬───────────────────┘     └─────────────────────────────┘
            │
            ▼
 ┌──────────────────────────────┐
 │  Scan Result:                │
 │                              │
 │  ┌────────┐    ┌──────────┐  │
 │  │ CLEAN  │    │ INFECTED │  │
 │  └───┬────┘    └────┬─────┘  │
 │      │              │        │
 └──────┼──────────────┼────────┘
        │              │
        ▼              ▼
 ┌──────────────┐  ┌────────────────────────────┐
 │ status =     │  │ status = 'infected'        │
 │ 'clean'      │  │ Stage = SECURITY_REJECTED  │
 │              │  │ Candidate ko error dikhao   │
 │ INSERT       │  │ "File rejected"            │
 │ resume_      │  └────────────────────────────┘
 │ parsing_jobs │
 │ (status =    │
 │  'queued')   │
 └──────┬───────┘
        │
        ▼
 ┌──────────────────────────────┐
 │  INSERT outbox_events        │
 │  event_type =                │
 │   'resume.parse.requested'   │ ◄── Dispatcher ko signal
 └──────────┬───────────────────┘
        │
        │  ══════════════════════════════
        │  ║   DISPATCHER (Port 3002)   ║
        │  ══════════════════════════════
        │
        ▼
═══════════════════════════════════════════════════════════════
 STEP 3: PARSE RESUME (FastAPI — task_handlers.py)
═══════════════════════════════════════════════════════════════
        │
        ▼
 ┌──────────────────────────────┐
 │  Claim parsing job           │
 │  UPDATE resume_parsing_jobs  │
 │  SET status = 'processing'   │
 └──────────┬───────────────────┘
        │
        ▼
 ┌──────────────────────────────┐     ┌─────────────────────┐
 │  Download file from          │────▶│  Supabase Storage    │
 │  SupabaseStorageClient       │◀────│                      │
 └──────────┬───────────────────┘     └─────────────────────┘
        │
        ▼
 ┌──────────────────────────────┐
 │  DocumentExtractor           │
 │  ┌───────────────────────┐   │
 │  │ PDF  → pypdf          │   │
 │  │ DOCX → python-docx    │   │
 │  │ TXT  → plain read     │   │
 │  └───────────┬───────────┘   │
 │              ▼               │
 │  Extracted Raw Text         │
 └──────────┬───────────────────┘
        │
        ▼
 ┌──────────────────────────────┐     ┌─────────────────────┐
 │  LLM (Gemini/GPT)           │────▶│  Structured Data:   │
 │  Structured Extraction      │◀────│  - contact_info     │
 │  Prompt: "Extract skills,   │     │  - skills           │
 │  experience, education..."  │     │  - experiences      │
 │                              │     │  - educations       │
 │                              │     │  - certifications   │
 └──────────┬───────────────────┘     └─────────────────────┘
        │
        ▼
 ┌──────────────────────────────┐
 │  INSERT resume_parsed_data   │
 │  ✅ normalized_output        │
 │  ✅ confidence_details       │
 │  ✅ overall_confidence       │
 │                              │
 │  UPDATE resume_parsing_jobs  │
 │  SET status = 'completed'    │
 │  (ya 'partial' agar low      │
 │   confidence)                │
 └──────────┬───────────────────┘
        │
═══════════════════════════════════════════════════════════════
 STEP 4: CANDIDATE REVIEWS & CONFIRMS (NestJS — resume.ts)
═══════════════════════════════════════════════════════════════
        │
        ▼
 ┌──────────────────────────────┐
 │  GET /api/v1/resumes/:id/    │
 │       parsed-data            │ ◄── Candidate parsed data
 │                              │     dekhta hai
 │  Show:                       │
 │  - Skills                    │
 │  - Experience                │
 │  - Education                 │
 │  - Certifications            │
 └──────────┬───────────────────┘
        │
        │  Candidate edits/confirms
        ▼
 ┌──────────────────────────────┐
 │  POST /api/v1/resumes/:id/   │
 │       confirm                │
 │  Body: {                     │
 │    profile: {...},           │
 │    facts: {                  │
 │      skills: [...],          │
 │      experiences: [...],     │
 │      educations: [...]       │
 │    },                        │
 │    expected_profile_revision │
 │  }                           │
 └──────────┬───────────────────┘
        │
        ▼
 ┌──────────────────────────────┐
 │  STALE REVISION CHECK        │
 │  if (current_revision !=     │
 │      expected_revision)      │
 │  → throw STALE_REVISION      │ ◄── Optimistic locking
 └──────────┬───────────────────┘
        │
        ▼
 ┌──────────────────────────────┐
 │  UPDATE candidate_profiles   │
 │  (professional_title,        │
 │   summary, location...)      │
 └──────────┬───────────────────┘
        │
        ▼
 ┌──────────────────────────────┐
 │  INSERT canonical facts:     │
 │  ✅ candidate_skills         │
 │  ✅ candidate_experiences    │
 │  ✅ candidate_educations     │
 │  ✅ candidate_certifications │
 │  ✅ candidate_projects       │
 │  ✅ candidate_languages      │
 │  (all with                   │
 │   verification_status =      │
 │   'candidate_confirmed')     │
 └──────────┬───────────────────┘
        │
        ▼
 ┌──────────────────────────────┐
 │  BUMP profile_revision       │
 │  INSERT profile_change_      │
 │       history                │
 │  INSERT outbox_events        │
 │  event_type =                │
 │   'candidate.profile.changed'│ ◄── Projection worker
 └──────────┬───────────────────┘     candidate_search_profiles
            │                          update karega
            ▼
 ┌──────────────────────────────┐
 │  ✅ DONE                     │
 │  Response: {                 │
 │    profile_revision: N+1,    │
 │    active_document_id: ...,  │
 │    projection_queued: true   │
 │  }                           │
 └──────────────────────────────┘
```

## COLD START RETRY HANDLING

```
ClamAV Cold Start (scale-to-zero se 10-30 sec delay)
        │
        ▼
ScannerUnavailable exception raised
        │
        ▼
status = 'failed', retryable = True
        │
        ▼
HTTP 503 returned to dispatcher
        │
        ▼
Dispatcher automatically retries task
        │
        ▼
Next attempt: ClamAV already warm, scan completes fast
```

**Key points:**
- `security_scan_status IN ('pending', 'failed')` — retry allowed
- `retryable: True` flag in error metadata — dispatcher ko batata hai
- HTTP 503 — dispatcher retry trigger karta hai
- 2-3 attempts me ClamAV ready ho jayega
- File kabhi `clean` nahi hoti jab ClamAV unavailable ho (fail-closed)

## DEPLOYMENT DETAILS

| Item | Detail |
|------|--------|
| Service | Cloud Run (`clamav-scanner`) |
| Region | `asia-south1` |
| Image | `clamav/clamav:stable-debian13-slim` + Python wrapper |
| Memory | 2 GiB |
| CPU | 1 vCPU |
| Scale | 0-2 instances (scale to zero) |
| Auth | IAM (`run.invoker` role) |
| Cost | ₹0 (free tier) |
| Port | 8080 (HTTP) |

**Files:**
- `08-clamav-cloudrun/Dockerfile` — Container definition
- `08-clamav-cloudrun/app.py` — HTTP wrapper for clamd
- `08-clamav-cloudrun/start.sh` — Container startup
- `08-clamav-cloudrun/deploy.sh` — One-click deployment
- `07-fastapi-ai-worker/app/services/security_scanner.py` — Scanner adapter (HTTP + OIDC token)

---

**Summary:**
- **NestJS** = Validate + Store + Confirm (3 kaam)
- **FastAPI** = ClamAV Scan + LLM Parse (2 kaam)
- **Dispatcher** = Outbox events ko relay karta hai (har 10 sec)
- **ClamAV** = Cloud Run pe deployed (₹0, scale-to-zero, HTTP wrapper)
- **Retry** = Cold start handle hota hai automatically
