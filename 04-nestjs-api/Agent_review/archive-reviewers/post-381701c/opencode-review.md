# Independent Review — Commit 381701cf (NestJS 40%)

**Reviewer:** opencode
**Date:** 2026-08-28
**Commit:** `381701cf9d7f5244379a3e05c4642c3bf03f1894`
**Scope:** Full commit review — auth, companies, jobs, applications, candidates, guests, interviews, outbox/dispatcher, SQL migrations, RLS, infrastructure

---

## Executive Verdict

**NOT production-ready.** 3 BLOCKER bugs must be fixed before any deployment. Company updates are completely broken (owner_id never returned), candidate search ranking uses wrong parameter, and interview scheduling violates a DB trigger constraint. Additionally, `AuthGuard` is not globally wired, creating an unprotected-endpoint risk for future controllers.

---

## BLOCKER Findings

### B1: Company updates always fail — `owner_id` missing from response

**File:** `04-nestjs-api/04-nestjs-api-app/src/companies.ts:22,50-51`

`COMPANY_RESPONSE_FIELDS` (line 22) does not include `owner_id`:

```typescript
const COMPANY_RESPONSE_FIELDS = 'id,name,slug,legal_name,description,industry,...,created_at,updated_at';
```

The `get()` method (line 44-47) returns rows selected with `COMPANY_RESPONSE_FIELDS`, so `owner_id` is never present in the result. The `update()` method (line 50-51) then checks:

```typescript
const current = await this.get(userId, companyId);
if (current.owner_id !== userId) throw new ForbiddenException('FORBIDDEN');
```

Since `current.owner_id` is always `undefined`, the comparison `undefined !== userId` is always `true`, and **every company update throws FORBIDDEN** — including for the actual owner.

**Impact:** Company profile updates completely non-functional.
**Fix:** Add `owner_id` to `COMPANY_RESPONSE_FIELDS`.

---

### B2: Candidate search `ts_rank_cd` uses wrong parameter

**File:** `04-nestjs-api/04-nestjs-api-app/src/candidate-search-query.ts:22`

```typescript
ts_rank_cd(csp.search_vector, websearch_to_tsquery('english', $2)) AS score
```

`$2` is `recruiterUserId` (line 5). The search query is bound to `$3` (line 5). The `ts_rank_cd` call ranks against the recruiter's UUID string instead of the actual search query, producing meaningless relevance scores.

**Impact:** Candidate search ranking completely broken — results are ordered arbitrarily.
**Fix:** Change `$2` to `$3` in the `ts_rank_cd` call.

---

### B3: Interview `schedule()` violates DB trigger constraint

**File:** `04-nestjs-api/04-nestjs-api-app/src/interviews.ts:55-56`
**DB Trigger:** `10_interviews.sql:300-370` (`validate_interview_application_scope`)

The `schedule()` method executes in this order within a transaction:
1. Line 55: `UPDATE interview_schedule_blocks SET is_booked=true, application_id=$1, job_id=$2 ...` (marks block booked)
2. Line 56: `INSERT INTO interviews ...` (inserts interview row)

The BEFORE INSERT trigger `validate_interview_application_scope` (line 348-358) checks:

```sql
IF v_block_is_booked IS DISTINCT FROM TRUE
   OR v_block_application_id IS DISTINCT FROM NEW.application_id
   OR v_block_job_id IS DISTINCT FROM NEW.job_id THEN
    RAISE EXCEPTION 'Interview schedule block must be booked for the same application and job';
END IF;
```

The UPDATE on line 55 sets `application_id` and `job_id` on the block **before** the INSERT on line 56, so the trigger should see the updated values. However, there is a subtlety: the UPDATE sets `application_id=$1` (the applicationId param) and the INSERT's `NEW.application_id` also comes from the same applicationId. The trigger reads from the table which now has the updated values. This should actually work correctly since the UPDATE commits its changes to the block row within the same transaction before the INSERT trigger fires.

**Re-evaluation:** On closer inspection, the trigger reads the block row via `SELECT ... FROM interview_schedule_blocks WHERE id = NEW.schedule_block_id` at INSERT time. The preceding UPDATE has already set `is_booked=true, application_id=$1, job_id=$2` on that row. So `v_block_is_booked = TRUE`, `v_block_application_id = application_id`, `v_block_job_id = job_id` — all matching `NEW.application_id` and `NEW.job_id`. **This is NOT a blocker.** The trigger constraint is satisfied.

**Downgraded from BLOCKER to OK.**

---

## HIGH Findings

### H1: `AuthGuard` not wired as global guard

**File:** `04-nestjs-api/04-nestjs-api-app/src/app.module.ts:26`

`AuthGuard` is registered as a provider but NOT as `APP_GUARD`:

```typescript
providers:[..., { provide:AuthGuard, useFactory:()=>new AuthGuard(config.SUPABASE_JWT_SECRET, ...) }, ...]
```

Every controller must manually apply `@UseGuards(AuthGuard)`. Currently all controllers do this, but:
- A new controller forgetting `@UseGuards(AuthGuard)` would be **completely unprotected**
- The `GuestSessionController` intentionally has mixed protected/unprotected routes (create/upload/status/parsed are unauthenticated; claim is protected) — this pattern works but is fragile

**Impact:** Latent security risk for future additions.
**Fix:** Register `{ provide: APP_GUARD, useClass: AuthGuard }` globally, then remove per-controller `@UseGuards(AuthGuard)`. For guest routes, add `@Public()` decorator to skip auth.

---

### H2: `saved_candidates` ON CONFLICT constraint mismatch potential

**File:** `04-nestjs-api/04-nestjs-api-app/src/saved-candidates.ts:35`
**DB Schema:** `09_applications.sql:236-237`

The unique constraint is `UNIQUE (recruiter_user_id, candidate_id)` — scoped to recruiter + candidate only, **not** to company. The ON CONFLICT clause references `(recruiter_user_id, candidate_id)` which matches the constraint name. However, the INSERT includes `company_id`, and the `save()` method uses `assertRecruiter(client, companyId, userId)` to validate company access first.

If the same recruiter saves the same candidate under two different companies, the second save would silently update the `private_note` from the first company — and the `company_id` column would remain the first company's ID. This is a semantic bug: the company_id in the row may not match the company the request was made under.

**Impact:** Cross-company note overwrite possible.
**Fix:** Either change the unique constraint to `UNIQUE (recruiter_user_id, candidate_id, company_id)` or ensure the ON CONFLICT path also updates `company_id`.

---

### H3: `01_extensions.sql` duplicate NOTE block

**File:** `02-database/migrations/baseline/01_extensions.sql:120-135`

Lines 120-125 contain an incomplete NOTE block (missing reason section), immediately followed by lines 126-135 with the complete version. This is harmless but indicates an incomplete edit.

**Impact:** Noise only. No functional impact.
**Fix:** Remove lines 120-125.

---

### H4: `15_infrastructure.sql` pg_cron hard dependency

**File:** `02-database/migrations/baseline/15_infrastructure.sql:476-488`
**Extension:** `01_extensions.sql:118`

The daily job expiry cron is created via `cron.schedule()` which requires the `pg_cron` extension. The extension is created in `01_extensions.sql` via `CREATE EXTENSION IF NOT EXISTS pg_cron`. If `pg_cron` is not available (self-hosted Postgres, some managed providers), the entire baseline migration will fail.

**Impact:** Deployment failure on non-Supabase Postgres.
**Fix:** Wrap the cron.schedule block in a `DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN ... END IF; END $$;` guard, or document the hard Supabase dependency.

---

## MEDIUM Findings

### M1: No JWT revocation mechanism

**File:** `04-nestjs-api/04-nestjs-api-app/src/auth.ts:14-16`

JWTs are verified by signature only; there is no token blacklist or revocation check. A logged-out user's access token remains valid until expiration. The `logout` endpoint (auth-provider.ts:94-101) clears cookies and marks the presence session offline, but does not invalidate the JWT itself.

**Impact:** Stolen/leaked tokens remain usable until expiry.
**Mitigation for now:** Short JWT expiry + secure cookie flags. Long-term: add a server-side token blocklist or use opaque sessions.

---

### M2: `UserContextClient` SELECT-only regex bypass

**File:** `04-nestjs-api/04-nestjs-api-app/src/clients.ts:10`

```typescript
if (!/^\s*select\b/i.test(sql)) throw new Error('UserContextClient permits SELECT statements only');
```

The regex allows any SQL after `SELECT`, including `SELECT ... ; DROP TABLE ...;` or `SELECT ... INTO ...`. The regex only checks the beginning of the string. A multi-statement attack could bypass this check.

**Impact:** Potential SQL injection vector if user-supplied SQL reaches `UserContextClient`.
**Mitigation:** Currently no controller passes user-supplied SQL to `UserContextClient` — all queries are hardcoded. But the boundary is weak.

---

### M3: `applications.ts` error handling by string matching

**File:** `04-nestjs-api/04-nestjs-api-app/src/applications.ts:133-134`

```typescript
if (String(error?.message || '').toLowerCase().includes('invalid application status transition'))
    throw new BadRequestException('INVALID_STATUS_TRANSITION');
```

This catches PG exceptions by matching on the error message text. If the PG error message format changes (e.g., different locale, PG version), the catch fails silently and re-throws an internal error.

**Impact:** Fragile error mapping; could surface 500 instead of 400.
**Fix:** Match on `error.code` (PG error code) instead of message text.

---

### M4: `feedback.ts` and `analytics.ts` lack rate limiting

**Files:** `feedback.ts:32`, `analytics.ts:34`

Both endpoints accept unlimited POST requests with no throttling. A malicious client could flood the database with feedback or analytics rows.

**Impact:** Database bloat, potential DoS.
**Fix:** Add NestJS ThrottlerModule or a simple in-memory rate limiter.

---

### M5: `storage.ts` no retry/timeout on storage operations

**File:** `04-nestjs-api/04-nestjs-api-app/src/storage.ts:22-34`

`SupabaseStorageAdapter.put()` and `remove()` use bare `fetch()` with no timeout, retry, or circuit breaker. A slow Supabase Storage endpoint would hang the request indefinitely.

**Impact:** Potential request hangs under storage latency.

---

## LOW Findings

### L1: `guest.ts` no session expiry cleanup

Expired guest upload sessions are never cleaned up. The `expire_due_jobs` function handles job expiry but not guest session expiry. Over time, orphaned sessions accumulate.

### L2: `jobs.ts` slug uniqueness not enforced at application level

Job slug uniqueness is not checked before INSERT. If two draft jobs have the same slug under the same company, the INSERT will succeed (no UNIQUE constraint on slug). Only when the job is published would a slug conflict potentially matter.

### L3: `resume.ts` no concurrent upload limit

A candidate could upload many resumes simultaneously. No limit on in-flight uploads per candidate.

### L4: `auth-provider.ts` login audit event leaks internal state

The `login` endpoint returns different error messages for `VALIDATION_ERROR` vs `UNAUTHORIZED`, potentially leaking whether an account exists.

---

## Correctly Implemented Items

| Area | Status | Notes |
|------|--------|-------|
| JWT verification (jose) | ✅ | Fail-closed, issuer/audience validated |
| Cookie security | ✅ | httpOnly, secure, sameSite, scoped paths |
| AuthProvider Supabase adapter | ✅ | Service-role key used server-side only |
| Auth audit logging | ✅ | Login attempts + security events tracked |
| UserContextClient/SystemClient separation | ✅ | Clean boundary for user vs system queries |
| Company create with owner membership | ✅ | Transactional, role not inferred |
| Job CRUD lifecycle | ✅ | Draft → publish → pause/resume/close with audit |
| Job approval workflow | ✅ | Company settings respected |
| Application submission | ✅ | Snapshot, status history, outbox event atomic |
| Application dedup (23505) | ✅ | Replayed with existing snapshot summary |
| Guest upload → apply flow | ✅ | Session consumption, claim token, outbox event |
| Resume upload with dedup | ✅ | Checksum-based reuse |
| Resume confirm with profile bump | ✅ | Optimistic revision check, confirmed facts |
| Outbox event lifecycle | ✅ | Comprehensive state machine with triggers |
| Outbox claim/publish/fail functions | ✅ | Idempotent, bounded, dead-letter support |
| expire_due_jobs | ✅ | Idempotent, notification, audit |
| RLS policies (17_rls.sql) | ✅ | Comprehensive per-table policies |
| Error filter | ✅ | Consistent response shape, known error codes |

---

## Tracker Corrections

### `IMPLEMENTATION-TRACKER-HINGLISH.md` accuracy check:

1. **"Company CRUD"** — Tracker says complete. **Partially wrong.** Company update is broken due to B1 (owner_id missing from response).

2. **"Candidate Search"** — Tracker says complete. **Partially wrong.** Search ranking is broken due to B2 (ts_rank_cd wrong parameter).

3. **"Interview Lifecycle"** — Tracker says complete with note "3 tests". **Under-tested.** Only 3 unit tests exist for a complex transactional service with 5 endpoints. The core scheduling flow was not integration-tested against the DB trigger.

4. **"AuthGuard not global"** — Not flagged in tracker as a risk.

5. **"saved_candidates unique constraint"** — Not flagged as cross-company note overwrite risk.

---

## Final Recommendation

**Do NOT deploy until B1 and B2 are fixed.** B3 was downgraded on closer inspection but should be integration-tested. H1 should be addressed before adding any new controllers. The test suite needs significant expansion — interview lifecycle, guest flow, and application status transitions need integration tests against a real database.
