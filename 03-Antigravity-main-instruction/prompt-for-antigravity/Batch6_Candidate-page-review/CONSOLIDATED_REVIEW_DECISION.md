# Batch 6 Candidate Page — Consolidated Review Decision

**Date:** 2026-09-09  
**Decision:** **APPROVED WITH CHANGES — FULL PLAN IMPLEMENTATION IS BLOCKED UNTIL CONTRACT GATES PASS**

## 1. Final Decision

Candidate page ka direction sahi hai, lekin original plan ko seedha C1 se C5 tak implement nahi karna chahiye. Profile page ka frontend abhi placeholder hai aur API client me candidate/resume/application methods/types missing hain. Iske alawa resume collection, parsed-output compatibility aur application snapshot/eligibility ke kuch backend contracts pehle reconcile karne zaroori hain.

Isliye plan ko do implementation tracks me split kiya jayega:

1. **Batch 6A:** Contract/API correctness + candidate dashboard/profile/resume center.
2. **Batch 6B:** Apply flow + application tracking, only after 6A and application contract gates pass.

Guest upload/apply/claim, recruiter application UI, notifications, AI matching UI aur candidate embeddings is batch me nahi aayenge.

## 2. Review Reports Reconciliation

### Correct findings

- Candidate, resume aur application APIs ke liye frontend `apiClient` methods/types missing hain.
- `FormData` upload ke liye current JSON `Content-Type` default unsafe hai; browser ko multipart boundary set karni hogi.
- Resume list/current-version endpoint missing hai; individual document status endpoint se active/history list nahi ban sakti.
- Resume polling me cancellation, timeout aur backoff define karna hoga.
- Parsed output ko NestJS review/confirmation contract ke exact canonical shape me verify karna hoga.
- `projects` aur `awards` ko silently discard nahi karna chahiye; either support karo ya Batch 6 scope me explicitly exclude/document karo.
- Facts-only resume confirmation behavior explicitly test karna hoga.
- Application document eligibility, canonical snapshot fields aur screening-answer validation verify/fix karni hogi.
- Immutable submitted snapshot ko later profile edits se independent prove karna hoga.

### Incorrect/stale finding

Ek review ne claim kiya ki `applications.ts` file/routes exist nahi karte. Yeh repository ke current state se incorrect hai. Existing file:

`04-nestjs-api/04-nestjs-api-app/src/modules/applications/applications.ts`

me ye routes aur tests present hain:

- `POST /api/v1/jobs/:jobId/apply`
- `GET /api/v1/me/applications`
- `GET /api/v1/me/applications/:applicationId`
- `GET /api/v1/me/applications/:applicationId/history`

Isliye C4/C5 ko “API completely absent” kehkar reject nahi kiya jayega. Lekin un routes ke payload/eligibility/snapshot behavior me valid correctness gaps hain, jinhe implementation se pehle address karna hoga.

## 3. Existing API Surface Confirmed

### Candidate/profile

- `GET /api/v1/candidates/me`
- `PATCH /api/v1/candidates/me`
- `DELETE /api/v1/candidates/me/facts/:factType/:factId`

### Resume

- `POST /api/v1/resumes/upload`
- `GET /api/v1/resumes/:id/status`
- `GET /api/v1/resumes/:id/parsed-data`
- `POST /api/v1/resumes/:id/confirm`

### Applications

- `POST /api/v1/jobs/:jobId/apply`
- `GET /api/v1/me/applications`
- `GET /api/v1/me/applications/:applicationId`
- `GET /api/v1/me/applications/:applicationId/history`

### Security boundary

Existing routes use authenticated user identity and ownership predicates. Browser ko direct Supabase privileged access, storage bucket/path ya raw parser output nahi dena hai.

## 4. P0 Contract Gates Before UI

### Gate A — Typed client contract

Add typed interfaces and methods for:

- Candidate profile and profile update response
- Candidate fact collections
- Resume list/status/parsed-data/confirmation
- Application submit/list/detail/history
- Stable error codes

`apiClient` me multipart-safe request path add karo. `FormData` ke case me `Content-Type: application/json` manually set nahi hona chahiye. Existing credentials, timeout, request IDs, trace IDs aur 401 refresh behavior preserve rahe.

### Gate B — Resume collection

Authenticated candidate ke liye safe resume collection response add karo, ya `GET /api/v1/candidates/me` ko deliberately expand karo. Response me minimum:

- `document_id`
- `document_role`
- `version_number`
- `is_current`
- `uploaded_at` / `updated_at`
- `security_scan_status`
- `processing_status`
- derived UI stage

Storage bucket/path aur internal parser details response me nahi aayenge.

### Gate C — Resume processing compatibility

Worker aur NestJS ke beech verify/fix karo:

- uploaded → scanning → queued → processing → partial/completed/failed transitions
- DB enum values aur browser stage mapping
- canonical `normalized_output` fields: `professional_title`, `summary`, `skills`, `experiences`, `educations`, `certifications`, `languages`, plus agreed `projects`/`awards`
- partial result behavior
- parser failure/retry semantics

`ResumeParsingService.parse_resume()` inline task-handler orchestration ko describe karta hai; is method ka `NotImplementedError` alone proof nahi hai ki poora worker pipeline unavailable hai. Actual task-handler path ko tests/live fixtures se verify karna hoga.

### Gate D — Application correctness

Existing application routes ko implementation se pehle validate/fix karo:

- document must be owned by candidate
- `document_type = 'resume'`
- document active/current candidate resume linkage ke rules clear hon
- exact clean + parse-ready eligibility define ho
- rejected documents ke liye stable `DOCUMENT_NOT_ELIGIBLE` error
- screening answers selected job ke questions se validate hon: unknown IDs, required questions aur answer shape
- snapshot canonical profile columns se bane; old/non-canonical names use na hon
- candidate application detail me safe immutable snapshot summary ho, current profile replacement nahi
- duplicate application replay existing application return kare

## 5. Batch 6A Scope — Implement First

### A1. Dashboard foundation

- `/dashboard/candidate` shell, tabs/sections, loading, empty, retry, unauthorized states
- `RoleGuard(['candidate'])` preserve
- `?apply=<jobId>` query context preserve
- responsive/mobile layout

### A2. Profile editor

Fields include:

- professional title, summary
- current location, city/state/country/postal code
- preferred work mode
- willing to relocate/travel
- remote experience as boolean control
- notice period
- expected salary and currency
- work authorization, visa sponsorship
- open to work, available from

Use `expected_profile_revision`; `STALE_REVISION` par silent overwrite nahi. `salary_currency` ko current DTO/API contract me deliberately add karo ya explicitly out of scope document karo; silently omit mat karo.

### A3. Resume center

- Resume collection/current-vs-history list
- Multipart upload with indeterminate progress unless real upload-progress transport is added
- Status polling with cancellation and timeout
- Recommended polling: 2s initial interval, exponential backoff up to 10s, max 5 minutes
- All scan/parse states and safe retry/help messaging
- Parsed review form with editable canonical fields
- Profile + facts confirmation with stale revision handling
- Already-confirmed/idempotent result handling

## 6. Batch 6B Scope — After 6A Gates

### B1. Apply flow

- Public job detail se `/dashboard/candidate?apply=<jobId>`
- Eligible clean resume selection
- Cover letter, validated screening answers, explicit consent
- Submit application
- Closed/expired job, missing profile, invalid resume, validation and consent errors
- Duplicate replay ko existing application success state me render karna

### B2. Application tracking

- Own application list
- Detail page
- Status history timeline
- Safe immutable snapshot summary
- Empty/error/not-found/mobile states

## 7. Explicitly Deferred / Excluded

| Item | Decision |
|---|---|
| Guest upload/apply/claim UI | Later batch |
| Recruiter application management UI | Later batch |
| AI candidate matching/ranking UI | Not in Batch 6 |
| Candidate embeddings UI | Not in Batch 6 |
| Notifications | Later batch |
| New DB redesign | Not required unless a verified contract gap proves otherwise |
| Direct browser Supabase access | Never |

## 8. Required Tests

### Backend/worker

- Resume list ownership and safe projection
- Multipart upload validation and checksum reuse
- Every document status transition
- Canonical parsed-output shape, partial output and parser failure
- Facts-only confirmation
- Stale profile/resume confirmation
- Application clean-resume eligibility
- Non-resume, historical/unlinked, unparsed and non-clean rejection
- Screening unknown/missing-required/valid answers
- Canonical immutable snapshot values
- Duplicate application replay
- Cross-user document, parsed-data and application denial

### Frontend/API client

- Multipart header behavior and `FormData`
- Candidate profile load/save/stale conflict
- Resume list/upload/poll cleanup/timeout/status branches
- Parsed review and confirmation
- Apply query context, consent, screening validation, replay
- Application list/detail/history
- 401 refresh, timeout and stable error mapping

### Manual E2E release gates

1. Candidate login → dashboard without redirect loop.
2. Profile edit persists and stale concurrent edit is safely rejected.
3. Resume upload → scan → parse → review → confirm updates canonical profile/facts.
4. Infected, failed, partial and timeout states show correct safe UI.
5. Multiple resumes: active/current and historical versions are correct.
6. Public job detail → Apply Now → candidate page with selected job.
7. Valid application succeeds and appears in candidate tracking.
8. Replay does not create a duplicate.
9. Later profile edits do not mutate submitted snapshot.
10. A second candidate cannot access another candidate's documents/applications.

## 9. Final Execution Order

```text
Contract reconciliation
  → typed API client + types
  → resume collection/status/output backend gates
  → C1 dashboard
  → C2 profile editor
  → C3 resume center
  → application eligibility/snapshot/screening gates
  → C4 apply flow
  → C5 application tracking
  → full automated + manual verification
```

No git commit or push should be created unless the user explicitly asks.
