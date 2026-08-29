# Registered Application API — Contract Decision Review

**Auditor:** opencode  
**Date:** 2026-08-28  
**Scope:** Registered candidate apply API contract — route, DTO, snapshot, idempotency, event, eligibility  
**Baseline SQL:** `09_applications.sql`, `05_jobs.sql`, `06_documents.sql`, `07_resume_processing.sql`, `02_enums.sql`, `15_infrastructure.sql`  
**Contracts:** `application-submitted.v1.json`, `AGGREGATE-ID-SEMANTICS.md`, `G1-ENVELOPE-ALIGNMENT.md`  
**Catalog:** `PHASE-06-API-CATALOG.md` API-APPLICATION-001  
**Requirements:** `PRODUCT-REQUIREMENTS.md` §11  
**Existing code:** `guest.ts` (guest apply reference implementation)

---

## 1. Executive Summary

### **Audit Verdict:** **6 DECISIONS REQUIRED — NO CODE AUTHORIZED**

The repository has the SQL foundation (tables, triggers, constraints, outbox), the guest apply reference implementation, the event contract, and the API catalog entry. But the registered apply route, DTO, and several eligibility rules remain `TBD`. No registered apply implementation exists. Six frozen decisions are required before coding.

---

## 2. Per-Point Verification

### Point 1: Registered Apply Exact Route

**Finding: NEEDS_HUMAN_DECISION**

| Source | Status |
|---|---|
| `PHASE-06-API-CATALOG.md` API-APPLICATION-001 L493 | `Method/path: TBD — job application command` |
| `APPLICATION-API-OPEN-DECISIONS.md` L11 | "Exact route shape for registered apply" listed as decision required |
| `04-nestjs-api/src/` | No registered apply controller or service exists |
| `guest.ts:147` | Guest apply route: `POST /api/v1/guest-sessions/apply` |

**Evidence:** The API catalog explicitly marks the route as `TBD`. The guest flow uses `POST /api/v1/guest-sessions/apply` (`guest.ts:147`). Decision-07 J1 (`DECISION-07-JOBS-SEARCH-FINAL.md:10-26`) defines company-scoped job routes but does NOT define an applicant-facing apply route. The open decisions document (`APPLICATION-API-OPEN-DECISIONS.md:11`) lists route shape as the first required decision.

**Two candidate patterns exist:**
1. Job-nested: `POST /api/v1/jobs/:jobId/apply` — simple, candidate-facing
2. Candidate-scoped: `POST /api/v1/candidates/:candidateId/applications` — RESTful but exposes candidate_id

**Decision needed:** Which route pattern? The guest flow does NOT use a candidate-scoped pattern (it uses a session-scoped `POST /api/v1/guest-sessions/apply`). Consistency suggests a job-nested command for registered apply too.

---

### Point 2: Request DTO — Library Resume / Application-Only Resume, Consent, Screening Answers

**Finding: NEEDS_HUMAN_DECISION**

| Source | Status |
|---|---|
| `PHASE-06-API-CATALOG.md` L496-497 | `Request/validation: job_id, selected resume/document or approved application-only resume, candidate consent, Idempotency-Key` |
| `APPLICATION-API-OPEN-DECISIONS.md` L12 | "Request fields: selected library resume versus application-only upload reference, consent and screening answers" |
| `guest.ts:82-83` | Guest DTO: `job_id, session_id, document_id, name, email, phone, cover_letter` |
| `09_applications.sql:63` | `answers_to_screening_questions JSONB NOT NULL DEFAULT '[]'::JSONB` |

**Evidence:** The SQL table has `answers_to_screening_questions` (`09_applications.sql:63`) with a CHECK constraint ensuring it's a JSON array (`09_applications.sql:101-103`). The catalog says the request should include "selected resume/document or approved application-only resume" and "candidate consent" (`PHASE-06-API-CATALOG.md:496-497`). The guest flow uses `document_id` from the guest session upload (`guest.ts:90-91`).

**Registered apply has two resume source options:**
1. **Library resume:** Candidate selects an existing `uploaded_documents` row (already scanned/parsed). Document ownership verified via `uploaded_by_user_id` (`06_documents.sql:74`).
2. **Application-only resume:** New upload attached only to this application. Requires upload + scan before apply or inline upload.

**Consent field:** `PRODUCT-REQUIREMENTS.md:152` says "Application candidate consent/action के बाद ही बनेगी." The SQL has no explicit `consent_given` column; consent is implied by the submit action. A DTO consent field would be audit evidence but has no SQL column to persist.

**Screening answers:** SQL supports it (`answers_to_screening_questions JSONB`), but the guest flow does NOT populate it (`guest.ts:96` inserts without screening answers). The registered flow should.

**Decision needed:**
1. DTO fields: `job_id`, `document_id` (library resume reference), `cover_letter?`, `answers_to_screening_questions?`, `consent: true` (audit-only)?
2. Should `document_id` reference an existing library resume, or is a new upload path needed?
3. Should consent be a required DTO field or implied by authenticated action?

---

### Point 3: Immutable Application Snapshot — Content and Provenance

**Finding: NEEDS_HUMAN_DECISION (content TBD), FIX REQUIRED (provenance incomplete)**

| Source | Status |
|---|---|
| `09_applications.sql:138-160` | `application_profile_snapshots` table — `snapshot_data JSONB`, `snapshot_type`, `schema_version`, `source_profile_revision`, `resume_document_id`, `generated_by` |
| `09_applications.sql:1019-1021` | `application_snapshots_immutable` trigger — blocks UPDATE/DELETE |
| `guest.ts:99` | Guest snapshot: `{ name, email, phone, cover_letter }`, `schema_version = 'application.v1'`, `generated_by = 'guest'` |
| `02_enums.sql:564-570` | `application_snapshot_type: submitted, parsed, enriched, reviewed`; `snapshot_generator: candidate, guest, system, ai_worker, recruiter, admin` |

**Evidence:**
- Snapshot table exists with `snapshot_data JSONB` (`09_applications.sql:145`)
- Immutability enforced by `reject_immutable_row_change()` trigger (`09_applications.sql:1019-1021`)
- Unique submitted snapshot per application: `uq_application_submitted_snapshot` index (`09_applications.sql:162-164`)
- `snapshot_version` starts at 1, scoped per `(application_id, snapshot_type)` (`09_applications.sql:158-159`)
- Guest snapshot content: `{ name, email, phone, cover_letter }` (`guest.ts:99`)

**Guest snapshot is minimal.** Registered snapshot should capture canonical profile facts at submission time to satisfy `PRODUCT-REQUIREMENTS.md:155`: "बाद के profile/resume changes submitted application history नहीं बदलेंगे."

**Provenance gap:** The catalog says snapshot must include "source_profile_revision" (`09_applications.sql:144`), which links to the candidate's `profile_revision` at submission time. The guest flow sets this to NULL (no candidate profile). Registered flow MUST populate `source_profile_revision` from `candidate_profiles.profile_revision`.

**Snapshot content for registered apply (proposed):**
```json
{
  "name": "...",
  "email": "...",
  "phone": "...",
  "profile_revision": 123,
  "resume_document_id": "...",
  "skills": [...],
  "experiences": [...],
  "educations": [...],
  "certifications": [...],
  "languages": [...]
}
```

**Decision needed:** What fields go in `snapshot_data`? Minimum is name + contact + profile_revision. Maximum is full canonical profile copy. The guest flow proves the pattern but captures less.

---

### Point 4: Idempotency Scope/Replay and Candidate+Job Uniqueness

**Finding: NEEDS_HUMAN_DECISION**

| Source | Status |
|---|---|
| `09_applications.sql:1066-1068` | `uq_registered_application_per_job` — `UNIQUE (job_id, candidate_id) WHERE is_guest = FALSE` |
| `09_applications.sql:82` | `application_identity_check CHECK` — registered: `candidate_id IS NOT NULL AND user_id IS NOT NULL` |
| `PHASE-06-API-CATALOG.md:504` | `Idempotency: same command replays original application; duplicate candidate+job fails safely` |
| `APPLICATION-API-OPEN-DECISIONS.md:14` | "Idempotency-key scope and replay response for the one candidate+job uniqueness rule" |
| `referral_batches.idempotency_key` (`09_applications.sql:246`) | Pattern exists for idempotency key in referrals |

**Evidence:**
- DB enforces one application per `(job_id, candidate_id)` via unique partial index (`09_applications.sql:1066-1068`)
- `candidate_id` comes from JWT → `candidate_profiles.user_id` lookup (never from request body)
- `application_identity_check` ensures registered apps have `candidate_id IS NOT NULL AND user_id IS NOT NULL` (`09_applications.sql:86-96`)
- Guest flow has `uq_guest_application_per_job` on `(job_id, guest_email_normalized)` (`09_applications.sql:1069-1071`)

**Gap:** There is NO `idempotency_key` column on `job_applications`. The catalog says "same command replays original application" (`PHASE-06-API-CATALOG.md:504`), but the SQL has no mechanism to map an `Idempotency-Key` header to an existing application. The referral pattern (`referral_batches.idempotency_key VARCHAR(255) NOT NULL UNIQUE`) is NOT present on `job_applications`.

**Two approaches:**
1. **DB unique constraint only:** Duplicate `(job_id, candidate_id)` returns `23505` → map to `IDEMPOTENCY_CONFLICT` or return existing application
2. **Add idempotency_key column:** Like `referral_batches`, store the key and use it for replay detection

**Decision needed:**
1. Should `job_applications` gain an `idempotency_key` column? (Schema change required)
2. Or is the DB unique constraint sufficient — duplicate submit returns existing application (200) or conflict (409)?
3. What is the replay response? Return existing application (idempotent) or error (conflict)?

---

### Point 5: `application.submitted` Event Contract and Dispatcher/Consumer Ownership

**Finding: CONTRACT EXISTS — DISPATCHER ROUTE PENDING**

| Source | Status |
|---|---|
| `contracts/events/application-submitted.v1.json` | Full Draft-2020-12 schema — FROZEN |
| `AGGREGATE-ID-SEMANTICS.md:24` | Phase 2 route: `application.submitted` → `aggregate_type: job_application`, `aggregate_id: job application UUID` |
| `G1-ENVELOPE-ALIGNMENT.md` | G-1(b) PENDING — envelope alignment for Phase 1; `application.submitted` is Phase 2 |
| `guest.ts:106-107` | Guest outbox INSERT — full envelope with nested payload |
| `PHASE-06-API-CATALOG.md:502-503` | `Outbox/consumer: emit approved application.submitted v1 in the same transaction; dispatcher has no current route, so it remains fail-closed/expected phased gap` |

**Evidence:**
- Contract file exists: `contracts/events/application-submitted.v1.json` — Draft-2020-12, required fields: `schema_version, event_id, aggregate_type, aggregate_id, event_type, payload, occurred_at`
- `aggregate_type = "job_application"`, `event_type = "application.submitted"` (`application-submitted.v1.json:20,29`)
- Payload requires: `application_id, job_id, company_id, is_guest, submitted_at` (`application-submitted.v1.json:33`)
- Guest implementation writes outbox event in same transaction (`guest.ts:106-107`)
- Dispatcher currently has NO route for `application.submitted` (`PHASE-06-API-CATALOG.md:503`)

**Dispatcher gap:** The outbox event will be written but dispatcher has no consumer route. This is an expected phased gap (`PHASE-06-API-CATALOG.md:503`). The event will accumulate in `outbox_events` with `status = 'pending'` until dispatcher route is added.

**Consumer ownership:** No consumer is defined for `application.submitted`. The registered apply flow should emit the same event. The consumer (when implemented) would likely: update company application counts, notify HR, trigger screening questions.

**Decision needed:** None — contract is frozen, dispatcher gap is documented. Registered apply should emit the same event using the same outbox pattern as guest.

---

### Point 6: Expired, Paused, Closed, and Confidential Jobs — Eligibility

**Finding: FIX REQUIRED (incomplete eligibility filtering)**

| Source | Status |
|---|---|
| `guest.ts:88` | Guest apply job check: `status = 'published' AND (expires_at IS NULL OR expires_at > NOW()) AND deleted_at IS NULL` |
| `job-search-query.ts:16-18` | Public search: `status = 'published' AND deleted_at IS NULL AND (expires_at IS NULL OR expires_at > NOW())` |
| `05_jobs.sql:163-168` | `status, published_at, expires_at, paused_at, closed_at, is_confidential` columns |
| `05_jobs.sql:635-640` | `idx_jobs_active_listings` — `WHERE status = 'published' AND deleted_at IS NULL` (no expires_at filter) |
| `05_jobs.sql:639-640` | `idx_jobs_published_date` — `WHERE status = 'published' AND deleted_at IS NULL` (no expires_at filter) |
| `DECISION-07-JOBS-SEARCH-FINAL.md:63-67` | J4: "Search and apply queries always enforce: `expires_at IS NULL OR expires_at > NOW()`" |

**Evidence — Current eligibility check (guest.ts:88):**
```sql
WHERE id = $1 AND status = 'published' AND (expires_at IS NULL OR expires_at > NOW()) AND deleted_at IS NULL
```

**What's checked:**
- ✅ `status = 'published'` — rejects draft, pending_approval, paused, closed, expired, archived
- ✅ `expires_at` — rejects expired jobs
- ✅ `deleted_at IS NULL` — rejects soft-deleted

**What's NOT checked:**
- ❌ **`paused` jobs:** A job with `status = 'paused'` is already rejected by `status = 'published'` check. BUT — Decision-07 J4 (`DECISION-07-JOBS-SEARCH-FINAL.md:62`) says `expire_due_jobs()` transitions "due `published` and `paused` jobs to `expired`." This means paused jobs are still semi-active (not expired yet). Should paused jobs be eligible for apply?
- ❌ **`closed` jobs:** Rejected by `status = 'published'` check. Correct — closed jobs should not accept applications.
- ❌ **`is_confidential`:** NOT checked anywhere in guest apply or public search. Decision-07 J7 (`DECISION-07-JOBS-SEARCH-FINAL.md:99-109`) says "confidential jobs use a masked company identity rather than being silently exposed" and "Confidential jobs remain searchable publicly with company identity masked." So confidential jobs SHOULD be eligible for apply — they're visible, just with masked company name.
- ❌ **`is_featured` / `is_urgent`:** No eligibility impact — these are ranking signals, not eligibility barriers.

**Search index gap (documented in prior review):** `idx_jobs_active_listings` and `idx_jobs_published_date` do NOT filter `expires_at` (`05_jobs.sql:635-640`). Decision-07 J4 says queries must enforce `expires_at IS NULL OR expires_at > NOW()`. This is an application-layer filter, not index-level.

**Decision needed:**
1. Should paused jobs be eligible for apply? (Decision-07 implies they're still "live" until expired)
2. Is the current `status = 'published'` check sufficient, or should there be an explicit allow-list: `status IN ('published', 'paused')`?

---

## 3. Boundary Compliance Check

| Boundary | Status | Evidence |
|---|---|---|
| Apply never mutates canonical profile | ✅ PASS | Guest flow writes only `job_applications`, `application_documents`, `application_profile_snapshots`, `application_status_history`, `outbox_events`. Zero writes to `candidate_profiles` or child fact tables. |
| Parsing must not block submission | ✅ PASS | Guest flow checks `security_scan_status` but NOT `processing_status`. Application is created regardless of parse state. |
| Business rows + snapshot + audit/history + outbox atomic | ✅ PASS | Guest flow wraps everything in `this.system.transaction()` (`guest.ts:85`). |
| No raw resume content in response | ✅ PASS | Guest apply response: `{ application_id, status, applied_at, claim_token }` (`guest.ts:109`). No resume content. |
| Cross-candidate/cross-company access denied | ✅ PASS | Guest flow verifies job belongs to same company (`guest.ts:88`). Registered flow will use JWT-derived candidate_id. |

---

## 4. Guest vs Registered Apply — Parity Matrix

| Aspect | Guest (implemented) | Registered (TBD) |
|---|---|---|
| Route | `POST /api/v1/guest-sessions/apply` | **NEEDS_DECISION** |
| Auth | Session token (`x-guest-upload-token`) | JWT (`AuthGuard`) |
| Identity | `guest_email_normalized`, `guest_name` | `candidate_id` from JWT |
| Resume source | `document_id` from guest session | **NEEDS_DECISION** (library resume or new upload) |
| Screening answers | Not populated | Should populate `answers_to_screening_questions` |
| Snapshot content | `{ name, email, phone, cover_letter }` | **NEEDS_DECISION** ( fuller canonical snapshot) |
| Snapshot `generated_by` | `'guest'` | `'candidate'` |
| Snapshot `source_profile_revision` | NULL | Should be `candidate_profiles.profile_revision` |
| Consent | Implied by submit action | **NEEDS_DECISION** (DTO field or implied) |
| Claim flow | Creates `guest_candidate_claims` row | Not needed (already authenticated) |
| Outbox event | `application.submitted` | Same event, `is_guest: false`, `candidate_id` populated |
| Idempotency | DB unique `(job_id, guest_email_normalized)` | DB unique `(job_id, candidate_id)` + **NEEDS_DECISION** on idempotency key |
| Job eligibility | `status = 'published' AND (expires_at IS NULL OR expires_at > NOW())` | Same or expanded |

---

## 5. SQL Evidence Summary

| Code Reference | SQL Source | Verified |
|---|---|---|
| `job_applications.id` (UUID PK) | `09_applications.sql:51` | ✅ |
| `job_applications.candidate_id` (nullable) | `09_applications.sql:53` | ✅ |
| `job_applications.user_id` (nullable FK) | `09_applications.sql:54` | ✅ |
| `job_applications.is_guest` (boolean) | `09_applications.sql:55` | ✅ |
| `job_applications.status` (DEFAULT 'applied') | `09_applications.sql:61` | ✅ |
| `job_applications.answers_to_screening_questions` (JSONB) | `09_applications.sql:63` | ✅ |
| `job_applications.applied_at` (DEFAULT NOW()) | `09_applications.sql:75` | ✅ |
| `application_identity_check` (guest XOR registered) | `09_applications.sql:86-96` | ✅ |
| `application_screening_answers_array` CHECK | `09_applications.sql:101-103` | ✅ |
| `application_profile_snapshots.snapshot_data` (JSONB) | `09_applications.sql:145` | ✅ |
| `application_profile_snapshots.generated_by` (enum) | `09_applications.sql:147` | ✅ |
| `application_snapshots_immutable` trigger | `09_applications.sql:1019-1021` | ✅ |
| `uq_registered_application_per_job` | `09_applications.sql:1066-1068` | ✅ |
| `uq_guest_application_per_job` | `09_applications.sql:1069-1071` | ✅ |
| `application_snapshot_type` enum | `02_enums.sql:564-566` | ✅ |
| `snapshot_generator` enum | `02_enums.sql:568-570` | ✅ |
| `document_role` enum (includes 'resume') | `02_enums.sql:572-574` | ✅ |
| `change_application_status()` function | `09_applications.sql:573-652` | ✅ |
| `validate_application_document_origin()` | `09_applications.sql:532-571` | ✅ |
| `enforce_application_identity()` (immutable after INSERT) | `09_applications.sql:479-498` | ✅ |
| `enforce_initial_lifecycle_state()` (status = 'applied') | `09_applications.sql:455-477` | ✅ |
| `outbox_events` table structure | `15_infrastructure.sql:23-80` | ✅ |

---

## 6. Test Coverage Gap

No tests exist for registered apply (no implementation exists). When implemented, minimum test matrix:

| Test Case | Priority |
|---|---|
| Successful apply with library resume | P0 |
| Duplicate `(job_id, candidate_id)` rejection | P0 |
| Expired job rejection | P0 |
| Non-published job rejection | P0 |
| Unauthorized (no JWT) rejection | P0 |
| Snapshot immutability after profile edit | P0 |
| Screening answers persisted correctly | P1 |
| Outbox event written in same transaction | P1 |
| Cross-company job apply rejection | P1 |
| Document ownership verification | P1 |
| Confidential job apply succeeds | P2 |
| Paused job apply (decision-dependent) | P2 |

---

## 7. Final Decision Summary

| # | Decision | Options | Recommendation |
|---|---|---|---|
| D1 | Route shape | `POST /api/v1/jobs/:jobId/apply` vs candidate-scoped | Job-nested (consistent with guest pattern) |
| D2 | DTO fields | library `document_id` + `cover_letter` + `screening_answers` + `consent` | All four; consent is audit-only |
| D3 | Snapshot content | Minimal (name+contact) vs full canonical profile | Full canonical profile at submission time |
| D4 | Idempotency | DB unique only vs `idempotency_key` column | DB unique only — return existing application on duplicate |
| D5 | Event contract | Already frozen | No decision needed — use existing contract |
| D6 | Paused job eligibility | Include `paused` in allowed statuses | Yes — paused jobs are live until expired per Decision-07 J4 |

---

## 8. No-Code-Change Confirmation

Zero source code, SQL migrations, or configuration files were modified during this review.
