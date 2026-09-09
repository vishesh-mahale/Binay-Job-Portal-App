# Batch 6 — Candidate Page: Independent Read-Only Architecture Review

**Reviewer:** Buffy (Codebuff)
**Date:** September 8, 2026
**Scope:** Batch6_Candidate-page.md implementation plan — read-only audit

---

## 1. Verdict

**APPROVED WITH CHANGES**

The plan is architecturally sound. All five phases (C1-C5) map to real, existing NestJS endpoints and DB contracts. No new database migrations, new API routes, or schema redesigns are required for core functionality. However, there are three P1 issues and several P2 gaps that should be addressed before or during implementation to prevent rework.

---

## 2. What Is Correct

| Plan Item | Evidence |
|---|---|
| Profile endpoint (GET/PATCH /api/v1/candidates/me) | candidate.ts CandidateController with AuthGuard |
| Optimistic revision guard (expected_profile_revision) | STALE_REVISION ConflictException on mismatch |
| Archive/remove facts (DELETE /api/v1/candidates/me/facts/:factType/:factId) | archiveFact() with revision guard |
| Resume upload (POST /api/v1/resumes/upload) | FileInterceptor, storage validation, checksum reuse, outbox |
| Resume status (GET /api/v1/resumes/:id/status) | Maps DB status to exact 9 plan stage names |
| Parsed data (GET /api/v1/resumes/:id/parsed-data) | Allowlist filter on normalized_output |
| Confirm (POST /api/v1/resumes/:id/confirm) | Scan checks, revision guard, idempotent already_confirmed |
| Apply (POST /api/v1/jobs/:jobId/apply) | Consent, clean-doc check, unique constraint replay |
| Application list/detail/history | Ownership enforced via user_id SQL WHERE |
| RoleGuard(['candidate']) | role-guard.tsx checks allowedRoles |
| No DB migrations needed | All tables already exist |
| Storage path not exposed | getParsedData() allowlists fields only |

---

## 3. Critical Issues

### P1-1: No apiClient methods for candidate/resume/application endpoints

**File:** api-client.ts
**Problem:** ApiClient has zero methods for any candidate, resume, or application endpoint. All 11 needed methods are missing.
**Fix:** Add typed methods before C1. Multipart upload needs separate method.

### P1-2: No TypeScript types for candidate profile, resume, or application

**File:** src/types/ (only auth.ts, jobs.ts, api.ts, company-invitation.ts)
**Problem:** No interfaces for CandidateProfile, ResumeStatusResponse, ParsedDataResponse, ApplicationListItem, ApplicationDetail, ApplicationHistory.
**Fix:** Create src/types/candidate.ts and src/types/applications.ts before C1.

### P1-3: No multipart upload in apiClient.request()

**File:** api-client.ts line ~30
**Problem:** request() hardcodes Content-Type: application/json. Resume upload needs multipart/form-data.
**Fix:** Add uploadMultipart(path, formData, options) method.

---

## 4. Missing Items

### 4.1 Missing UI States
- Resume upload progress indicator (C3)
- Parsed data review form with editable fields (C3)
- Profile facts sections for links/skills/experiences (C2)
- Application status color coding (C5)
- Resume active/inactive indicator (C3)

### 4.2 Missing API Client Methods (11 total)
- getCandidateProfile()
- updateCandidateProfile(dto)
- archiveCandidateFact(factType, factId, revision)
- uploadResume(file, useAsActive) — Multipart
- getResumeStatus(documentId)
- getParsedData(documentId)
- confirmResume(documentId, dto)
- applyToJob(jobId, dto)
- getMyApplications()
- getApplicationDetail(id)
- getApplicationHistory(id)

### 4.3 Security Checks — All Verified OK
- Server-enforced user_id ownership on all endpoints
- No storage path leakage (allowlisted fields only)
- No direct Supabase from browser
- RoleGuard prevents wrong-role access
- Auto-refresh on 401

### 4.4 Missing Retry/Error Handling
- Resume upload mid-stream failure (not addressed)
- Poll timeout when status never resolves (not addressed)
- Application submit failure after consent (no explicit recovery)

### 4.5 Missing Test Cases
- api-client multipart upload test (P1)
- Profile render + loading state test (P1)
- Profile save + stale revision test (P1)
- Resume status polling + stage mapping test (P1)
- Confirm resume with facts test (P1)
- Apply with clean resume + consent test (P1)
- Apply replay detection test (P1)

### 4.6 Missing E2E Gates
- Large file upload (10MB+) progress
- Apply to closed job from bookmark
- Multi-tab concurrent profile edit
- Application from mobile viewport

---

## 5. Scope Decision

| Item | Classification |
|---|---|
| Guest upload/apply/claim UI | Later batch |
| Recruiter application management UI | Later batch |
| AI candidate matching | Must not be added |
| Notifications | Must not be added |
| Candidate embeddings | Must not be added |
| Database schema changes | Must not be added |
| apiClient methods | Must in Batch 6 |
| TypeScript types | Must in Batch 6 |
| Multipart upload support | Must in Batch 6 |
| ?apply= query param handling | Must in Batch 6 |
| Profile completeness indicator | Should in Batch 6 |
| Active resume identification | Must in Batch 6 |

---

## 6. Final Recommended Execution Order

### Phase 0: Prerequisites (NEW)
1. Create src/types/candidate.ts and src/types/applications.ts
2. Add uploadMultipart() to api-client.ts
3. Add all 11 candidate/resume/application methods to api-client.ts

### Phase C1: Dashboard Foundation
Replace placeholder with shell + tabs, load profile, loading/empty/unauthorized/retry states

### Phase C2: Profile Editor
Render fields, save with revision, STALE_REVISION handling, archive facts, feedback

### Phase C3: Resume Center
Multipart upload with progress, 9-stage polling, parsed review form, confirm, error states

### Phase C4: Apply Flow
Handle ?apply=jobId, load resumes/profile/screening, submit with consent, replay handling

### Phase C5: Application Tracking
List, detail, timeline, safe fields only, accessible labels, mobile-friendly

### Verification
All automated tests + 8 manual E2E gates + additional gates

---

*Read-only review. No files were modified.*
