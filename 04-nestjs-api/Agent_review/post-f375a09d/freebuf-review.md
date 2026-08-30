# Freebuf Review — Commit f375a09d

## 1. Commit and scope verification

| Check | Evidence | Result |
|-------|----------|--------|
| `git status --short` | Clean (only untracked review folders) | ✅ Clean |
| `git rev-parse HEAD` | `f375a09d2f3e53dac895cdd3521cfdb5dd3107e7` | ✅ Matches expected |
| Commit message | `fix(jobs): make direct publish the default approval policy` | ✅ Accurate |
| `npm run build` | Exit 0, zero errors | ✅ PASS |
| `npm test -- --runInBand` | 30 suites, 144 tests — ALL PASS (89s) | ✅ PASS |

**Diff:** 4 files changed, 14 insertions, 14 deletions — pure documentation + 1 SQL default + 1 NestJS COALESCE swap.

---

## 2. Executive verdict

**APPROVED WITH REQUIRED FIXES**

The commit correctly aligns the SQL default, NestJS publish logic, Decision-07, and tracker to a consistent "direct publish by default" policy. One MEDIUM issue requires a backfill migration decision for existing company rows. One LOW concern about `submitForApproval()` bypassing verification status is pre-existing.

---

## 3. Evidence-based findings

| ID | Severity | Area | Finding | Exact evidence | Required action |
|----|----------|------|---------|----------------|-----------------|
| **F-1** | 🟡 MEDIUM | `04_companies.sql:339` | **Existing company rows retain `DEFAULT true` behavior.** The SQL `DEFAULT` changed from `true` to `false`, but this only affects **new** `company_settings` rows. Existing companies created before this commit still have `job_approval_required = true` in their `company_settings` row. No backfill migration was included in this commit. | `04_companies.sql` diff: `DEFAULT true → DEFAULT false`. No `UPDATE company_settings SET job_approval_required = false` migration present. Previous `sql-contract-sync-review.md:57-61` explicitly flagged: "The migration must change the SQL default to `false` and handle existing company rows." | **NEEDS DECISION:** Either (a) add a forward migration that `UPDATE`s existing `company_settings` rows to `false` (breaking change for existing employers), or (b) add a migration that documents the intentional divergence (existing employers keep approval-required until they explicitly toggle). |
| **F-2** | 🟢 LOW | `jobs.ts:117` | **`submitForApproval()` exists as a parallel path that bypasses `job_approval_required`.** When `job_approval_required = false` (new default), the `publish()` method goes directly to `published`. But `submitForApproval()` always forces `draft → pending_approval` regardless of the setting. This is by design (employer can voluntarily submit for approval), but means an employer can still force the approval workflow even when the company setting says "direct publish." | `jobs.ts:150-158`: `submitForApproval()` unconditionally sets `status = 'pending_approval'`. No `job_approval_required` check. | No fix needed — this is intentional and documented in Decision-07 J3. But the tracker and Decision-07 should explicitly mention that `submitForApproval()` is an opt-in override, not a bug. |
| **F-3** | 🟢 LOW | `DECISION-07:58-59` | **Stale `auto_approve_jobs` reference remains.** The sentence "The archived `auto_approve_jobs` JSON example is documentation only" is still present. While accurate, it references a non-existent column that could confuse implementers. | `DECISION-07:58-59`: "The archived `auto_approve_jobs` JSON example is documentation only; implementation must use the real `company_settings.job_approval_required` column." | Clarify: "The `auto_approve_jobs` key in the `companies.settings` JSONB example (`04_companies.sql:85-89`) is documentation only; implementation uses `company_settings.job_approval_required`." |
| **F-4** | 🟢 LOW | `sql-contract-sync-review.md:59-61` | **Prior review's blocking checklist item resolved but not marked.** `sql-contract-sync-review.md:126-127` has a checkbox: "Confirm Decision-07 supersedes archived approval default and approve `job_approval_required` default/backfill." This commit resolves the default but doesn't mark the checkbox. | `sql-contract-sync-review.md:126-127`: unchecked box | Update the checkbox or add a note that this commit resolves the default change; backfill remains a deployment decision. |

---

## 4. What is correct — 6 verification points

### 4.1 SQL default is `false`

```
04_companies.sql:339
job_approval_required    BOOLEAN NOT NULL DEFAULT false, -- Direct publish by default; owner/admin may enable approval
```

✅ Column type, nullable, and default all correct. Comment accurately describes the new semantics.

### 4.2 NestJS `publish()` correctly uses `COALESCE(..., FALSE)`

```js
// jobs.ts:109-111 (post-commit)
SET status = CASE WHEN COALESCE(cs.job_approval_required, FALSE) THEN 'pending_approval'::job_status ELSE 'published'::job_status END,
    published_at = CASE WHEN COALESCE(cs.job_approval_required, FALSE) THEN NULL ELSE NOW() END,
    published_by = CASE WHEN COALESCE(cs.job_approval_required, FALSE) THEN NULL ELSE $3 END,
```

✅ All 3 CASE expressions now use `FALSE` as COALESCE fallback. When `company_settings` row doesn't exist (shouldn't happen, but defensive), behavior defaults to direct publish — consistent with the new default.

### 4.3 Verification gate unchanged

```js
// jobs.ts:117
AND (COALESCE(cs.job_approval_required, FALSE) OR c.verification_status = 'verified')
```

✅ This WHERE clause means: "publish only if approval NOT required OR company is verified." With the new default (`false`), this simplifies to: "publish requires `verification_status = 'verified'`." The gate is still enforced. No bypass introduced.

### 4.4 Decision-07 J3 is consistent

```text
job_approval_required = false (default)
  draft -> published

approval enabled by company owner/admin
  job_approval_required = true
  draft -> pending_approval -> approve -> published
```

✅ The pseudocode, prose, and executable mapping all say the same thing. `false = direct publish`, `true = approval required`.

### 4.5 Tracker is consistent

```
Approval policy freeze: `company_settings.job_approval_required` ka default `false` (direct publish) rahega;
company owner/admin ... ise `true` karke approval required kar sakta hai.
```

✅ Tracker accurately describes the new default and the toggle direction.

### 4.6 Existing submitted jobs unaffected

The `approve()` method (`jobs.ts:82`) handles `pending_approval → published` regardless of `job_approval_required`. Jobs already in `pending_approval` status before this commit can still be approved. No status or transition logic was changed. The `publish()` method only accepts `status = 'draft'` jobs (`WHERE j.status = 'draft'`).

✅ Already-submitted jobs keep their current workflow.

---

## 5. Correctly implemented items

| Item | Evidence |
|------|----------|
| SQL default changed from `true` to `false` | `04_companies.sql:339` — diff verified |
| NestJS COALESCE fallback changed from `TRUE` to `FALSE` in all 4 places in `publish()` | `jobs.ts:109,110,111,117` — diff verified |
| Decision-07 J3 updated to "direct publish by default" | `DECISION-07:39-59` — diff verified |
| Tracker updated to reflect new default | `IMPLEMENTATION-TRACKER-HINGLISH.md:86` — diff verified |
| No unauthorized route changes | All 10 `JobController` endpoints unchanged |
| No unauthorized schema changes | Only `DEFAULT` value changed; no new columns, tables, constraints |
| No new test regressions | 144/144 tests pass |
| No new files or dependencies | 4 files modified, 0 added |

---

## 6. Security and tenant-isolation assessment

| Check | Result | Evidence |
|-------|--------|----------|
| Cross-company isolation | ✅ Unchanged | `WHERE j.company_id = $2` in all queries |
| Owner/admin authorization | ✅ Unchanged | Same 3-path check: created_by OR owner_id OR company_members |
| Verification gate | ✅ Unchanged | `c.verification_status = 'verified'` still required for direct publish |
| Audit trail | ✅ Unchanged | All mutations write to `audit_logs` with correct action strings |
| No secrets/tokens exposed | ✅ No change | Response fields unchanged |
| No bypass introduced | ✅ | `submitForApproval()` is an independent path, not a bypass |

---

## 7. What should NOT be changed

| Item | Reason |
|------|--------|
| `approve()` method | Correctly requires `verification_status = 'verified'` and `status = 'pending_approval'` — no relation to `job_approval_required` |
| `submitForApproval()` method | Independent opt-in path; employer can voluntarily submit for review even when direct publish is enabled |
| `reject()` method | Correctly handles `pending_approval → draft` transition |
| `transition()` methods | Pause/resume/close don't interact with approval setting |
| All other controller routes | No approval-related logic |

---

## 8. Required fixes before next phase

| Priority | Finding | Fix |
|----------|---------|-----|
| 🟡 MEDIUM | F-1: No backfill migration for existing company rows | **Decision required:** Add a migration `UPDATE company_settings SET job_approval_required = false WHERE ...` OR document that existing companies retain `true` until manually toggled. Previous `sql-contract-sync-review.md` explicitly flagged this as blocking. |
| 🟢 LOW | F-3: Stale `auto_approve_jobs` reference in Decision-07 | Clarify the reference to point to the JSONB example in `companies.settings` |
| 🟢 LOW | F-4: Prior review checkbox unresolved | Mark or note the resolution |

---

## 9. Prior review consistency check

The previous full review (`post-381701c/freebuf-review.md:152`) stated:

> "Job publish: approval_required branching | ✅ | `jobs.ts:56`: `COALESCE(cs.job_approval_required, TRUE)`"

This was correct **at that commit** (`381701c`). The current commit (`f375a09d`) changes the COALESCE fallback from `TRUE` to `FALSE`. The old review's finding is **no longer accurate for the current code** but was correct for its review target.

The adversarial review (`sql-contract-sync-review.md:59-61`) correctly identified the discrepancy:

> "`company_settings.job_approval_required BOOLEAN NOT NULL DEFAULT true` is the executable schema default, while Decision-07 freezes direct publish by default"

This commit **resolves that discrepancy** — the SQL default now matches Decision-07. The backfill question remains.

---

## 10. Final recommendation

**APPROVED WITH REQUIRED FIXES**

This is a clean, focused, correct commit. The 4-file, 14-line change aligns SQL, NestJS code, Decision-07, and tracker to a single consistent policy: **direct publish by default**.

**What's solid:**
- SQL default, NestJS COALESCE, Decision-07, and tracker all say the same thing
- Verification gate (`verification_status = 'verified'`) still enforced
- Existing submitted jobs unaffected
- Zero unauthorized changes — no new routes, columns, tables, constraints, or permissions
- 144/144 tests pass, build clean

**One MEDIUM gap requires a decision:**
The backfill migration for existing `company_settings` rows is not addressed. Previous reviews flagged this as blocking. The commit author should either add the migration or document the intentional divergence in the tracker.

**Coding impact:** None — this is a documentation/policy commit. Implementation code works correctly with both `true` and `false` defaults. The COALESCE defensive fallback is now consistent with the new default.
