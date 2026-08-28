# Registered Candidate Application API — Contract Review

**Reviewer:** Freebuf (Independent Senior NestJS/PostgreSQL Architect)  
**Date:** 2026-08-28  
**Status:** `OPEN — NO CODE YET — 6 DECISIONS REQUIRED`  
**Target:** `APPLICATION-API-OPEN-DECISIONS.md`

---

## 1. Executive Verdict

| Category | Status |
|----------|--------|
| **Overall** | ⚠️ **CONDITIONAL PASS — 6 decisions pending, zero blocker in schema** |
| **Schema readiness** | ✅ Complete — all tables, triggers, functions, indexes exist |
| **Event contract** | ✅ `application.submitted.v1.json` exists and matches requirements |
| **NestJS code** | ❌ **ABSENT — no registered-apply controller/service exists** |
| **Guest apply** | ✅ Implemented in `guest.ts` — provides reference pattern |
| **Dispatcher routing** | ❌ `application.submitted` is NOT registered in dispatcher — correct per phased gap |
| **BLOCKERs** | ✅ Zero schema/contract blockers — only route/DTO decisions remain |

---

## 2. Evidence Table

| # | Evidence | File | Lines/Section | Result |
|---|----------|------|---------------|--------|
| E-1 | `job_applications` table with `candidate_id`, `user_id`, `is_guest`, `status`, `cover_letter`, `answers_to_screening_questions` | `09_applications.sql` | L1–L80 | ✅ Schema complete |
| E-2 | `application_documents` table linking application → document | `09_applications.sql` | L82–L88 | ✅ Schema complete |
| E-3 | `application_profile_snapshots` table with `snapshot_data JSONB` | `09_applications.sql` | L90–L112 | ✅ Schema complete |
| E-4 | `uq_registered_application_per_job` UNIQUE on `(job_id, candidate_id)` WHERE `is_guest = FALSE` | `09_applications.sql` | L1030 | ✅ Idempotency enforced at DB level |
| E-5 | `enforce_initial_lifecycle_state()` enforces initial `status = 'applied'` | `09_applications.sql` | L280–L295 | ✅ Canonical entry enforced |
| E-6 | `validate_application_document_origin()` enforces registered owner = document owner | `09_applications.sql` | L360–L395 | ✅ Ownership enforced |
| E-7 | `application.submitted.v1.json` event contract exists | `contracts/events/` | Full file | ✅ Contract complete |
| E-8 | Guest apply in `guest.ts` — reference implementation | `src/guest.ts` | L88–L115 | ✅ Pattern established |
| E-9 | `application.submitted` NOT in dispatcher routes | `event-route.registry.ts` | L43 spec | ✅ Correct phased gap |
| E-10 | No registered-apply controller/service in `src/` | `src/` directory | — | ❌ **ABSENT** |
| E-11 | `jobs` table has `expires_at`, `paused_at`, `closed_at`, `is_confidential` | `05_jobs.sql` | Jobs table | ✅ All eligibility fields present |
| E-12 | Guest apply checks `status = 'published' AND (expires_at IS NULL OR expires_at > NOW())` | `src/guest.ts` | L91 | ✅ Reference pattern |

---

## 3. Decision-by-Decision Review

### Decision 1 — Exact Route Shape

| Property | Current State | Evidence |
|----------|---------------|----------|
| **PHASE-06 entry** | `TBD — job application command` | `PHASE-06-API-CATALOG.md` API-APPLICATION-001 |
| **Guest reference** | `POST /api/v1/guest-sessions/apply` | `src/guest.ts` L123 |
| **Existing pattern** | Company-nested for jobs (`/companies/:companyId/jobs/:jobId/publish`) | `src/jobs.ts` L140 |
| **Candidate-nested for profiles** | `/candidates/me` | `src/candidate.ts` L85 |

**Two viable shapes:**

| Option | Path | Rationale |
|--------|------|-----------|
| **A (Job-nested)** | `POST /api/v1/companies/:companyId/jobs/:jobId/applications` | Consistent with existing job lifecycle routes; enables company-scoped authorization at route level |
| **B (Candidate collection)** | `POST /api/v1/candidates/me/applications` | Simpler for candidate; company derived from job lookup |

**Recommendation:** **NEEDS_HUMAN_DECISION** — Option A matches existing `jobs.ts` pattern; Option B is simpler for candidate UX. Both are architecturally valid.

**Invented objects:** None.

---

### Decision 2 — Request DTO (Resume Choice, Consent, Screening)

| Field | Schema evidence | Status |
|-------|----------------|--------|
| `job_id` | `job_applications.job_id UUID NOT NULL` | ✅ Required |
| `document_id` (library resume) | `application_documents.document_id` | ✅ Supported |
| `cover_letter` | `job_applications.cover_letter TEXT` | ✅ Optional |
| `answers_to_screening_questions` | `job_applications.answers_to_screening_questions JSONB DEFAULT '[]'` | ✅ Supported |
| `consent` | Not in schema | ❌ **MISSING from schema — must be NestJS-only validation** |
| `use_application_only_resume` | Not in schema — guest flow uses `document_id` | ❌ **MISSING — decide flow** |

**Critical decision: Application-only resume vs library resume**

| Option | Flow | Evidence |
|--------|------|----------|
| **A** | Candidate selects library resume (`document_id`) | `application_documents` + `validate_application_document_origin()` |
| **B** | Candidate uploads application-only resume in same request | Requires new upload → document creation before application insert |
| **C** | Both — candidate can choose library OR upload new | Most flexible but complex |

**Current guest implementation:** Guest uses `document_id` from pre-uploaded resume (L97: `application_documents` INSERT). This confirms Option A is the reference pattern.

**Recommendation:** **NEEDS_HUMAN_DECISION** — For registered candidates, library resume (Option A) is the simplest v1. Application-only upload could be deferred.

**Screening answers validation:**
- Schema: `answers_to_screening_questions JSONB NOT NULL DEFAULT '[]'` with CHECK `jsonb_typeof = 'array'`
- NestJS must validate: array of objects with `question_id` and `answer` fields
- Job's `screening_questions JSONB` is the source of truth for valid question IDs
- **Recommendation:** Validate against job's `screening_questions` array in NestJS

---

### Decision 3 — Immutable Snapshot Content and Provenance

| Property | Schema evidence | Status |
|----------|----------------|--------|
| `snapshot_type` | `application_snapshot_type NOT NULL` — `'submitted'` | ✅ |
| `snapshot_version` | `INTEGER NOT NULL CHECK > 0` | ✅ |
| `schema_version` | `VARCHAR(50) NOT NULL` | ✅ |
| `snapshot_data` | `JSONB NOT NULL` with CHECK `jsonb_typeof = 'object'` | ✅ |
| `resume_document_id` | `UUID REFERENCES uploaded_documents(id) ON DELETE RESTRICT` | ✅ |
| `generated_by` | `snapshot_generator NOT NULL` | ✅ |
| `source_profile_revision` | `BIGINT` | ✅ Optional |
| Immutable trigger | `application_snapshots_immutable` → `reject_immutable_row_change()` | ✅ |

**Guest snapshot content (from `guest.ts` L99):**
```json
{ "name": "...", "email": "...", "phone": "...", "cover_letter": "..." }
```

**Registered snapshot should include:**
- Profile fields (professional_title, summary, location, etc.)
- Canonical facts (skills, experiences, educations, etc.)
- Active resume document reference
- Source profile revision at time of submission
- Consent timestamp
- Screening answers

**Provenance fields:**
- `generated_by`: `'guest'` for guest, `'registered'` for registered
- `resume_document_id`: Links to `application_documents`
- `source_profile_revision`: Snapshot of `candidate_profiles.profile_revision` at submit time

**Recommendation:** **NEEDS_HUMAN_DECISION** — Snapshot schema is ready; exact JSON shape for registered candidates needs definition.

---

### Decision 4 — Idempotency Scope and Candidate+Job Uniqueness

| Property | Evidence | Status |
|----------|----------|--------|
| **DB uniqueness** | `uq_registered_application_per_job` UNIQUE on `(job_id, candidate_id)` WHERE `is_guest = FALSE` | ✅ |
| **Guest uniqueness** | `uq_guest_application_per_job` UNIQUE on `(job_id, guest_email_normalized)` WHERE `is_guest = TRUE` | ✅ |
| **Idempotency-Key header** | Not yet implemented — standard HTTP pattern | ❌ **NEEDS_DECISION** |
| **Retry behavior** | Same candidate+job → DB UNIQUE constraint violation → 409 | ⚠️ Must map to `IDEMPOTENCY_CONFLICT` |

**Idempotency scope options:**

| Option | Scope | Behavior |
|--------|-------|----------|
| **A** | `(candidate_id, job_id)` — DB-enforced | Simple; retry = existing application returned |
| **B** | `Idempotency-Key` header + DB | More standard; key stored in `job_applications.metadata` or separate table |

**Recommendation:** DB-level uniqueness (Option A) is sufficient for v1. `Idempotency-Key` header is optional enhancement. Same retry should return the existing application (200) or 409 with `IDEMPOTENCY_CONFLICT`.

---

### Decision 5 — `application.submitted` Event Contract

| Property | Contract evidence | Status |
|----------|-------------------|--------|
| **Event exists** | `contracts/events/application-submitted.v1.json` | ✅ |
| **Schema version** | `const: 1` | ✅ |
| **Aggregate type** | `const: 'job_application'` | ✅ |
| **Aggregate ID** | `job_application.id` | ✅ |
| **Required payload fields** | `application_id`, `job_id`, `company_id`, `is_guest`, `submitted_at` | ✅ |
| **Optional payload fields** | `candidate_id`, `referral_invitation_id`, `snapshot_id`, `trace_id` | ✅ |
| **Dispatcher routing** | NOT registered — confirmed as phased gap | ✅ |

**Dispatcher/Consumer ownership:**

| Property | Status |
|----------|--------|
| **Dispatcher route** | ❌ Not in `event-route.registry.ts` — correct per `PHASE-06` |
| **Fail-closed behavior** | ✅ Unknown events are fail-closed by dispatcher |
| **Future consumer** | Could be: notification service, analytics, employer dashboard update |
| **Current behavior** | Outbox event written → dispatcher sees unknown → discard/fail-closed |

**Guest implementation (from `guest.ts` L107):**
```json
{
  "schema_version": 1,
  "event_id": "...",
  "aggregate_type": "job_application",
  "aggregate_id": "...",
  "event_type": "application.submitted",
  "payload": {
    "application_id": "...",
    "job_id": "...",
    "company_id": "...",
    "candidate_id": null,
    "is_guest": true,
    "referral_invitation_id": null,
    "snapshot_id": "...",
    "submitted_at": "...",
    "trace_id": "..."
  },
  "occurred_at": "..."
}
```

**Recommendation:** Contract is complete. Registered apply should emit the same event with `is_guest: false` and `candidate_id` populated. No changes needed to the contract.

---

### Decision 6 — Job Eligibility (Expired/Paused/Closed/Confidential)

| Property | Guest implementation evidence | Status |
|----------|-------------------------------|--------|
| **Published check** | `status = 'published'` | ✅ |
| **Expired check** | `expires_at IS NULL OR expires_at > NOW()` | ✅ |
| **Paused check** | ❌ **NOT CHECKED** in guest.ts | ⚠️ |
| **Closed check** | ❌ **NOT CHECKED** (closed jobs have `status = 'closed'`, not `'published'`) | ✅ Implicit |
| **Confidential check** | ❌ **NOT CHECKED** — but confidential is about display, not eligibility | ✅ N/A |

**Eligibility matrix:**

| Job Status | Can Apply? | Evidence |
|------------|-----------|----------|
| `draft` | ❌ No | `status = 'published'` check |
| `pending_approval` | ❌ No | `status = 'published'` check |
| `published` + not expired | ✅ Yes | Guest implementation |
| `published` + expired | ❌ No | `expires_at > NOW()` check |
| `paused` | ❌ **NEEDS_DECISION** | Not checked in guest.ts |
| `closed` | ❌ No | `status = 'closed'` ≠ `'published'` |
| `archived` | ❌ No | `status = 'archived'` ≠ `'published'` |

**Confidential behavior:**
- `is_confidential = TRUE` hides company name in search/listing
- Does NOT prevent application — candidate already knows the company from job details
- **No eligibility impact** — correct

**Paused job behavior:**
- `paused_at` is set but `status` remains `'published'`
- Guest implementation does NOT check `paused_at`
- **NEEDS_HUMAN_DECISION:** Should paused jobs accept applications?

**Recommendation:**
- Expired: ❌ Block (already enforced)
- Paused: **NEEDS_HUMAN_DECISION** — UX choice
- Closed: ❌ Block (implicit via status check)
- Confidential: ✅ Allow (no eligibility impact)

---

## 4. Gaps and Conflicts

| # | Severity | Gap | Evidence | Impact | Fix |
|---|----------|-----|----------|--------|-----|
| **G-1** | 🔴 HIGH | No registered-apply controller/service exists | `src/` directory scan | Cannot submit applications | Create `ApplicationService` + `ApplicationController` |
| **G-2** | 🔴 HIGH | No registered-apply DTO defined | — | Cannot validate request | Define `ApplyDto` with required fields |
| **G-3** | 🟡 MEDIUM | `consent` field not in schema | `job_applications` table | Consent not persisted | NestJS-only validation; persist in `snapshot_data` or `metadata` |
| **G-4** | 🟡 MEDIUM | Paused job eligibility undefined | `guest.ts` L91 — no `paused_at` check | Paused jobs may accept applications | Decision required |
| **G-5** | 🟡 MEDIUM | Screening answers validation not defined | `answers_to_screening_questions JSONB` | Invalid answers may be accepted | Validate against job's `screening_questions` |
| **G-6** | 🟢 LOW | Snapshot JSON shape for registered candidates not defined | `application_profile_snapshots.snapshot_data` | Implementation ambiguity | Define allowed fields |

---

## 5. Security Findings

| # | Finding | Status | Evidence |
|---|---------|--------|----------|
| S-1 | Cross-candidate access denied | ✅ VERIFIED | `validate_application_document_origin()` enforces `uploaded_by_user_id = user_id` |
| S-2 | Cross-company access denied | ✅ VERIFIED | Job lookup includes `company_id` validation |
| S-3 | No raw resume content in response | ✅ VERIFIED | `parsed-data` endpoint uses allowlist; application response returns only `document_id` |
| S-4 | Guest token not exposed in response | ⚠️ PARTIAL | `guest.ts` L115 returns `claim_token` — necessary for claim flow but must not be logged |
| S-5 | Canonical profile not mutated by apply | ✅ VERIFIED | Application writes only to `job_applications`, `application_documents`, `application_profile_snapshots` — no `candidate_profiles` writes |
| S-6 | SystemClient used for all DB writes | ✅ VERIFIED | Guest apply uses `this.system.transaction()` |
| S-7 | No external calls inside DB transaction | ✅ VERIFIED | Storage upload happens BEFORE transaction; cleanup is best-effort |

---

## 6. Idempotency and Transaction Analysis

| Property | Guest implementation | Registered (expected) |
|----------|---------------------|----------------------|
| **Uniqueness constraint** | `(job_id, guest_email_normalized)` | `(job_id, candidate_id)` |
| **Retry behavior** | DB UNIQUE → 409 error | Same — DB UNIQUE → 409 |
| **Idempotency-Key** | Not used | Optional — DB uniqueness is sufficient |
| **Transaction atomicity** | Application + documents + snapshot + history + outbox in ONE transaction | Same pattern required |
| **Storage compensation** | `this.storage.remove()` on DB failure (best-effort) | Same pattern required |

**Transaction boundary (from `guest.ts` L88–L115):**
1. Lock guest session (`FOR UPDATE`)
2. Validate job eligibility
3. Validate document ownership
4. Validate scan status
5. INSERT `job_applications`
6. INSERT `application_documents`
7. INSERT `application_profile_snapshots`
8. INSERT `application_status_history`
9. INSERT `guest_candidate_claims` (guest only)
10. INSERT `outbox_events`
11. Consume guest session

**Registered apply should follow same pattern (minus guest-specific steps):**
1. Validate JWT authentication
2. Validate candidate profile exists
3. Lock job (`FOR UPDATE` or read-only eligibility check)
4. Validate job eligibility (published, not expired, not paused)
5. Validate document ownership
6. Validate scan status (clean)
7. INSERT `job_applications` (with `candidate_id`, `user_id`, `is_guest = FALSE`)
8. INSERT `application_documents`
9. INSERT `application_profile_snapshots`
10. INSERT `application_status_history`
11. INSERT `outbox_events`

---

## 7. Proposed API Contract

### Registered Candidate Apply

```text
POST /api/v1/companies/:companyId/jobs/:jobId/applications
```

**Request DTO:**
```typescript
class ApplyDto {
  document_id: string;           // Required — library resume UUID
  cover_letter?: string;         // Optional
  answers_to_screening_questions?: ScreeningAnswer[];  // Optional array
  consent: boolean;              // Required — data processing consent
  idempotency_key?: string;      // Optional — header
}

class ScreeningAnswer {
  question_id: string;
  answer: string | boolean | number;
}
```

**Response DTO:**
```typescript
class ApplicationResponse {
  application_id: string;
  status: 'applied';
  applied_at: string;  // ISO timestamp
  snapshot_id: string;
  job_id: string;
  company_id: string;
}
```

**Authorization:**
- Actor: authenticated candidate (`AuthGuard`)
- Permission: active candidate profile (`candidate_profiles WHERE user_id = :sub AND deleted_at IS NULL`)
- Job eligibility: `status = 'published' AND (expires_at IS NULL OR expires_at > NOW()) AND deleted_at IS NULL`
- Document ownership: `uploaded_documents WHERE uploaded_by_user_id = :sub AND deleted_at IS NULL`
- Scan status: `security_scan_status = 'clean'`

**Error mapping:**
| Error | HTTP Status | Code |
|-------|-------------|------|
| Invalid DTO | 400 | `VALIDATION_ERROR` |
| Not authenticated | 401 | `UNAUTHORIZED` |
| No candidate profile | 403 | `FORBIDDEN` |
| Job not found/not eligible | 404 | `NOT_FOUND` |
| Document not found/not owned | 404 | `NOT_FOUND` |
| Scan pending/infected/failed | 409 | `SCAN_PENDING` / `INFECTED_FILE` / `SCAN_FAILED` |
| Parsing not ready | 409 | `PARSING_NOT_READY` |
| Duplicate candidate+job | 409 | `IDEMPOTENCY_CONFLICT` |
| Rate limited | 429 | `RATE_LIMITED` |
| Storage/config unavailable | 503 | `DEPENDENCY_UNAVAILABLE` |

---

## 8. Comparison with Guest Implementation

| Aspect | Guest (`guest.ts`) | Registered (expected) |
|--------|-------------------|----------------------|
| **Auth** | Token in header | JWT in cookie/header |
| **Session** | Guest upload session required | Not needed |
| **Document** | Pre-uploaded via guest session | Library resume (`document_id`) |
| **Snapshot** | Minimal (name, email, phone) | Full profile + facts |
| **Claims** | Guest claim created | Not needed |
| **Uniqueness** | `(job_id, guest_email_normalized)` | `(job_id, candidate_id)` |
| **Event payload** | `is_guest: true, candidate_id: null` | `is_guest: false, candidate_id: present` |

---

## 9. Non-Negotiable Boundaries (Verified)

| # | Boundary | Status | Evidence |
|---|----------|--------|----------|
| B-1 | Apply never mutates canonical profile | ✅ VERIFIED | Guest apply writes only to application tables |
| B-2 | Parsing does not block submission | ✅ VERIFIED | Guest apply checks scan status but not parsing status |
| B-3 | Business rows + snapshot + audit + outbox atomic | ✅ VERIFIED | Guest apply uses single `this.system.transaction()` |
| B-4 | No raw resume content in response | ✅ VERIFIED | `parsed-data` uses allowlist; application response returns `document_id` only |
| B-5 | Cross-candidate access denied | ✅ VERIFIED | `validate_application_document_origin()` enforces ownership |
| B-6 | Cross-company access denied | ✅ VERIFIED | Job lookup validates `company_id` |

---

## 10. Missing Tests (Expected)

| # | Test | Priority |
|---|------|----------|
| T-1 | Successful registered apply flow | HIGH |
| T-2 | Duplicate candidate+job → 409 | HIGH |
| T-3 | Expired job → NOT_FOUND | HIGH |
| T-4 | Paused job → decision required | MEDIUM |
| T-5 | Document not owned → NOT_FOUND | HIGH |
| T-6 | Scan pending → SCAN_PENDING | HIGH |
| T-7 | Scan infected → INFECTED_FILE | HIGH |
| T-8 | No candidate profile → FORBIDDEN | HIGH |
| T-9 | Screening answers validation | MEDIUM |
| T-10 | Snapshot immutability after profile edit | HIGH |
| T-11 | Transaction rollback leaves no partial state | HIGH |
| T-12 | Storage cleanup on DB failure | MEDIUM |

---

## 11. Final Verdict

| Category | Status |
|----------|--------|
| **Schema** | ✅ Complete — all tables, triggers, functions, indexes |
| **Event contract** | ✅ Complete — `application.submitted.v1.json` |
| **Dispatcher routing** | ✅ Correct phased gap |
| **Registered apply code** | ❌ ABSENT — not implemented |
| **Guest apply (reference)** | ✅ Implemented — provides pattern |
| **BLOCKERs** | ✅ Zero schema/contract blockers |
| **Decisions required** | 6 (route, DTO, snapshot, idempotency, event routing, eligibility) |

**CONDITIONAL PASS** — Schema and event contract are ready. Six decisions must be resolved before coding. No schema or contract changes are required.

---

*Review completed. No files modified.*
