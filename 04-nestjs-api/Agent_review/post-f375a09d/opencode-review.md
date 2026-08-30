# Independent Code Review — Commit `f375a09d2f3e53dac895cdd3521cfdb5dd3107e7`

**Agent:** opencode
**Date:** 2026-08-29
**Scope (4 files, +14/-14):** `02-database/migrations/baseline/04_companies.sql`, `04-nestjs-api/04-nestjs-api-app/src/jobs.ts`, `04-nestjs-api/project-docs/implementation-records/IMPLEMENTATION-TRACKER-HINGLISH.md`, `04-nestjs-api/04-nestjs-api-app/jobs-search-review/DECISION-07-JOBS-SEARCH-FINAL.md`
**Commit intent:** "fix(jobs): make direct publish the default approval policy" — flip `company_settings.job_approval_required` default `true` → `false`.
**Verification method:** Read-only. Read full `jobs.ts` publish/approve/submit/reject logic (L103–187), baseline SQL `company_settings` (L335–346), the `companies.ts` settings-insert path (L40), the existing test `jobs.spec.ts`, and the DECISION-07/tracker diffs. No build/test execution (PowerShell policy blocks `npm`); static review only.

---

## Verdict

**APPROVED WITH OBSERVATIONS**

The default flip is implemented correctly and is consistently reflected across SQL, `jobs.ts`, DECISION-07, and the tracker. No new schema objects or routes were introduced. Four observations are recorded (O1–O5); none block this commit, but **O1 (owner/admin cannot actually change the setting) and O2 (no forward migration) should be tracked** because they bear directly on the stated semantics and on production rollout.

---

## Verification Against the Six Requested Points

### 1. `04_companies.sql`: `job_approval_required DEFAULT false` ✅
`04_companies.sql:339`:
```sql
job_approval_required    BOOLEAN NOT NULL DEFAULT false, -- Direct publish by default; owner/admin may enable approval
```
Default is now `false`. Column is `NOT NULL`, so the value is always explicit once a row exists.

### 2. NestJS `jobs.ts`: `false` → direct publish, `true` → pending approval ✅
`publish()` CASE logic (`jobs.ts:109–111`):
```sql
SET status      = CASE WHEN COALESCE(cs.job_approval_required, FALSE) THEN 'pending_approval'::job_status ELSE 'published'::job_status END,
    published_at = CASE WHEN COALESCE(cs.job_approval_required, FALSE) THEN NULL ELSE NOW() END,
    published_by = CASE WHEN COALESCE(cs.job_approval_required, FALSE) THEN NULL ELSE $3 END,
```
- `false` (or NULL→`FALSE`) ⇒ `status='published'`, `published_at=NOW()`, `published_by=actor` → **direct publish**. ✅
- `true` ⇒ `status='pending_approval'`, `published_at=NULL`, `published_by=NULL` → **approval workflow**. ✅
This matches DECISION-07 J3 exactly. The `approve()` path (`jobs.ts:166`) and `submitForApproval()` (`jobs.ts:151`) are unchanged and remain correct for the `true` branch.

### 3. Owner/admin setting semantics ⚠️ (see O1)
- **Read/interpretthe setting:** correct — `publish()` reads `company_settings.job_approval_required` and branches as above; the gate `AND (COALESCE(cs.job_approval_required, FALSE) OR c.verification_status = 'verified')` (`jobs.ts:117`) is consistent with the SET (approval path requires a verified company; direct-publish path needs no verification).
- **Who may CHANGE it:** DECISION-07 and the tracker state *"company owner/admin … may change this setting."* **No implementation path exists to change it.** Grep across `src/` shows the only write to `company_settings` is `INSERT INTO public.company_settings (company_id) VALUES ($1)` at `companies.ts:40` (uses the column DEFAULT), and `jobs.ts` only reads it. There is **no `UPDATE public.company_settings`** and **no settings PATCH/PUT route** anywhere in `src/`. The setting is therefore effectively immutable after company creation. This is a doc-vs-code inconsistency for the "owner/admin may change" claim.

### 4. Existing submitted jobs unaffected ✅ (with nuance)
- `publish()` only acts `WHERE j.status = 'draft'` (`jobs.ts:116`) and `companies.ts:40` inserts a `company_settings` row for **every** new company, so the `COALESCE(..., FALSE)` in `jobs.ts` never hits NULL for real companies. Existing companies already store an explicit boolean; the flip changes only the **column DEFAULT for future inserts**, so their behavior is unchanged. ✅
- Jobs already in `published`/`pending_approval`/`closed`/etc. are not touched by `publish()`. ✅
- Nuance (edge, see O4): for the *theoretical* case of a company with **no** `company_settings` row that is **unverified**, the gate's `COALESCE` flip (`TRUE`→`FALSE`) changes behavior from "publish → `pending_approval` allowed" to "publish blocked." Since rows always exist in practice, this is inert, but it is a semantic change worth noting.

### 5. SQL, DECISION-07, tracker, and tests consistency ✅ / ⚠️
- **SQL ↔ DECISION-07 ↔ tracker:** all three now say `default false` (direct publish); DECISION-07 J3 and the tracker bullet were updated in this commit and are mutually consistent. ✅
- **Tests:** `jobs.spec.ts:61–70` ("publishes directly or moves to approval based on company setting") only asserts that the SQL string `toContain('job_approval_required')` and that `result.status === 'published'` (mocked). It does **not** pin the new default semantics or exercise the `false`/`true` branches against a real/defaulted setting. The test remains **consistent** (passes with the change) but provides **no behavioral coverage** of the flip. ✅ (consistent) + ⚠️ (coverage gap, O3).
- Other review docs under `jobs-search-review/` (e.g., `opencode-decision-review.md`, `antigravity-decision-review.md`, `freebuf-*`, `sql-contract-sync-*`) still state `DEFAULT true`. Per `AGENTS.md` these historical reviews are non-authoritative; the frozen DECISION-07 is authoritative. Noted as O5 (risk of confusion only).

### 6. No unauthorized schema or route changes ✅ (with O2)
- **Schema:** only the DEFAULT of an existing column changed in the **baseline** file. No new table/column/index/constraint/function. ✅
- **Routes:** only `jobs.ts` `publish()` internals changed; no new controller, route, DTO, or decorator. ✅
- **Gap:** the change is in the baseline only — **no forward migration** was added. For an already-deployed database the baseline is not re-applied, so existing DBs keep `DEFAULT true`. A `ALTER TABLE … ALTER COLUMN job_approval_required SET DEFAULT false` migration is needed for production rollout (O2). (Per `AGENTS.md`, baseline correction is acceptable pre-freeze / for test-DB rebuild, but post-deploy changes must be forward migrations.)

---

## Observations (non-blocking)

- **O1 (Recommended — owner/admin mutability gap):** DECISION-07/tracker claim owner/admin can change `job_approval_required`, but no code path exists to do so (`companies.ts:40` is the only write, and it is an INSERT with DEFAULT). Either (a) add an authorized PATCH endpoint for `company_settings` scoped to company owner/admin, or (b) correct DECISION-07/tracker to state the setting is fixed at company creation (default only). The "who may change it" question left open in `freebuf-decision-review.md:119`/`opencode-decision-review.md:174` remains unresolved in code.
- **O2 (Recommended for prod rollout):** Add a forward migration to set the new default on already-deployed databases; otherwise only freshly built/rebuilt DBs get direct-publish-by-default.
- **O3 (Test coverage):** Add a behavioral test asserting `job_approval_required = false` → `published` (direct) and `true` → `pending_approval`, including the `verification_status` gate interaction, so the default flip is pinned.
- **O4 (Edge nuance):** `COALESCE(cs.job_approval_required, FALSE)` in the `WHERE` gate (L117) changes the missing-row+unverified behavior vs. the prior `TRUE`; inert in practice because rows always exist (`companies.ts:40`), but document intent to avoid future confusion.
- **O5 (Doc hygiene):** Multiple historical review docs under `jobs-search-review/` still say `DEFAULT true`. They are non-authoritative, but consider a one-line "superseded by DECISION-07 (default false)" note to prevent conflicting guidance.

---

## Conclusion

Commit `f375a09d` correctly and consistently flips the job-approval default to direct publish across SQL, application logic, the frozen DECISION-07, and the tracker, without introducing unauthorized schema or route changes, and without affecting existing jobs/companies. The publish branching (`false`→`published`, `true`→`pending_approval`) is verified correct. Tracked follow-ups: implement/authorize the owner/admin change path (O1) and add a forward migration (O2); tests cover the column name but not the new default behavior (O3). **APPROVED WITH OBSERVATIONS.**
