# opencode Review — Commit 905ea2d

## 1. Commit verification

- `git status --short`: only untracked `04-nestjs-api/Agent_review/post-*/` directories (prior review outputs); **no tracked file modified**. Working tree is otherwise clean.
- `git rev-parse HEAD`: `905ea2d9b577ffb2ba1eadf5bccbf29939a8f413` — this commit **is HEAD**.
- `git show --stat`: 3 files changed, +9/−0:
  - `04-nestjs-api/project-docs/implementation-records/IMPLEMENTATION-TRACKER-HINGLISH.md` (+2)
  - `04-nestjs-api/04-nestjs-api-app/jobs-search-review/DECISION-07-JOBS-SEARCH-FINAL.md` (+5)
  - `04-nestjs-api/04-nestjs-api-app/src/jobs.spec.ts` (+2)
- This commit does **not** touch `04_companies.sql` or `src/jobs.ts`; those were set in parent `f375a09d` and were **re-verified directly from current files** (not trusted from prior review) for points 1–2.

## 2. Executive verdict

**APPROVED**

No blockers, no required fixes. The commit pins the approval-default behavior in tests and explicitly records the two rollout gates (settings mutation API, production migration) as pending — without inventing any route or behavior.

## 3. Evidence-based findings

| ID | Severity | Area | Finding | Exact evidence | Required action |
|---|---|---|---|---|---|
| F1 | Recommendation | Test coverage | The new assertions pin the **SQL text** (`COALESCE(cs.job_approval_required, FALSE)` and `'pending_approval'::job_status`) but do **not** exercise the actual `false→published` vs `true→pending_approval` branch outcome. The mock unconditionally returns `status:'published'`, so only the query string is verified, not the CASE mapping. | `jobs.spec.ts:62-71` — `mockResolvedValueOnce({ rows: [{ id:'job-1', status:'published' }] })`; asserts `toContain('COALESCE(cs.job_approval_required, FALSE)')` and `toContain("'pending_approval'::job_status")` only | Add a second case that drives the `true` branch (e.g., a company setting `true` returning `pending_approval`) to lock the behavior, not just the literal text. |
| F2 | Informational | SQL comment accuracy | `04_companies.sql:339` comment states "owner/admin may enable approval". This is **intended policy**, but the mutation mechanism is not yet implemented and is now explicitly tracked as pending. Not a contradiction — consistent with DECISION-07's separate-gate stance. | `04_companies.sql:339`; `IMPLEMENTATION-TRACKER-HINGLISH.md:87` (`Approval-setting mutation API implement/freeze karna … route invent nahi karna`) | None. Keep comment; ensure it tracks the pending API. |

(No blocker or required-fix rows — none identified.)

## 4. Correctly implemented items

- **SQL default (point 1):** `04_companies.sql:339` → `job_approval_required BOOLEAN NOT NULL DEFAULT false, -- Direct publish by default; owner/admin may enable approval`. Default is `false`; comment matches the direct-publish-by-default policy. Re-verified from current file.
- **jobs.ts semantics (point 2):**
  - `false` → direct publish: `SET status = CASE WHEN COALESCE(cs.job_approval_required, FALSE) THEN 'pending_approval' … ELSE 'published' … END` (`jobs.ts:109`); `published_at`/`published_by` set to `NOW()`/`$3` on the ELSE branch (`jobs.ts:110-111`). ✅
  - `true` → pending approval: THEN branch sets `status='pending_approval'`, `published_at=NULL`, `published_by=NULL`. ✅
  - Verification gate correct: `AND (COALESCE(cs.job_approval_required, FALSE) OR c.verification_status = 'verified')` (`jobs.ts:117`) — direct-publish path needs no verification; approval path requires a verified company. Consistent with SET. ✅
  - Existing submitted jobs unaffected: `publish()` only acts `WHERE j.status = 'draft'` (`jobs.ts:116`); every company gets a `company_settings` row at creation (`companies.ts:40`), so the `COALESCE(…,FALSE)` never hits NULL for real companies and stored values are unchanged. ✅ (re-verified, not trusted from prior review)
- **jobs.spec.ts (point 3):** Now asserts `COALESCE(cs.job_approval_required, FALSE)` (L70) and `'pending_approval'::job_status` (L71) appear in the publish SQL. Test executed successfully (see §6). ✅
- **Tracker (point 4):** Approval policy correctly marked done — `- [x] … default false (direct publish) …` (`IMPLEMENTATION-TRACKER-HINGLISH.md:86`). Settings mutation API (L87) and production migration/backfill (L88) explicitly marked pending `- [ ]`, with note that baseline default change is pre-prod rebuild only and existing deployed rows won't auto-change. ✅
- **DECISION-07 (point 5):** Consistent that direct publish is default (`DECISION-07:42-46, 53-54`); owner/admin setting semantics documented (`DECISION-07:54-55`); and explicitly states **no route is invented** — the mutation endpoint/DTO remain a separate Company API gate, and production rollout requires an explicit forward migration/backfill (`DECISION-07:58-61`). No unsupported route or behavior invented. ✅

## 5. Remaining rollout/API gaps

- **Settings mutation API (owner/admin):** Still not implemented (no `UPDATE public.company_settings` / no settings PATCH route in `src/`). Tracked at `IMPLEMENTATION-TRACKER-HINGLISH.md:87`; acknowledged in `DECISION-07:58-59`. Decide and implement an authorized, company-scoped settings update path before claiming owner/admin can change the setting.
- **Production forward migration / backfill:** Baseline default change does **not** alter already-deployed `company_settings` rows. A reviewed `ALTER TABLE … ALTER COLUMN job_approval_required SET DEFAULT false` (plus any backfill decision) is required for production rollout. Tracked at `IMPLEMENTATION-TRACKER-HINGLISH.md:88`; acknowledged in `DECISION-07:59-61`.
- **Behavioral test for `true` branch (F1):** Add a test that drives the approval path to confirm `false≠true` mapping, not just the SQL fragment.

## 6. Test results

- Command: `node ./node_modules/jest/bin/jest.js src/jobs.spec.ts` (jest 29.7.0, ts-jest; unit test with fully mocked DB client — non-destructive, no SQL/deployment executed).
- Outcome: `Test Suites: 1 passed, 1 total` · `Tests: 13 passed, 13 total` · `Time: ~41.8 s`.
- The targeted test `"publishes directly or moves to approval based on company setting"` (with the two new assertions) is included in the 13 passing tests.

## 7. Final recommendation

**APPROVED.** Commit `905ea2d` is a clean, read-only test-pinning + documentation commit:
- It correctly locks the `COALESCE(cs.job_approval_required, FALSE)` / `pending_approval` SQL in `jobs.spec.ts` (verified passing: 13/13).
- It accurately records the approval policy as `default false` and explicitly keeps the **settings mutation API** and **production forward migration/backfill** as pending items in the tracker and DECISION-07 — with no invented route or behavior.
- Underlying SQL (`04_companies.sql:339`) and `jobs.ts` (`jobs.ts:109-117`) were independently re-verified as correct for points 1–2 (false→published, true→pending_approval, correct verification gate, no impact on existing submitted jobs).

Only non-blocking follow-ups remain (F1 test depth; F2 informational; the two explicitly-tracked rollout gaps in §5). No source, SQL, test, or config was modified during this review.
