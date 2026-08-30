# freebuf Review — Commit cc16199

## 1. Commit and scope verified

```
HEAD:   cc16199b7a0a89801b79a3dac0663d298ec4b0e5
Subject: test(nestjs-api): harden job application and saved-candidate lifecycle coverage
Files:   applications.spec.ts (+11), jobs.spec.ts (+18), saved-candidates.spec.ts (+7)
         3 files, 36 insertions, 0 deletions — pure test additions
```

## 2. Executive verdict

**APPROVED**

All 4 new tests are meaningful, correctly mock the real service flow, and pass.

## 3. Evidence-based findings

| ID | Severity | File/Line | Finding | Evidence | Required action |
|----|----------|-----------|---------|----------|-----------------|
| F-1 | NO ISSUE | jobs.spec.ts:73-82 | **Approval-enabled publish path** — Verifies `publish()` returns `pending_approval` when company setting is true. Mock: role=employer → UPDATE returns `status: 'pending_approval'` → audit INSERT. Test asserts status + user_id passed to audit. | `publish()` at jobs.ts:123-145 — SQL uses `COALESCE(cs.job_approval_required, FALSE)` to branch; mock rows[1] returns `pending_approval`; audit INSERT at rows[2] receives `[jobId, companyId, 'user-1']` via `client.query.mock.calls[2][1][1]`. ✅ | None |
| F-2 | NO ISSUE | jobs.spec.ts:84-90 | **Invalid transition → NOT_FOUND** — Verifies `transition('pause')` throws `NotFoundException` when UPDATE returns no rows. Mock: role=employer → UPDATE returns empty rows. | `transition()` at jobs.ts:148-157 — `if (!result.rows[0]) throw new NotFoundException('NOT_FOUND')` at line 153. Mock provides exactly 2 queries: actor check (pass) + UPDATE (0 rows). Audit INSERT never reached. ✅ | None |
| F-3 | NO ISSUE | applications.spec.ts:58-66 | **Valid status transition result** — Verifies `changeStatus('under_review')` returns the updated row and uses `change_application_status` SQL function. Mock: access check passes → function call succeeds → SELECT returns `status: 'under_review'`. | `changeStatus()` at applications.ts:123-138 — call[0] is access check, call[1] is `SELECT public.change_application_status(...)`, call[2] is SELECT returning the row. Test asserts `.resolves.toMatchObject({ status: 'under_review' })` and `calls[1][0].toContain('change_application_status')`. ✅ | None |
| F-4 | NO ISSUE | saved-candidates.spec.ts:26-31 | **Remove non-saved candidate → no-op** — Verifies `remove()` returns `{ removed: false }` when DELETE returns 0 rows, and WHERE clause includes tenant scope. Mock: assertRecruiter passes → DELETE returns empty rows. | `remove()` at saved-candidates.ts:61-66 — `DELETE ... WHERE company_id = $1 AND recruiter_user_id = $2 AND candidate_id = $3 RETURNING id` → `{ removed: Boolean(result.rows[0]) }`. Test asserts `toEqual({ removed: false })` and WHERE contains `company_id = $1 AND recruiter_user_id = $2`. ✅ | None |

## 4. Correctly implemented items

| Item | Evidence |
|------|----------|
| All 4 tests mock the actual 2-3 query flow of each service method | Mock chain matches real `client.query()` call sequence |
| No invented status, transition, actor or business rule | All statuses (`pending_approval`, `under_review`, `paused`) and actors (`employer`) exist in SQL enums and service code |
| Tenant isolation verified in saved-candidate remove | WHERE clause asserts `company_id = $1 AND recruiter_user_id = $2` |
| Application function call verified | Test asserts `change_application_status` SQL function is used, not manual UPDATE |
| Audit path implicitly verified | Approval test checks `client.query.mock.calls[2][1][1]` = userId in audit INSERT |
| No regression to existing 22 tests | All 26 tests pass (3 suites) |
| Build clean | `npx tsc --noEmit` — zero errors |

## 5. Correctly implemented validation (existing)

| Area | What's covered |
|------|---------------|
| Job lifecycle | 10 existing tests: approve, reject, submit-for-approval, pause, resume, archive, publish, updateDraft, createDraft, malformed slug, expired batch |
| Application lifecycle | 6 existing tests: consent check, expired job, atomic submit, rejected status, DB error mapping, guest list |
| Saved-candidate lifecycle | 3 existing tests: malformed ID, upsert conflict, list scope |
| **New in this commit** | 4 tests: approval-enabled publish, invalid transition → NOT_FOUND, valid transition result, remove non-saved → no-op |

## 6. Security and tenant-isolation assessment

| Check | Status |
|-------|--------|
| Cross-company data leakage in new tests | ✅ No — all mocked queries are scoped by `companyId` and `userId` parameters |
| Authorization not weakened | ✅ — no auth logic changed, only test coverage added |
| SQL injection via mock parameters | ✅ No risk — mocks use hardcoded UUIDs |
| Transaction boundaries preserved | ✅ — all tests mock `system.transaction()` wrapper correctly |

## 7. Missing tests or coverage gaps

| Priority | Gap | Description |
|----------|-----|-------------|
| LOW | No invalid transition → ForbiddenException test | Could verify that a non-employer/non-admin role throws `FORBIDDEN` before reaching the UPDATE |
| LOW | No application replay idempotency test | The existing `submit()` test covers happy-path replay; a test for the `23505` unique-violation path (returning `{ replayed: true }`) would strengthen coverage |
| LOW | No saved-candidate remove → success test | Only the no-op (not saved) path is tested; a test verifying `{ removed: true }` when DELETE returns a row would complete the remove lifecycle |
| LOW | No concurrency/overlap test for job transitions | `publish()` → `pause()` → `resume()` sequence under concurrent access is not unit-testable at this level but is covered by integration smoke tests |

## 8. Tracker/documentation accuracy

No tracker file was modified in this commit. The IMPLEMENTATION-TRACKER-HINGLISH.md test-coverage section should be updated to reflect the 4 new lifecycle tests.

## 9. Final recommendation

**APPROVED** — All 4 tests are well-designed, correctly match the real service behavior, pass, and add meaningful coverage for previously untested paths (approval-enabled publish, failed transition, valid transition result, remove no-op). Zero regressions. The 4 remaining gaps are LOW priority and can be addressed in a follow-up test-hardening commit.
