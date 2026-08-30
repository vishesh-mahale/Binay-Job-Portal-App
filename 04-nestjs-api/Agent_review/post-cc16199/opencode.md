# Post-Review Report — commit cc16199

- **Commit**: `cc16199b7a0a89801b79a3dac0663d298ec4b0e5`
- **Title**: test(nestjs-api): harden job application and saved-candidate lifecycle coverage
- **Reviewer**: opencode (independent senior review)
- **Date**: 2026-08-29
- **Scope**: `src/jobs.spec.ts`, `src/applications.spec.ts`, `src/saved-candidates.spec.ts` (+ `JobService`/`ApplicationService`/`SavedCandidateService` behavior and SQL contracts)
- **Mode**: read-only; no source/SQL/test/config modified; no commit; verified against committed code + baseline SQL + running suite.

## Verdict: APPROVED

This commit adds four targeted tests and changes no service, SQL, or configuration. All four new tests assert behavior that matches the **actual** service implementations (verified line-by-line against `jobs.ts`, `applications.ts`, `saved-candidates.ts` and baseline SQL). The targeted suite passes (26/26) and `tsc --noEmit` is clean (exit 0). No invented statuses, actors, or transitions were encoded.

## Git / environment
- `git rev-parse HEAD` = `cc16199b7a0a89801b79a3dac0663d298ec4b0e5` (exact target).
- `git status --short` clean except untracked `Agent_review/` directories (this review's output).
- Diff touches **only** the three spec files (no service/SQL/config change), so service authorization/tenant/transaction/audit behavior is unchanged by construction and is exercised by the real service code invoked in these tests.

## Verification performed
- Ran `jest jobs.spec.ts applications.spec.ts saved-candidates.spec.ts` → **3 suites passed, 26 tests passed**.
- `node ./node_modules/typescript/bin/tsc --noEmit` → **exit 0** (no type errors; the `resume.spec.ts` issue flagged in the prior `c612d80` review has been resolved — `resume.spec.ts:7` now uses `{} as any`).
- Confirmed SQL contracts in baseline migrations:
  - `04_companies.sql:339` — `job_approval_required BOOLEAN NOT NULL DEFAULT false` (configurable, default false).
  - `09_applications.sql:573` — `change_application_status()` function (atomic status/history/outbox).
  - `09_applications.sql:236` — `saved_candidates_owner_candidate_unique` constraint (owner + candidate uniqueness).
  - `09_applications.sql:228` / `17_rls.sql` — `saved_candidates` table + RLS.

## Per-test analysis (maps to task points 1–7)

**A. `applications.spec.ts` — "returns the database result after a valid application status transition"**
- Service: `ApplicationService.changeStatus(companyId, applicationId, userId, dto)` issues 3 queries: (0) access/tenant check, (1) `SELECT public.change_application_status($1,$2::application_status,$3,$4,$5::jsonb)`, (2) final `SELECT ... FROM job_applications WHERE id=$1` returning the row. `applications.ts:123–135`.
- Mock order matches; asserts the returned row has `status: 'under_review'` and that `calls[1][0]` contains `change_application_status`.
- ✅ Point 3 satisfied: verifies DB transition-function usage and the returned state. `under_review` is a genuine `application_status` (in the service's allowed set). No invented status.

**B. `jobs.spec.ts` — "returns pending_approval when company approval is enabled"**
- Service: `JobService.publish` issues 3 queries: (0) actor role check, (1) `UPDATE ... SET status = CASE WHEN COALESCE(cs.job_approval_required, FALSE) THEN 'pending_approval'::job_status ELSE 'published'::job_status END ... FROM public.company_settings cs ... RETURNING ...`, (2) `audit_logs` INSERT. `jobs.ts:123–145`.
- Mock: actor=`employer`, UPDATE returns `{ status: 'pending_approval' }`, audit INSERT no-op. Asserts returned `status: 'pending_approval'` and that the audit INSERT's `userId` param (`calls[2][1][1]`) is `'user-1'`.
- ✅ Point 1 satisfied: the persisted `COALESCE(cs.job_approval_required, FALSE)` in the SQL is exactly the "finalized default=false / configurable approval" contract; the test confirms the `pending_approval` return mapping.

**C. `jobs.spec.ts` — "maps an invalid job transition that updates no row to NOT_FOUND"**
- Service: `JobService.transition('user-1','company-1','job-1','pause')` issues (0) actor check, (1) `UPDATE ... WHERE j.status='published'::job_status ... RETURNING ...`. If 0 rows updated → `throw new NotFoundException('NOT_FOUND')`. `jobs.ts:148–164`.
- Mock: actor=`employer`, UPDATE returns `[]` → NotFoundException. Asserts `rejects.toBeInstanceOf(NotFoundException)`.
- ✅ Point 2 satisfied: asserts the real contract (0-row UPDATE → NOT_FOUND). `'pause'` is a real transition command (`transition` map: published→paused); no invented status. (Naming note: the scenario simulates a no-op UPDATE rather than an invalid *target* status, but the asserted behavior — 0-row → NOT_FOUND — is the genuine service contract.)

**D. `saved-candidates.spec.ts` — "returns a stable no-op result when removing a candidate that is not saved"**
- Service: `SavedCandidateService.remove(companyId, userId, candidateId)` issues (0) `assertRecruiter`, (1) `DELETE FROM public.saved_candidates WHERE company_id = $1 AND recruiter_user_id = $2 AND candidate_id = $3 RETURNING id`; returns `{ removed: Boolean(result.rows[0]) }`. `saved-candidates.ts`.
- Mock: assertRecruiter returns a row, DELETE returns `[]` → `{ removed: false }`. Asserts `resolves.toEqual({ removed: false })` and `calls[1][0]` contains `company_id = $1 AND recruiter_user_id = $2`.
- ✅ Point 4 satisfied: the DELETE is scoped to `company_id` + `recruiter_user_id` (recruiter/company privacy + tenant isolation preserved), and a missing row yields a stable, idempotent `{ removed: false }` (no error).

## Blockers
- **None.**

## Required Fixes
- **None.** Every new test matches the actual service behavior and passes; `tsc` and the targeted suite are green.

## Recommendations (point 9 — missing lifecycle coverage)
1. **Publish default path not asserted.** Test B covers the approval-*enabled* → `pending_approval` mapping (via mock), but no test asserts that with `job_approval_required = false` (the default) `publish` returns `status: 'published'`. The default-false branch lives in SQL (`COALESCE(...FALSE)`) and is not exercisable with a pure mock; consider a test that stubs `company_settings.job_approval_required = false` or asserts the generated SQL contains the `ELSE 'published'` branch.
2. **Application transition validity is mocked away.** Test A verifies return plumbing, but the real transition rules enforced by `change_application_status()` are bypassed by the mock. Consider an integration-style test (or a spy on the DB function) that asserts an actually-invalid transition is rejected.
3. **`submitForApproval` / `approve` / `reject` / `archive` have no new coverage here.** These are the other halves of the approval lifecycle (draft→pending_approval→published/draft). Worth explicit tests to lock the full lifecycle.
4. **Saved-candidate successful removal (`{ removed: true }`) is untested.** Only the idempotent no-op is covered; the positive path (row present → `{ removed: true }`) should be asserted too.

## Informational
- **No invented statuses/actors/transitions (point 5).** Statuses used: `under_review` (application), `pending_approval`/`paused` (job) — all real enum/transition values. Actors are the test-supplied `userId`/`companyId` passed straight into the real service methods; no fake roles/statuses introduced.
- **Authorization/tenant/transaction/audit unchanged (point 6).** The commit adds tests only; the service code (real SQL for role checks, company/recruiter scoping, `transaction(...)`, and `audit_logs` writes) is untouched and is exactly what these tests execute against the mocked `system` client.
- **Mocks reflect real query order & SQL (point 7).** Each test's `mockResolvedValueOnce` sequence matches the actual query sequence in the corresponding service method (verified above for all four tests), including the important detail that the `audit_logs` INSERT in `transition` is only reached when the UPDATE returns a row (so the 2-call mock for the no-row case is correct).
- The prior `c612d80` required-fix on `resume.spec.ts` is now resolved (`{} as any`), so the full `tsc` build is green at this HEAD.

## Point-by-point summary
1. Approval-required path test matches default=false / configurable approval — ✅
2. Invalid job transition test asserts actual 0-row→NOT_FOUND contract — ✅
3. Application status success test verifies `change_application_status` usage + returned state — ✅
4. Saved-candidate removal preserves recruiter/company privacy + idempotent no-op — ✅
5. No invented statuses/actors/transitions — ✅
6. Authorization/tenant/transaction/audit unchanged — ✅
7. Mocks reflect actual query order & SQL — ✅
8. Targeted tests pass (26/26) and build is clean (`tsc` exit 0) — ✅
9. Missing lifecycle coverage identified (recommendations above) — noted, not blocking

## Sign-off
**APPROVED.** The commit is a safe, accurate test-hardening change: all four new tests mirror the real service contracts and the relevant SQL/RLS uniqueness and approval-default constraints, the targeted suite (26 tests) and the type-check build both pass, and no production code, SQL, or configuration was modified.
