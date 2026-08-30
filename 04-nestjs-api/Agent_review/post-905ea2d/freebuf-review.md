# Freebuf Review — Commit 905ea2d

## 1. Commit verification

| Check | Evidence | Result |
|-------|----------|--------|
| `git status --short` | Clean (only untracked review folders) | ✅ Clean |
| `git rev-parse HEAD` | `905ea2d9b577ffb2ba1eadf5bccbf29939a8f413` | ✅ Matches expected |
| Commit message | `test(jobs): pin approval default and track settings rollout gates` | ✅ Accurate |
| `npm run build` | Exit 0, zero errors | ✅ PASS |
| `npm test -- --runInBand --testPathPattern='jobs.spec'` | 1 suite, 13 tests — ALL PASS (37.8s) | ✅ PASS |

**Diff:** 3 files changed, 9 insertions, 0 deletions — test assertions + documentation only. Zero production code changes.

---

## 2. Executive verdict

**APPROVED**

This is a documentation/test-only commit that closes the gap identified in the previous review (`post-f375a09d`). It adds two explicit rollout gates to the tracker, documents the backfill requirement in Decision-07, and pins the `COALESCE(..., FALSE)` behavior in tests. No production code, SQL schema, or routes were changed.

---

## 3. Evidence-based findings

| ID | Severity | Area | Finding | Exact evidence | Required action |
|----|----------|------|---------|----------------|-----------------|
| **F-1** | ✅ NO ISSUE | `jobs.spec.ts:69` | **COALESCE fallback pinned to `FALSE`.** New assertion `toContain('COALESCE(cs.job_approval_required, FALSE)')` directly verifies that the SQL uses `FALSE` as the COALESCE default — preventing silent regression to the old `TRUE` behavior. | `jobs.spec.ts:69`: `expect(client.query.mock.calls[1][0]).toContain('COALESCE(cs.job_approval_required, FALSE)');` | None — correctly implemented |
| **F-2** | ✅ NO ISSUE | `jobs.spec.ts:70` | **Approval path SQL pinned.** New assertion `toContain("'pending_approval'::job_status")` verifies the `CASE WHEN` includes the approval path — confirming the full branching logic is present in the generated SQL, not just the direct-publish path. | `jobs.spec.ts:70`: `expect(client.query.mock.calls[1][0]).toContain("'pending_approval'::job_status");` | None — correctly implemented |
| **F-3** | ✅ NO ISSUE | `DECISION-07:58-61` | **Backfill gap explicitly documented.** New paragraph states: "changing the baseline default does not rewrite existing `company_settings` rows; production rollout requires an explicit reviewed forward migration/backfill decision." This resolves the MEDIUM finding from the previous review. | `DECISION-07:58-61` — new paragraph | None — correctly documented |
| **F-4** | ✅ NO ISSUE | `DECISION-07:58-59` | **Mutation endpoint gate documented.** New sentence: "The setting mutation endpoint and DTO remain a separate Company API contract gate; no route is invented here until that API catalog entry is approved." This prevents premature route invention. | `DECISION-07:58-59` — new sentence | None — correctly documented |
| **F-5** | ✅ NO ISSUE | `IMPLEMENTATION-TRACKER:87` | **Mutation API gate tracked.** New checkbox: "Approval-setting mutation API implement/freeze karna: owner/admin ke liye authorized company-scoped settings update path; exact route/DTO abhi API catalog me TBD hai, isliye route invent nahi karna." | `IMPLEMENTATION-TRACKER:87` — new item | None — correctly tracked |
| **F-6** | ✅ NO ISSUE | `IMPLEMENTATION-TRACKER:88` | **Backfill/migration gate tracked.** New checkbox: "Production rollout ke liye forward migration/backfill policy decide karna; baseline default change pre-prod rebuild ke liye hai, existing deployed company rows automatically change nahi hongi." | `IMPLEMENTATION-TRACKER:88` — new item | None — correctly tracked |

---

## 4. Correctly implemented items

### 4.1 Test assertions pin the correct SQL behavior

The publish test (`jobs.spec.ts:62-70`) now asserts 3 things about the generated SQL:

| Assertion | Line | Verifies |
|-----------|------|----------|
| `toContain('job_approval_required')` | 68 | Column is referenced in the query |
| `toContain('COALESCE(cs.job_approval_required, FALSE)')` | 69 | Fallback is `FALSE` (direct publish default) |
| `toContain("'pending_approval'::job_status")` | 70 | Approval path exists in the CASE expression |

Together these 3 assertions prevent:
- Silent reversion to `COALESCE(..., TRUE)` (would fail assertion 69)
- Removal of the approval path (would fail assertion 70)
- Complete removal of the approval setting check (would fail assertion 68)

### 4.2 Decision-07 J3 is now complete

The J3 section now contains:
1. ✅ Pseudocode showing `false = direct publish`, `true = approval required`
2. ✅ Executable mapping prose
3. ✅ "Already submitted jobs keep their current workflow" statement
4. ✅ **NEW:** Mutation endpoint gate — no route invented until API catalog approved
5. ✅ **NEW:** Backfill gap — existing rows unaffected; explicit migration needed
6. ✅ `auto_approve_jobs` documentation-only note

### 4.3 Tracker accurately reflects remaining work

| Item | Status | Accuracy |
|------|--------|----------|
| Approval policy freeze (default `false`) | ✅ `[x]` | Correct — frozen in previous commit |
| Approval-setting mutation API | `[ ]` | Correct — route/DTO TBD in API catalog |
| Production migration/backfill | `[ ]` | Correct — requires explicit decision |

### 4.4 Zero production code changes

No changes to:
- `jobs.ts` — SQL logic unchanged
- `04_companies.sql` — schema unchanged
- `app.module.ts` — wiring unchanged
- Any controller or service — behavior unchanged

---

## 5. Remaining rollout/API gaps

| Gap | Tracked? | Status |
|-----|----------|--------|
| Approval-setting mutation API (route + DTO) | ✅ Tracker line 87 | Pending — correctly marked TBD |
| Forward migration/backfill for existing company rows | ✅ Tracker line 88 | Pending — correctly marked |
| Existing companies retain `job_approval_required = true` | ✅ Decision-07:60-61 | Documented — no silent change |
| `submitForApproval()` as opt-in override | ✅ Decision-07 J3 | Documented — intentional behavior |

---

## 6. Test results

```
PASS src/jobs.spec.ts
  ✓ approves a verified pending job (2 ms)
  ✓ requires a rejection reason (1 ms)
  ✓ submits a draft for approval with an atomic audit record (1 ms)
  ✓ applies named pause transition with an audit record (1 ms)
  ✓ uses the paused source state for resume transitions (1 ms)
  ✓ restricts archive transitions to closed or expired jobs (1 ms)
  ✓ publishes directly or moves to approval based on company setting (64 ms)  ← NEW ASSERTIONS HERE
  ✓ updates only draft fields and writes an audit record atomically (4 ms)
  ✓ creates a draft job in one transaction and audits it (8 ms)
  ✓ rejects malformed slugs before opening a transaction (3 ms)
  ✓ returns only a company-scoped visible job projection (2 ms)
  ✓ maps an inaccessible or missing job to NOT_FOUND (1 ms)
  ✓ drains 101+ due expired jobs across continuous batches (10 ms)

Test Suites: 1 passed, 1 total
Tests:       13 passed, 13 total
```

The key test (`publishes directly or moves to approval based on company setting`) now has 3 assertions instead of 2, pinning the exact COALESCE fallback and approval path.

---

## 7. Final recommendation

**APPROVED**

This commit is a clean, focused documentation/test hardening that resolves all MEDIUM findings from the previous review (`post-f375a09d`):

| Previous Finding | Status |
|------------------|--------|
| F-1 (MEDIUM): No backfill migration tracked | ✅ **RESOLVED** — Tracker line 88 + Decision-07:60-61 |
| F-3 (LOW): Stale `auto_approve_jobs` reference | ⚠️ Still present (Decision-07:63) — pre-existing, not introduced by this commit |
| F-4 (LOW): Prior review checkbox unresolved | ✅ **RESOLVED** — Tracker line 88 directly tracks this |

**What's solid:**
- Test assertions now prevent silent regression of the COALESCE fallback
- Decision-07 J3 is now the single authoritative source for approval policy
- Tracker accurately separates frozen decisions from pending rollout gates
- Zero production code changes — purely documentation + test hardening
- 13/13 tests pass, build clean

**No remaining blockers for current scope.** The two new tracker items (mutation API + backfill) are correctly marked as pending and documented as separate gates. They block production rollout but do not block the current NestJS API development phase.
