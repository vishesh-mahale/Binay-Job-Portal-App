# Phase 06 — NestJS API Catalog

Status: `DRAFT — RESUME/GUEST FLOWS CATALOGUED — COMPLETE DOMAIN CATALOG PENDING`

Authoritative latest status: `API CATALOG FROZEN — PHASE 07 ARCHITECTURE NEXT — CODING NOT AUTHORIZED`

This catalog is built from `PHASE-05-FINAL-REQUIREMENTS.md`, Stage-03 decisions, executable SQL,
contracts and Decision-01/02. No route, table, event or contract is invented. `TBD` means the
source does not freeze the detail yet.

Review note: detailed entries cover all current requirement domains and have passed independent
revalidation. Provider integrations and Gate G-1 remain tracked phased implementation gates; they
do not reopen the catalog scope. Exact public paths/DTOs marked `TBD` are Phase 07 architecture
deliverables. No NestJS implementation code is authorized by this document.

## 1. Common API rules

- Public prefix: `/api/v1`.
- Browser calls NestJS only; no direct browser-to-Supabase API/Storage access.
- User-facing personal/catalog reads use `UserContextClient` + approved RLS where available.
- Document/parsing reads and all business writes use trusted `SystemClient` plus NestJS
  authentication, authorization and ownership checks.
- Success/error envelope uses `schema_version: 1`, `request_id` and `trace_id`.
- No external call occurs inside a DB transaction.
- Mutating commands use `Idempotency-Key` where applicable; same checksum reuse is successful reuse.
- Rate limits are environment configuration and return `429` with retry information.
- Error vocabulary follows `DECISION-06-API-ERROR-VOCABULARY-HINGLISH.md`; `CONFLICT`, `EXPIRED`
  and `CURSOR_INVALID` are not public API codes. Domain conflicts must map to an approved code or
  return to Phase 7 as an explicit change request.
- No response/log may contain resume content, raw AI output, storage paths, tokens or stack traces.

## 2. Registered resume APIs

### API-RESUME-001 — Profile resume upload

```text
Requirement IDs: REQ-RESUME-001, REQ-RESUME-002, REQ-RESUME-005, REQ-API-001..007
Method/path: POST /api/v1/resumes/upload
Actor: authenticated candidate
Permission: active candidate; ownership derived from JWT, never request body
Request: multipart file + use_as_active_profile_resume boolean + optional Idempotency-Key
Default: per `DECISION-05-FIRST-RESUME-ACTIVE-DEFAULT-HINGLISH.md`, the first profile resume is
automatically active and the UI control is checked/disabled; later uploads require explicit
candidate choice. The server independently enforces the first-upload invariant.
Validation: size, MIME, extension, magic bytes, checksum, private-storage policy
Response: 201 new document or 200 reused document; document_id, both status tracks, stage, reused
Reads: users, candidate_profiles, uploaded_documents (trusted ownership query)
Writes: private storage, uploaded_documents
Transaction: metadata row + security.scan.requested outbox event in one commit
Outbox: security.scan.requested
Consumer: dispatcher → security-scan-queue → FastAPI security worker
Errors: VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, NOT_FOUND, RESUME_LIMIT_REACHED,
        DEPENDENCY_UNAVAILABLE, IDEMPOTENCY_CONFLICT, RATE_LIMITED
Rate limit: environment-configured upload limit; no numeric value is invented.
Audit/security: request/trace IDs logged; upload ownership and scan-request audit trail retained;
                 no file content/path/token in logs.
Acceptance: first eligible profile upload forces active selection server-side and the UI control is
checked/disabled; later uploads require explicit choice. Retry/reuse creates one document and one
scan event; no raw content in response/logs
```

### API-RESUME-002 — Resume status

```text
Requirement IDs: REQ-RESUME-005, REQ-RESUME-006, REQ-API-001, REQ-REALTIME-001
Method/path: GET /api/v1/resumes/:id/status
Actor: document owner candidate
Permission: ownership check; unknown/not-owned/soft-deleted = same 404
Request: document_id path parameter
Response: document_id, security_scan_status, processing_status, stage, retryable, timestamps
Reads: uploaded_documents, resume_parsing_jobs, safe job events where approved
Writes: none
Transaction: read-only bounded query
Outbox: none
Consumer: none; SSE may notify that this endpoint should be refetched
Errors: UNAUTHORIZED, NOT_FOUND, RATE_LIMITED, DEPENDENCY_UNAVAILABLE
Rate limit: environment-configured status-read limit; reconnect recovery must respect it.
Audit/security: ownership decision and request/trace IDs are logged without document content.
Acceptance: every DB state maps to exactly one stage; non-clean scan never appears ready
```

### API-RESUME-003 — Parsed review data

```text
Requirement IDs: REQ-RESUME-003, REQ-RESUME-006, REQ-API-001, REQ-API-007
Method/path: GET /api/v1/resumes/:id/parsed-data
Actor: document owner candidate
Permission: ownership check; parsed result must belong to the document
Request: document_id path parameter
Response: allowlisted `normalized_output`, `confidence_details`, `validation_result`,
`overall_confidence`, `schema_version`, parsing identifiers and `partial`; unknown fields are rejected.
Reads: resume_parsing_jobs, resume_parsed_data via SystemClient + ownership checks
Writes: none
Transaction: read-only bounded query
Outbox: none
Consumer: none
Errors: UNAUTHORIZED, NOT_FOUND, PARSING_FAILED, INFECTED_FILE, SCAN_FAILED, RATE_LIMITED,
        DEPENDENCY_UNAVAILABLE, INTERNAL_ERROR
Rate limit: environment-configured parsed-data read limit.
Audit/security: parsed-data access is ownership-audited; raw text/AI/artifact/error JSON is excluded.
Acceptance: raw extracted_text/raw_ai_output/artifacts/error_details never returned
Open detail: field-by-field normalized allowlist remains API-catalog blocker
```

### API-RESUME-004 — Confirm parsed profile facts

```text
Requirement IDs: REQ-CANDIDATE-001..004, REQ-RESUME-003, REQ-API-003..007
Method/path: POST /api/v1/resumes/:id/confirm
Actor: document owner candidate
Permission: ownership + clean scan + parsed result belongs to document
Request: expected_profile_revision + allowlisted canonical facts + Idempotency-Key
Validation: deleted_at null, scan clean, revision matches, unknown/system fields rejected
Response: candidate_id, new profile_revision, active_document_id, projection queued state
Reads: uploaded_documents, resume_parsing_jobs/resume_parsed_data, candidate_profiles
Writes: canonical profile/fact tables, profile_change_history, candidate document link,
        outbox event
Transaction: one atomic trusted transaction with row lock and one revision bump
Outbox: candidate.profile.changed
Consumer: dispatcher → projection-queue → FastAPI candidate projection
Errors: UNAUTHORIZED, NOT_FOUND, FORBIDDEN, SCAN_PENDING, INFECTED_FILE, PARSING_PENDING,
        PARSING_FAILED, STALE_REVISION, IDEMPOTENCY_CONFLICT, RATE_LIMITED,
        DEPENDENCY_UNAVAILABLE, INTERNAL_ERROR
Rate limit: environment-configured confirm limit; `Idempotency-Key` is required for retry safety.
Audit/security: profile history, revision, ownership and profile-change event are audited atomically.
Acceptance: stale/invalid confirm makes zero canonical changes; one logical save = one revision/event
```

## 3. Guest APIs

Frozen paths:

```text
POST /api/v1/guest-sessions
POST /api/v1/guest-sessions/:sessionId/resumes
GET  /api/v1/guest/resumes/:documentId/status
GET  /api/v1/guest/resumes/:documentId/parsed-data
POST /api/v1/guest/applications
POST /api/v1/guest/claims
```

Every guest use case must enforce active, unexpired, unrevoked session, job scope, session
ownership/XOR rules, upload count/byte limits, token protection and the approved claim state
machine. Exact DTO/header token transport, application snapshot fields and claim error catalog
remain to be filled from the guest requirements before freeze.

Traceability: guest session/resume paths map to `REQ-APPLICATION-003..005`; guest application
and claim handoff is detailed as `API-APPLICATION-003`. No separate `REQ-GUEST-*` family exists.

## 3A. Identity and authentication catalog

### API-PLATFORM-001 — Cross-cutting request/platform controls

```text
Requirement IDs: REQ-PLATFORM-001..008, REQ-API-001..007
Method/path: applies to every API; no standalone browser route assumed
Actor: all API callers and trusted internal callers
Permission: authentication, role/tenant authorization and internal caller authentication as applicable
Request/validation: DTO schema validation, correlation/idempotency headers, payload/file limits
Response: stable success/error envelope with correlation id; no secret/PII leakage
Reads: request context, authorization metadata and health/config state where needed
Writes: audit/outbox only within owning domain transactions; no generic cross-domain mutation
Transaction: domain-specific; external calls always post-commit
Outbox/consumer: domain contracts only; unknown events fail closed
Idempotency: required for commands that create side effects; query requests remain safe to repeat
Rate limit: environment-configured per-route/per-actor policies; exact thresholds remain open
Audit/security: structured redacted logs, trace/correlation ids, least-privilege clients and tenant isolation
Errors: VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, RATE_LIMITED, DEPENDENCY_UNAVAILABLE, INTERNAL_ERROR
Acceptance: invalid/unauthorized/oversized requests are rejected consistently and no partial transaction remains
```

### API-ONBOARDING-001 — Candidate onboarding completion

```text
Requirement IDs: REQ-ONBOARDING-001, REQ-CANDIDATE-001..006, REQ-RESUME-001..007
Method/path: TBD — onboarding status/profile completion command
Actor: authenticated candidate
Permission: own candidate account and active account status
Request/validation: confirmed canonical facts, required profile fields, selected active resume and consent
Response: completion status, profile revision and next actionable state
Reads: candidate profile, profile facts, resume/document processing state
Writes: canonical profile/provenance, revision/history, audit and approved outbox atomically
Transaction: confirmation and projection trigger are atomic; parsing/embedding remains asynchronous
Outbox/consumer: `candidate.profile.changed` where approved; worker output events are not browser routes
Idempotency: same confirmation revision is safe to replay
Rate limit: environment-configured profile mutation limit
Audit/security: candidate ownership, provenance and consent retained; incomplete/untrusted facts not promoted
Errors: VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, STALE_REVISION, DEPENDENCY_UNAVAILABLE
Acceptance: onboarding completion is not reported until required confirmation rules pass; later edits create a new revision
```

The source requirements define the behaviors, but do not freeze public route names for every auth
operation. Therefore paths below remain `TBD` until the API catalog review approves them.

### API-AUTH-001 — Registration/account bootstrap

```text
Requirement IDs: REQ-AUTH-001, REQ-AUTH-006, REQ-ONBOARDING-001, REQ-API-001..002
Method/path: TBD — auth signup/callback boundary must be confirmed with Supabase Auth
Actor: unauthenticated signup user / authenticated callback
Permission: provider verification and server-controlled account status
Request/validation: provider payload; never trust client role/status; normalize verified identity
Response: safe public user/account summary; no privileged fields or secrets
Reads: auth.users integration, public.users
Writes: public.users, security/audit records as approved
Transaction: user-row bootstrap and audit state must be atomic where NestJS owns the command
Outbox/consumer: TBD by approved auth event contract; no event invented here
Idempotency: provider subject/global user identity uniqueness; repeat callback must be safe
Rate limit: environment-configured signup/callback limits
Audit/security: login/security audit; no credentials/token logging
Errors: VALIDATION_ERROR, UNAUTHORIZED, IDEMPOTENCY_CONFLICT, RATE_LIMITED, INTERNAL_ERROR
Acceptance: duplicate callback does not create a second public user; role/status comes from server
```

### API-AUTH-002 — Session and account security operations

```text
Requirement IDs: REQ-AUTH-001, REQ-AUTH-003, REQ-AUTH-004
Method/path: TBD — session/security operations
Actor: authenticated user
Permission: own session/security records; admin-only operations remain separate
Request/validation: authenticated JWT and operation-specific DTO; no client user_id trust
Response: safe session/security status
Reads: public.users, user_sessions, user_security_log, login_history
Writes: user_sessions and security/audit rows through trusted server path
Transaction: each state-changing security command is atomic with its audit record
Outbox/consumer: none unless an approved auth event contract exists
Idempotency: logout/revoke operations safe on retry
Rate limit: environment-configured security-operation limits
Audit/security: every login/session/security transition audited; secrets excluded
Errors: UNAUTHORIZED, FORBIDDEN, NOT_FOUND, RATE_LIMITED, INTERNAL_ERROR
Acceptance: user cannot read or mutate another user's session/security data
```

### API-AUTH-003 — Protected-request authorization

```text
Requirement IDs: REQ-AUTH-002, REQ-AUTH-003, REQ-AUTH-005, REQ-API-001
Method/path: internal guard/policy use case, no standalone browser route
Actor: every protected API request
Permission: JWT validity + active account + role + company membership + resource ownership
Request/validation: request JWT/context; role is never accepted from request body
Response: authorized request context or standardized error envelope
Reads: public.users, memberships/ownership sources as required by domain
Writes: none
Transaction: none; evaluated before domain transaction
Outbox/consumer: none
Idempotency: not applicable
Rate limit: endpoint-specific policy applies after authentication
Audit/security: denied access is observable without leaking resource existence
Errors: UNAUTHORIZED, FORBIDDEN, NOT_FOUND
Acceptance: cross-user/cross-company access fails closed
```

## 3B. Companies and membership catalog

### API-COMPANY-001 — Company profile management

```text
Requirement IDs: REQ-COMPANY-001, REQ-COMPANY-004
Method/path: TBD — company CRUD resource
Actor: employer/owner/admin according to policy
Permission: company ownership/membership and company-management permission
Request/validation: server-derived owner/tenant; slug/name/business fields validated against SQL
Response: safe company profile and lifecycle state
Reads: companies, public.users/company ownership context
Writes: companies plus required audit/outbox records in one transaction
Transaction: business row + history/audit/outbox atomic where event is approved
Outbox/consumer: TBD; no event invented
Idempotency: client command retry must not duplicate company identity
Rate limit: environment-configured mutation limit
Audit/security: ownership/tenant checks and actor recorded
Errors: VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, NOT_FOUND, RATE_LIMITED
Acceptance: user cannot access another company; unsafe owner/status changes fail closed
```

### API-COMPANY-002 — Branch/department/team management

```text
Requirement IDs: REQ-COMPANY-001, REQ-COMPANY-004, REQ-COMPANY-005
Method/path: TBD — nested company administration resources
Actor: company owner/admin with management permission
Permission: same-company ownership and relationship permissions
Request/validation: company_id from authorized context; parent relationships validated
Response: branch/department/team resource with active/retained state
Reads: company_branches, departments, teams, companies
Writes: corresponding organization tables and audit/history in transaction
Transaction: relationship changes and safety checks atomic; no hard-delete shortcut
Outbox/consumer: TBD according to existing contracts only
Idempotency: safe retry for create/update/deactivate commands
Rate limit: environment-configured company-admin limit
Audit/security: actor, tenant and reassignment decisions audited
Errors: VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, NOT_FOUND, RATE_LIMITED
Acceptance: deactivation cannot orphan required manager/lead relationships
```

### API-COMPANY-003 — Membership invite/activate/deactivate

```text
Requirement IDs: REQ-COMPANY-002, REQ-COMPANY-004, REQ-COMPANY-005
Method/path: TBD — membership commands
Actor: company owner/admin
Permission: same-company membership-management permission
Request/validation: target user/email and company derived/validated server-side; role/status guarded
Response: membership summary without secrets
Reads: company_members, companies, users, departments, teams
Writes: company_members and related audit/history in one transaction
Transaction: invite/activate/deactivate/reassign relationships atomic
Outbox/consumer: TBD; invitation event only after approved contract is mapped
Idempotency: repeated invite/deactivate commands are safe and deterministic
Rate limit: environment-configured invitation/admin limit
Audit/security: membership actor, role, status and reassignment audited
Errors: VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, NOT_FOUND, RATE_LIMITED
Acceptance: active owner/lead/manager relationships cannot be deactivated without reassignment
```

Rejoin is a two-step membership command under this capability: the former member calls
`POST /api/v1/companies/:companyId/membership/rejoin` to create a durable request on the
existing row; an owner/admin calls
`POST /api/v1/companies/:companyId/members/:memberId/approve-rejoin` to reactivate it.
The request state is provided by the `company_members` columns defined in baseline `04_companies.sql`.

### API-COMPANY-004 — Company job-approval settings

```text
Requirement IDs: REQ-COMPANY-001, REQ-COMPANY-004, REQ-JOB-001
Method/path: GET|PATCH /api/v1/companies/:companyId/settings
Actor: authenticated company member (read); company owner or platform admin (update)
Permission: active same-company membership for reads; owner/admin governance permission for update
Request/validation: PATCH accepts required boolean job_approval_required only
Response: safe company_settings projection; custom_config and timestamps included, no secrets
Reads: companies, company_members, users, company_settings
Writes: company_settings and audit_logs atomically for effective changes
Transaction: row lock + update + audit insert in one transaction
Outbox/consumer: none
Idempotency: same-value PATCH is a no-op
Rate limit: environment-configured company-admin limit
Audit/security: company.settings_updated; cross-company access fails closed
Errors: VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, NOT_FOUND, RATE_LIMITED
Acceptance: default false means direct publish; true means approval workflow; existing jobs unchanged
```

## 3C. Candidate profile catalog

### API-CANDIDATE-001 — Read own canonical profile

```text
Requirement IDs: REQ-CANDIDATE-001..002, REQ-AUTH-003, REQ-API-001
Method/path: TBD — candidate profile read resource
Actor: authenticated candidate
Permission: own candidate profile; approved personal read may use UserContextClient + RLS
Request/validation: candidate identity derived from JWT; no arbitrary user_id trust
Response: candidate_profiles plus authorized canonical child facts; system/provenance fields filtered
Reads: candidate_profiles, candidate_skills, candidate_experiences, candidate_educations,
       candidate_certifications, candidate_projects, candidate_languages, candidate_links
Writes: none
Transaction: bounded read-only query
Outbox/consumer: none
Idempotency: not applicable
Rate limit: environment-configured profile-read limit
Audit/security: ownership/RLS enforced; sensitive fields follow approved visibility policy
Errors: UNAUTHORIZED, NOT_FOUND, RATE_LIMITED, DEPENDENCY_UNAVAILABLE
Acceptance: candidate A cannot read candidate B's private profile facts
```

### API-CANDIDATE-002 — Save canonical profile facts

```text
Requirement IDs: REQ-CANDIDATE-001..005, REQ-API-002..007
Method/path: TBD — candidate profile save command
Actor: authenticated candidate
Permission: own active candidate profile
Request/validation: allowlisted profile/fact fields; server-controlled provenance, verification,
                       revision, timestamps and embeddings; preferred-work-mode rules validated
Response: updated canonical profile, new profile_revision and projection queued state
Reads: candidate_profiles and canonical child facts; expected profile_revision
Writes: candidate_profiles, candidate_* fact tables, profile_change_history, outbox
Transaction: one logical save; row lock/revision check; facts + history + one revision bump + event
Outbox/consumer: candidate.profile.changed → projection-queue → FastAPI projection worker
Idempotency: Idempotency-Key and expected revision; stale = 409 STALE_REVISION
Rate limit: environment-configured profile-mutation limit
Audit/security: actor/provenance/verification protected; no client system fields accepted
Errors: VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, NOT_FOUND, STALE_REVISION,
        IDEMPOTENCY_CONFLICT, RATE_LIMITED, DEPENDENCY_UNAVAILABLE, INTERNAL_ERROR
Acceptance: five child fact changes in one save produce one revision bump, one history record and
             one candidate.profile.changed event
```

### API-CANDIDATE-003 — Candidate profile fact removal/archive

```text
Requirement IDs: REQ-CANDIDATE-001..004, REQ-API-001..007
Method/path: TBD — canonical fact archive command
Actor: authenticated candidate
Permission: own fact row and active profile
Request/validation: fact identifier and expected revision; hard delete prohibited where SQL requires
Response: updated revision and projection queued state
Reads: candidate profile/fact row with ownership
Writes: soft-delete/archive fact, profile_change_history, outbox
Transaction: fact mutation + one revision bump + history + event atomic
Outbox/consumer: candidate.profile.changed → projection-queue
Idempotency: safe retry with Idempotency-Key and expected revision
Rate limit: environment-configured mutation limit
Audit/security: deletion actor/reason retained; no cross-candidate access
Errors: UNAUTHORIZED, NOT_FOUND, FORBIDDEN, STALE_REVISION, IDEMPOTENCY_CONFLICT, RATE_LIMITED
Acceptance: archived fact is excluded from active projection but historical evidence remains retained
```

## 3D. Jobs and search catalog

> **Decision sync (2026-08-27):** J1–J8 are frozen in
> `04-nestjs-api/04-nestjs-api-app/jobs-search-review/DECISION-07-JOBS-SEARCH-FINAL.md`.
> The earlier `TBD` route/DTO placeholders in this section are superseded by that decision;
> concrete DTO schemas and error-field details are implementation deliverables.

### API-JOB-001 — Job create/update/lifecycle command

Decision-07 (`04-nestjs-api-app/jobs-search-review/DECISION-07-JOBS-SEARCH-FINAL.md`) supersedes
the earlier generic `TBD` route placeholder in this section. The concrete company-scoped routes
and named lifecycle commands are listed in Decision-07; detailed DTOs and acceptance tests remain
implementation work.

```text
Requirement IDs: REQ-JOB-001..003, REQ-COMPANY-003..004, REQ-API-001..007
Method/path: concrete company-scoped routes (Decision-07):
  POST  /api/v1/companies/:companyId/jobs
  GET   /api/v1/companies/:companyId/jobs/:jobId
  PATCH /api/v1/companies/:companyId/jobs/:jobId
  POST  /api/v1/companies/:companyId/jobs/:jobId/publish
  POST  /api/v1/companies/:companyId/jobs/:jobId/pause
  POST  /api/v1/companies/:companyId/jobs/:jobId/resume
  POST  /api/v1/companies/:companyId/jobs/:jobId/close
  POST  /api/v1/companies/:companyId/jobs/:jobId/archive
  POST  /api/v1/companies/:companyId/jobs/:jobId/submit-for-approval
  POST  /api/v1/companies/:companyId/jobs/:jobId/approve
  POST  /api/v1/companies/:companyId/jobs/:jobId/reject
Actor: authorized employer/HR
Permission: active company membership and job-management permission
Implementation status: create, draft update, read, submit-for-approval, publish, approve, reject,
                        pause, resume, close and archive controller commands are now implemented
                        for the current owner/admin-safe slice; HR permission-key expansion remains
                        pending contract clarification.
Request/validation: structured title, description, skills, locations, work mode, compensation,
                       experience and lifecycle fields; owner/company derived server-side
Response: job resource and lifecycle state
Reads: companies, company_members, jobs, job_skills, job_locations, job_categories
Writes: jobs and child requirement tables, history/audit and approved outbox events
Transaction: job business rows + audit/history + outbox atomic
Outbox/consumer: `job.ai.enrichment.requested` on first publish or approved AI-relevant changes to
                 an already published job; Gate G-1 envelope validation is mandatory
Idempotency: command Idempotency-Key; lifecycle transition guard prevents invalid transitions
Rate limit: environment-configured job mutation limit
Audit/security: company/actor/approval policy captured; no cross-company writes
Errors: VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, NOT_FOUND, RATE_LIMITED,
        DEPENDENCY_UNAVAILABLE, INTERNAL_ERROR
Acceptance: unauthorized company member cannot create/update/publish another company's job
```

### API-SEARCH-001 — Job search

```text
Requirement IDs: REQ-SEARCH-001..002, REQ-API-001..007
Method/path: TBD — exact public search path is not specified by Decision-07;
                    do not invent one before the API route decision is recorded
Actor: authenticated candidate (public/catalog visibility as approved)
Permission: only active/published/non-expired visible jobs
Request/validation: opaque signed cursor (default 20, max 50, 30-minute TTL); keyword/FTS,
                       location, skill, experience, salary, company,
                       job type, work mode and posted-date filters
Response: paginated safe job cards and cursor/next-page metadata
Reads: jobs, job_skills, job_locations, job_categories and approved search indexes/projections
Writes: none, except separately catalogued analytics/view event if approved
Transaction: bounded read-only query
Outbox/consumer: none for search itself; analytics is separate requirement
Idempotency: not applicable
Rate limit: environment-configured search/read limit
Audit/security: visibility and tenant/public filters; no internal employer fields
Errors: VALIDATION_ERROR, UNAUTHORIZED where required, RATE_LIMITED, DEPENDENCY_UNAVAILABLE
Acceptance: expired/closed jobs are excluded; cursor binds filter hash/sort and rejects tampering;
            pagination is bounded; confidential company identity is masked publicly
```

### API-SEARCH-002 — Authorized recruiter candidate search

```text
Requirement IDs: REQ-SEARCH-003..004, REQ-SAVED-CANDIDATE-001, REQ-COMPANY-003..004
Method/path: TBD — exact recruiter-search path is not specified by Decision-07;
                    do not invent one before the API route decision is recorded
Actor: authorized HR/employer
Permission: active company membership and recruiter search permission
Request/validation: opaque signed cursor (default 20, max 50, 10-minute TTL); bounded
                       keyword/FTS/semantic filters; no arbitrary raw evidence selector
Response: paginated candidate projection cards with explainable source/trust labels
Reads: candidate_search_profiles and approved canonical/projection joins
Writes: none; saved-candidate action is separately catalogued
Transaction: bounded read-only query
Outbox/consumer: matching/analysis event only when explicitly requested and contracted
Idempotency: not applicable for read
Rate limit: environment-configured recruiter-search limit
Audit/security: company authorization and candidate visibility policy; raw evidence withheld
Errors: VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, RATE_LIMITED, DEPENDENCY_UNAVAILABLE
Acceptance: active membership + recruiter-search permission + `is_open_to_work = true` are required;
            cross-company eligible candidates may be returned; stale rows include
            `projection_freshness: "stale"`; raw resume/evidence is excluded
```

## 3E. Applications and saved candidates catalog

### API-APPLICATION-001 — Registered candidate apply

```text
Requirement IDs: REQ-APPLICATION-001..002, REQ-APPLICATION-005..007, REQ-API-001..007
Method/path: PROPOSED `POST /api/v1/jobs/:jobId/apply` (human freeze pending)
Actor: authenticated candidate
Permission: active candidate, visible/eligible job, one logical candidate+job application
Request/validation: `document_id` (owned pre-uploaded document), optional `cover_letter`,
                       optional screening-answer array, required consent acknowledgement;
                       inline multipart upload is not part of apply
Response: application_id, submitted state, immutable snapshot summary
Reads: jobs, candidate_profiles, selected uploaded_documents, canonical facts and active parsed data
Writes: job_applications, application_documents, application_profile_snapshots, audit/history, outbox
Transaction: application + selected resume link + immutable snapshot + outbox atomic
Outbox/consumer: emit approved `application.submitted` v1 in the same transaction;
                 dispatcher has no current route, so it remains fail-closed/expected phased gap
Idempotency: baseline unique `(job_id, candidate_id)` is authoritative; concurrent duplicate
             submits return the existing application. Do not promise an Idempotency-Key replay
             contract until a persisted key field/store is approved.
Rate limit: environment-configured apply limit
Audit/security: consent, actor, job and snapshot provenance retained; no cross-candidate apply
Errors: VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, NOT_FOUND,
        IDEMPOTENCY_CONFLICT, RATE_LIMITED, INTERNAL_ERROR
Acceptance: only published + non-expired + non-deleted jobs accept; paused/closed/expired reject;
            parsing does not block submit; submitted snapshot never changes after later profile edits;
            event payload validates `application-submitted.v1` including `snapshot_id` and timestamps
```

### API-APPLICATION-002 — Application status transition

```text
Requirement IDs: REQ-APPLICATION-006, REQ-COMPANY-003..004, REQ-API-001..007
Method/path: `PATCH /api/v1/companies/:companyId/applications/:applicationId/status`
Actor: authorized HR/employer/admin according to transition policy
Permission: same-company application access and allowed actor/transition
Request/validation: target status, rejection reason where required, change reason, expected current state
Response: updated application status, history entry and audit metadata
Reads: job_applications, company membership/permissions, current status/history
Writes: job_applications, application_status_history, audit and outbox
Transaction: approved `change_application_status` function/command atomically validates transition,
             updates current state/history/reason and emits event
Outbox/consumer: database function emits `application.status.changed`; downstream consumer remains an
                 expected phased gap
Idempotency: repeated same-state command is deterministic; invalid/backward/terminal transitions fail
Rate limit: environment-configured recruiter mutation limit
Audit/security: actor, reason and rejection_reason retained; no direct ad-hoc UPDATE path
Errors: VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, NOT_FOUND, STALE_REVISION, RATE_LIMITED, INTERNAL_ERROR
Acceptance: terminal states cannot reopen; invalid transition leaves zero partial writes
```

### API-SAVED-CANDIDATE-001 — HR saved candidate bookmark

```text
Requirement IDs: REQ-SAVED-CANDIDATE-001, REQ-COMPANY-003..004, REQ-API-001..007
Method/path: `POST/GET/DELETE /api/v1/companies/:companyId/saved-candidates[/:candidateId]`
Actor: authorized HR/employer
Permission: active company membership and recruiter search permission; bookmark owner derived server-side
Request/validation: candidate id and optional private note; no job id (feature is non-job-specific)
Response: saved-candidate row/list with owner-scoped note and timestamps
Reads: saved_candidates, company membership and candidate visibility context
Writes: saved_candidates only through trusted NestJS command
Transaction: bookmark create/update/remove atomic; no outbox required unless approved later
Outbox/consumer: none currently approved
Idempotency: unique `(recruiter_user_id, candidate_id)`; repeat save is deterministic
Rate limit: environment-configured bookmark limit
Audit/security: owner-only visibility; candidate data access remains company-authorized
Errors: VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, NOT_FOUND, IDEMPOTENCY_CONFLICT, RATE_LIMITED
Acceptance: HR A cannot see HR B's bookmarks; same candidate saves only once per HR; unsave is
            explicit DELETE; save requires the candidate to be currently eligible for recruiter visibility
```

### API-APPLICATION-003 — Guest application and claim handoff

```text
Requirement IDs: REQ-APPLICATION-003..005, REQ-API-001..007
Method/path: TBD — guest apply command and claim endpoint
Actor: unauthenticated guest applicant; later authenticated claimant
Permission: valid active guest upload session, same-job binding and token/identity checks
Request/validation: job_id, guest session, application-only resume or document, normalized email, claim token and consent
Response: application id, submitted state, claim/status information; never expose token hash
Reads: jobs, guest_upload_sessions, uploaded_documents, guest claims
Writes: job_applications, application_documents, immutable snapshot, guest claim/audit and outbox atomically
Transaction: guest session validation + application/snapshot/claim handoff atomic; no external call in transaction
Outbox/consumer: only approved application/parse contracts; missing contract remains explicit phased gap
Idempotency: guest session/application uniqueness and claim token make retries safe; no session reuse
Rate limit: guest upload/apply/claim attempt limits
Audit/security: session active/unexpired, document ownership, deleted-document rejection, token hash protection
Errors: VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, NOT_FOUND, GUEST_SESSION_INVALID, RATE_LIMITED, INTERNAL_ERROR
Acceptance: guest submission is visible only under permitted application scope; claim cannot move application identity
```

### API-APPLICATION-004 — Candidate application reads

```text
Requirement IDs: REQ-APPLICATION-001..007, REQ-API-001..007
Method/path: `GET /api/v1/me/applications`, `GET /api/v1/me/applications/:applicationId`,
             `GET /api/v1/me/applications/:applicationId/history`
Actor: authenticated candidate
Permission: JWT-derived candidate/user ownership only
Request/validation: cursor pagination; optional status/date filters; application id UUID
Response: candidate-safe job summary, current status, applied time, immutable snapshot summary/history
Reads: job_applications, jobs, application_status_history, submitted snapshot
Writes: none
Transaction: read-only trusted NestJS query
Outbox/consumer: none
Idempotency: not applicable
Audit/security: recruiter notes, internal AI fields and raw resume content excluded
Acceptance: cross-candidate application ids are not disclosed; later profile edits do not alter snapshot
```

### API-APPLICATION-005 — Company application reads

```text
Requirement IDs: REQ-APPLICATION-006..007, REQ-COMPANY-003..004, REQ-API-001..007
Method/path: `GET /api/v1/companies/:companyId/applications`,
             `GET /api/v1/companies/:companyId/applications/:applicationId`
Actor: authorized HR/employer/admin
Permission: active company membership and approved application-view permission
Request/validation: cursor pagination; optional job/status/date filters; UUID ids
Response: authorized application summary/detail and immutable submitted snapshot fields
Reads: job_applications, jobs, candidate profile summary, snapshots, history, company membership
Writes: none
Transaction: read-only trusted NestJS query
Outbox/consumer: none
Idempotency: not applicable
Audit/security: company boundary enforced; raw resume bytes and unauthorized private fields excluded
Acceptance: cross-company applications return safe not-found; snapshot is never rebuilt from current profile
```

## 3F. Referrals catalog

### API-REFERRAL-001 — Create manual referral batch/invitations

```text
Requirement IDs: REQ-REFERRAL-001..003, REQ-API-001..007
Method/path: TBD — recruiter referral command
Actor: any eligible active authenticated user
Permission: referral policy eligibility; company/job context scopes the referral, but a separate
recruiter/referrer role or company-membership gate is not assumed
Request/validation: job_id, candidate contact entries, idempotency key; normalize email; reject duplicates per frozen policy
Response: batch/invitation identifiers and initial states
Reads: jobs, company membership, referral batches/invitations
Writes: referral_batches, referral_invitations, audit, outbox where an approved contract exists
Transaction: batch and invitation rows plus audit/outbox atomic; no external email call in transaction
Outbox/consumer: delivery event only if an approved contract/route exists; otherwise explicit phased gap
Idempotency: client key and unique active invitation policy make retries safe
Rate limit: environment-configured referral-create limit
Audit/security: referrer ownership, normalized contact and consent metadata; no token/PII in logs
Errors: VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, NOT_FOUND, RATE_LIMITED, INTERNAL_ERROR
Acceptance: one active invitation per frozen uniqueness policy; historical terminal rows remain auditable
```

### API-REFERRAL-002 — Referral invitation lifecycle/attribution

```text
Requirement IDs: REQ-REFERRAL-004..006, REQ-APPLICATION-004, REQ-API-001..007
Method/path: TBD — invitation open/accept/decline and application attribution
Actor: invited guest/candidate; authorized referrer for administrative actions
Permission: valid token/claim or owning company role
Request/validation: token, invitation state, expiry, matching email/identity, target application
Response: lifecycle state and attribution result without exposing token hash
Reads: referral_invitations, guest claims, applications, users
Writes: invitation/claim lifecycle, referral attribution, audit and approved outbox rows atomically
Transaction: state guard + attribution + audit in one transaction
Outbox/consumer: notification/delivery events only when versioned contracts exist; no invented event
Idempotency: repeated open/accept/decline is deterministic and cannot re-attribute another application
Rate limit: environment-configured token-attempt and referral mutation limits
Audit/security: token hashes never returned/logged; claim identity immutable; cross-company access denied
Errors: VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, NOT_FOUND, RATE_LIMITED
Acceptance: merged/applied/declined terminal rules and reissue policy are enforced exactly as frozen
```

### API-REFERRAL-003 — Referral reward review

```text
Requirement IDs: REQ-REFERRAL-006..007
Method/path: TBD — internal reward review command
Actor: authorized company/admin finance role
Permission: reward-management permission and company scope
Request/validation: invitation/application reference, target reward state, reason and reward terms
Response: reward state and immutable financial/audit summary
Reads: referral rewards, invitations, applications, company permissions
Writes: referral rewards, audit and approved outbox rows atomically
Transaction: state transition and audit atomic; no payment-provider call inside transaction
Outbox/consumer: payment/email integration remains a documented provider/contract gap
Idempotency: state transition key prevents duplicate approval/payment commands
Rate limit: environment-configured finance mutation limit
Audit/security: financial terms immutable after approval/paid; sensitive data restricted
Errors: VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, NOT_FOUND, RATE_LIMITED, INTERNAL_ERROR
Acceptance: invalid reward transitions and missing type-specific terms are rejected
```

## 3G. Interviews, messaging and realtime catalog

### API-INTERVIEW-001 — Schedule/reschedule/cancel interview

```text
Requirement IDs: REQ-INTERVIEW-001..002, REQ-API-001..007
Method/path: TBD — interview scheduling command
Actor: authorized HR/interviewer and participating candidate where allowed
Permission: application visibility, participant authorization and schedule ownership
Request/validation: application, participants, start/end/timezone, meeting details, expected version
Response: interview record, status, participants and schedule version
Reads: applications, users, company membership, interviewers, interviewer_availability,
       interview_schedule_blocks, interview_participants and existing interviews
Writes: interviews, interview_schedule_blocks, interview_participants, audit/history and approved outbox rows atomically
Transaction: conflict/overlap validation + write + audit/outbox atomic
Outbox/consumer: `interview.summary.requested` only where applicable; reminders/notifications require approved contracts
Idempotency: client idempotency key and expected version prevent duplicate schedules/lost updates
Rate limit: environment-configured scheduling limit
Audit/security: participant-only details; meeting secrets never logged
Errors: VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, STALE_REVISION, NOT_FOUND, RATE_LIMITED
Acceptance: reschedule/cancel history is retained and unauthorized participants cannot alter it
```

`REQ-INTERVIEW-003` (provider/reminder integration) remains FUTURE and is not implemented by
this catalog entry until its provider contract is approved.

### API-MESSAGE-001 — Participant-authorized chat

```text
Requirement IDs: REQ-MESSAGE-001, REQ-REALTIME-001, REQ-API-001..007
Method/path: TBD — message send/list and realtime subscription
Actor: authenticated candidate/HR participant
Permission: active participant in the permitted application/conversation
Request/validation: conversation, text/attachments policy, client message id, size/content limits
Response: persisted message id/status and cursor-based history
Reads: conversations/messages and participant membership
Writes: messages, delivery/read metadata, audit and optional notification outbox atomically
Transaction: message + delivery metadata atomic; external realtime publish after commit
Outbox/consumer: notification event only if approved; direct websocket/SSE delivery is post-commit
Idempotency: client message id is not currently persisted by the baseline schema; the exact
approved persistence mechanism remains TBD. Cursor recovery is deterministic.
Rate limit: per-user conversation send limit
Audit/security: participant isolation, content redaction, no secrets in logs
Errors: VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, NOT_FOUND, IDEMPOTENCY_CONFLICT, RATE_LIMITED
Acceptance: non-participants cannot read/send; reconnect can recover from persisted cursor
```

### API-REALTIME-001 — Status/notification stream

```text
Requirement IDs: REQ-AUTH-007, REQ-NOTIFY-001..003, REQ-REALTIME-001, REQ-API-001..007
Method/path: TBD — approved realtime transport endpoint
Actor: authenticated user
Permission: user receives only own/company-authorized notifications
Request/validation: JWT at connection, last_event_id/cursor, heartbeat and reconnect parameters
Response: ordered events plus explicit resync/status response
Reads: notifications and authoritative status tables on initial/recovery sync
Writes: read/ack cursor only through NestJS trusted path
Transaction: notification creation is separate domain transaction; stream delivery post-commit
Outbox/consumer: event source is approved notification path; transport is not the source of truth
Idempotency: cursor replay and duplicate delivery are client-safe
Rate limit: connection, replay and acknowledgement limits
Audit/security: JWT verified at connect; authorization rechecked for subscriptions; no cross-user stream
Errors: VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, RATE_LIMITED, DEPENDENCY_UNAVAILABLE
Acceptance: online users get live header updates; offline users see persisted notifications after reconnect
```

## 3H. Notifications, analytics, feedback, subscriptions and AI

### API-NOTIFY-001 — List/mark in-app notifications

```text
Requirement IDs: REQ-NOTIFY-001..003, REQ-API-001..007
Method/path: PROPOSED `GET /api/v1/me/notifications`,
             `PATCH /api/v1/me/notifications/:notificationId/read`,
             `PATCH /api/v1/me/notifications/read-all` (ack method/shape freeze pending)
Actor: authenticated user
Permission: own notifications only
Request/validation: cursor, unread filter, notification id and expected version
Response: paginated notifications, unread count, acknowledgement result
Reads: notifications
Writes: notification read/ack fields through NestJS trusted path
Transaction: acknowledgement + audit atomic where audit is required
Outbox/consumer: notification row is created by approved event consumer/domain path; no email required for current in-app scope
Idempotency: repeated acknowledgement is safe
Rate limit: environment-configured notification query limit
Audit/security: own-row access; payload excludes secrets/PII beyond product need
Errors: UNAUTHORIZED, FORBIDDEN, NOT_FOUND, RATE_LIMITED
Acceptance: online users receive post-commit live header updates; offline users see persisted rows
            after reconnect; cross-user notification access is denied
```

### API-NOTIFY-002 — Future email delivery policy boundary

```text
Requirement IDs: REQ-NOTIFY-002
Method/path: TBD — NOT IMPLEMENTATION-AUTHORIZED in current notification phase
Actor: trusted notification system; user preferences are read through authorized NestJS path
Permission: preference/policy checks and tenant scope
Request/validation: event type, recipient policy, template/version reference and idempotency key are TBD
Response: delivery intent/status is TBD; no provider response contract is invented
Reads/writes: notification preferences, delivery records and provider configuration are TBD
Transaction: domain event/outbox commit precedes any external email call
Outbox/consumer: `notification.email.requested` remains an expected phased route; no current dispatcher route
Idempotency: provider delivery key and retry policy require decision
Rate limit: policy/provider limits require decision
Audit/security: consent, unsubscribe, provider response redaction and PII retention require decision
Errors/acceptance: no unconditional or duplicate email; exact error contract is a GAP-006 decision
Status: REQUIRED in final product scope, but implementation deferred until contract/provider/template decisions close
```

### API-NOTIFY-003 — Versioned email template administration boundary

```text
Requirement IDs: REQ-NOTIFY-003
Method/path: TBD — NOT IMPLEMENTATION-AUTHORIZED in current notification phase
Actor: authorized admin/template manager
Permission: tenant/admin scope and safe template-management permission
Request/validation: template key, locale, approved variables, version, preview and activation state are TBD
Response: versioned template metadata and sanitized preview are TBD
Reads/writes: notification_templates model/API is a GAP-006 decision; no table is invented here
Transaction: version/activation/audit atomic; rendering/provider calls remain outside transactions
Outbox/consumer: depends on `notification.email.requested` contract/route decision
Idempotency: version activation must be deterministic; exact key is TBD
Rate limit: admin preview/publish limits require decision
Audit/security: variable allowlist, rendering sandbox, approval history and secret/PII exclusion required
Errors/acceptance: unsafe variables/templates rejected; version history and rollback tests required
Status: REQUIRED + GAP-006; deferred until template schema, API and contract are approved
```

### API-ANALYTICS-001 — Analytics event/aggregate access

```text
Requirement IDs: REQ-ANALYTICS-001, REQ-API-001..007
Method/path: TBD — internal analytics command/query
Actor: authorized admin/company role or trusted system
Permission: tenant/report scope and least-privilege aggregation
Request/validation: event type, time range, aggregate dimensions and retention limits
Response: aggregate values without raw unnecessary PII
Reads: approved analytics/event tables
Writes: append-only analytics events/aggregates through trusted path
Transaction: business event and analytics outbox linkage only where contract is approved
Outbox/consumer: event consumer/warehouse integration is a documented deployment decision
Idempotency: event key prevents duplicate counting
Rate limit: report/export limit
Audit/security: tenant isolation, PII minimization and retention policy
Errors: VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, RATE_LIMITED, INTERNAL_ERROR
Acceptance: cross-tenant aggregates are impossible; duplicate event replay does not double count
```

### API-FEEDBACK-001 — Submit/manage feedback

```text
Requirement IDs: REQ-FEEDBACK-001, REQ-API-001..007
Method/path: `POST /api/v1/feedback` (registered submission implemented);
             guest submission/admin moderation remain separately gated
Actor: authenticated user for current submission route; admin moderator for future triage
Permission: active authenticated user for submission; moderation role only for future admin path
Request/validation: category, subject, message and optional rating for current route;
                   target/moderation/idempotency fields remain gated
Response: feedback id and submission timestamp; moderation status is admin-only future behavior
Reads: active user identity for current route; target/moderation reads future
Writes: `platform_feedback` submission through trusted path; moderation/audit future
Transaction: feedback submission atomic; external notification post-commit only if approved
Outbox/consumer: no contract assumed; notification integration is a phased gap if required
Idempotency: one logical submission per defined context/user policy
Rate limit: feedback submission limit
Audit/security: abuse controls, PII minimization and moderator audit
Errors: VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, RATE_LIMITED
Acceptance: unauthorized target feedback and duplicate submissions are rejected
```

### API-AI-001 — Request approved AI enrichment/matching operation

```text
Requirement IDs: REQ-AI-001..004, REQ-API-001..007
Method/path: TBD — NestJS command that creates approved outbox event
Actor: authenticated candidate/HR or trusted system according to operation
Permission: resource ownership/company scope and feature availability
Request/validation: aggregate id, operation type, source revision, consent and idempotency key
Response: accepted event/job id and current processing status; no fabricated result
Reads: source profile/job/application revisions and existing processing state
Writes: processing request/audit/outbox atomically; worker writes result via trusted path
Transaction: request row/event commit before any external AI call
Outbox/consumer: only the seven registered contracts/routes; provider/model is deployment configuration
Idempotency: source revision + operation key coalesces duplicate work
Rate limit: per-user/company AI request budget
Audit/security: no resume content/secrets in task payload/logs; provider data policy enforced
Errors: VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, IDEMPOTENCY_CONFLICT, RATE_LIMITED, DEPENDENCY_UNAVAILABLE
Acceptance: stale revisions are coalesced/rejected safely and successful worker result is traceable to event id
```

### API-SUBSCRIPTION-001 — Subscription/billing boundary (gap)

```text
Requirement IDs: REQ-SUBSCRIPTION-001
Method/path: TBD — NOT IMPLEMENTATION-AUTHORIZED
Actor/permission: TBD by product and billing-provider decision
Request/validation/response: TBD; no provider or payment behavior may be invented
Reads/writes/transaction/outbox/consumer: TBD; external billing calls must remain outside DB transactions
Idempotency/rate limit/audit/security/errors/acceptance: decision required before catalog freeze
Status: NEEDS_CLARIFICATION / GAP; owner and provider decision required
```

## 4. Internal commands/use cases

These are not browser routes but must be represented in implementation planning:

| Use case | Owner | Atomic requirement |
|---|---|---|
| Create business row + outbox | NestJS domain module | Same transaction; no external call |
| Change application status | NestJS application module/approved DB function | status + history + audit + outbox atomic |
| Confirm canonical profile | NestJS candidate module | facts + revision + history + outbox atomic |
| Recover/cleanup orphaned document | Approved cleanup worker/sweeper | compensating event, retry/dead-letter policy |
| Process SSE recovery | NestJS realtime module | REST/database authoritative state |

## 5. Catalog coverage and remaining decisions

The following groups now have detailed entries above. They remain marked `TBD` where the repository
does not freeze a public route, DTO, provider, or contract; this is intentional and is not permission
to invent one:

```text
Detailed entries: AUTH, COMPANY, CANDIDATE, JOB, SEARCH, APPLICATION, REFERRAL,
INTERVIEW, MESSAGE, REALTIME, NOTIFY, ANALYTICS, FEEDBACK, AI, SAVED-CANDIDATE.
Open decision entries: SUBSCRIPTION provider/billing contract; configurable referral reward program;
application.status.changed contract/route; notification.email.requested route; cleanup event;
final public method/path names; concrete rate-limit values; transport implementation ADR;
saved_jobs CRUD has no REQ-ID yet and must be resolved upstream; REQ-SEARCH-005 is FUTURE;
REQ-RESUME-007 remains NEEDS_CLARIFICATION/GAP-004.
```

### API-COMPANY-004 — Ownership transfer

```text
Requirement/decision IDs: REQ-COMPANY-001, REQ-COMPANY-004, D8
Method/path: POST /api/v1/companies/:companyId/ownership-transfer
Actor: current company owner
Permission: same-company owner authorization; target must be an eligible active company member
Request/validation: new_owner_user_id required; company_id and actor derived from route/JWT
Response: safe CompanySummaryDto
Reads: companies, company_members, users
Writes: companies.owner_id and related membership state in one atomic transaction
Transaction: eligibility, relationship checks, owner update and audit/history commit atomically
Outbox/consumer: none unless an approved contract is later mapped
Idempotency: repeat transfer to current owner is deterministic; conflicting target/revision fails safely
Rate limit: environment-configured company-admin mutation limit
Audit/security: actor, old owner, new owner and reassignment decisions audited
Errors: VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, NOT_FOUND, STALE_REVISION, IDEMPOTENCY_CONFLICT, RATE_LIMITED
Acceptance: non-owner/cross-company requests fail; target is active member; exactly one owner remains after commit
```

## 6. Contract and route guardrails

- Dispatcher currently has seven registered input routes: resume parsing, candidate profile change,
  job enrichment, match analysis, interview summary, screening questions and security scan.
- `application.status.changed` is an expected phased gap emitted by the approved SQL function;
  no route is invented here.
- `application.submitted` v1 is an approved same-transaction domain event, but it has no current
  dispatcher route; notification routing remains an expected phased gap and must fail closed.
- `candidate.resume.parsed` and `candidate.projection.rebuilt` are worker outputs, not dispatcher
  input routes.
- `notification.email.requested` remains an unresolved phased route.
- Compensating document-cleanup event remains an approved phased gap: no contract/consumer route
  currently exists; owner, retention threshold and retry/dead-letter policy must be catalogued
  before automation is enabled.
- Existing contracts are not silently mutated; breaking changes require a new version.
- Gate G-1 remains open until the producer envelope is reconciled with the outbox/dispatcher
  envelope before producer implementation is frozen.

## 7. Catalog exit criteria

Phase 6 becomes `API CATALOG FROZEN` only when every required ID has an API/use-case entry with:

```text
API/Requirement ID
HTTP method/path or internal command
Actor/permission
Request DTO/validation
Response DTO
Tables/functions read and written
Transaction boundary
Outbox event/contract/consumer
Idempotency rule
Rate limit
Audit/security event
Error codes
Acceptance tests
```

Until complete: `NO NESTJS IMPLEMENTATION CODE AUTHORIZED`.
