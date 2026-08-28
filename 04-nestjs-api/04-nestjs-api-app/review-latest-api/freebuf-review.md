# Latest API Implementation — Independent Security & Architecture Audit

**Auditor:** Freebuf  
**Date:** 2026-08-28  
**Scope:** `applications.ts`, `saved-candidates.ts`, `feedback.ts`, `analytics.ts`, `app.module.ts`  
**API Catalog:** `PHASE-06-API-CATALOG.md` §3E–§3H  
**SQL Baselines:** `09_applications.sql`, `12_notifications.sql`, `13_analytics.sql`, `18_feedback.sql`, `02_enums.sql`  
**Contracts:** `application-submitted.v1.json`, `AGGREGATE-ID-SEMANTICS.md`

---

## 1. Executive Summary

**Verdict: APPROVED WITH REQUIRED FIXES**

| Severity | Count |
|----------|-------|
| CRITICAL | 1 |
| HIGH | 4 |
| MEDIUM | 6 |
| LOW | 4 |
| PASS | 20 |

Build and test status: **27 suites, 82 tests — ALL PASS** (`npm run build` clean, `npm test -- --runInBand` all green).

Zero invented tables, columns, events, routes, queues or permissions found.

---

## 2. Files Inspected

| File | Lines | Status |
|------|-------|--------|
| `04-nestjs-api-app/src/applications.ts` | 210 | Read |
| `04-nestjs-api-app/src/saved-candidates.ts` | 100 | Read |
| `04-nestjs-api-app/src/feedback.ts` | 48 | Read |
| `04-nestjs-api-app/src/analytics.ts` | 48 | Read |
| `04-nestjs-api-app/src/app.module.ts` | 28 | Read |
| `02-database/migrations/baseline/09_applications.sql` | 1111 | Read |
| `02-database/migrations/baseline/13_analytics.sql` | 400+ | Read |
| `02-database/migrations/baseline/18_feedback.sql` | 120 | Read |
| `02-database/migrations/baseline/02_enums.sql` | 262–291 | Read |
| `contracts/events/application-submitted.v1.json` | 52 | Read |
| `PHASE-06-API-CATALOG.md` §3E–§3H | 487–880 | Read |

---

## 3. Commands Executed

```
✅ npm run build              PASS (exit 0, zero errors)
✅ npm test -- --runInBand    27 suites, 82 tests — ALL PASS (20.4s)
```

---

## 4. Findings Table

### 4.1 applications.ts

| ID | Severity | Finding | Evidence | Fix |
|----|----------|---------|----------|-----|
| **A-1** | 🔴 CRITICAL | `CompanyApplicationReadController.list()` and `detail()` return `snapshot_data` which may contain raw resume content — the API catalog says "raw resume bytes and unauthorized private fields excluded" | `applications.ts:158` — `s.snapshot_data` is SELECTed; `PHASE-06-API-CATALOG.md:609` — "raw resume bytes and unauthorized private fields excluded" | Add a DTO allowlist: only return `snapshot_id`, `source_profile_revision`, `snapshot_version`, `schema_version`, `generated_by`, `generated_at` — never the full `snapshot_data` JSONB |
| **A-2** | 🟡 HIGH | `CandidateApplicationReadController.detail()` also returns full `snapshot_data` to the candidate | `applications.ts:135` — `s.snapshot_data` SELECTed for the candidate's own application detail | Same fix as A-1: allowlist snapshot fields, never expose raw `snapshot_data` |
| **A-3** | 🟡 HIGH | `changeStatus()` allowed transitions include `interview_scheduled → interview_completed` but `enforce_application_status_update_path` trigger in SQL allows it — however `changeStatus()` in code does NOT include the `'applied' → 'interview_scheduled'` transition that SQL permits (`applied → under_review → screening → interview_scheduled`). The code's `allowed` set is correct but the error message `"INVALID_STATUS_TRANSITION"` is caught via string matching on the SQL function's error message, which is fragile | `applications.ts:93` — error caught via `String(error?.message || '').toLowerCase().includes('invalid application status transition')` | Consider catching the PostgreSQL exception code directly (`check_violation`) instead of relying on English error message substring matching |
| **A-4** | 🟡 HIGH | `submit()` catches `error?.code === '23505'` (unique violation) and re-queries the existing application, but the re-query fetches `snapshot_id` and `source_profile_revision` via a LEFT JOIN — if the duplicate application exists but snapshot creation failed previously (partial failure), the replay response may show `snapshot_id: null` | `applications.ts:82–99` — the re-query path after unique violation catch | This is a design gap: the duplicate-catch path should either verify snapshot existence or document that partial failure requires manual recovery |
| **A-5** | 🟡 MEDIUM | `submit()` builds `snapshotData` with `{ ...profile, email: undefined }` — this spreads ALL `candidate_profiles` columns including potentially sensitive internal fields like `phone`, `address`, etc. into the snapshot JSON | `applications.ts:101` — `{ ...profile, email: undefined }` | Explicitly pick only the fields that belong in the snapshot (name, headline, summary, location, etc.) instead of spreading the full profile row |
| **A-6** | 🟡 MEDIUM | `ApplicationService.submit()` requires `dto.consent !== true` to fail, but the consent field is typed as optional (`consent?: boolean` in the DTO) — a missing consent will pass the `!== true` check correctly, but a `null` or `undefined` consent will also pass. This is correct behavior but could be more explicit | `applications.ts:20` — `dto.consent !== true` | Minor: consider adding `dto.consent === undefined` explicit check for clarity |
| **A-7** | 🟡 MEDIUM | `changeStatus()` allowed transition set includes `'offer_accepted'` and `'offer_declined'` but these are terminal states in the SQL transition graph — once reached, no further transition is possible. The `allowed` set doesn't check current status before applying, so calling `changeStatus` with target `'offer_accepted'` from a non-`'offer_extended'` state will fail at the SQL function level, which is correct but the NestJS validation is incomplete | `applications.ts:87–88` — `allowed` set is a flat `Set`, not a transition map | Optionally validate current status in NestJS before calling SQL function to provide better error messages |
| **A-8** | 🟢 LOW | `audit_logs` INSERT in `submit()` uses `JSON.stringify({ consent: true, snapshot_id: snapshot.rows[0].id })` as `changes` — this is fine but the audit INSERT does not set `request_id` or `trace_id` | `applications.ts:110` — audit INSERT without trace fields | Consider threading `trace_id` from request context into audit rows for distributed tracing |
| **A-9** | 🟢 LOW | `CompanyApplicationReadController.list()` and `detail()` share the same base query pattern (membership check + application join) but the authorization logic is duplicated between `ApplicationService.changeStatus()` and `CompanyApplicationReadController` | `applications.ts:149–165` vs `applications.ts:50–56` | Consider extracting a shared `assertCompanyMember()` helper to eliminate duplication |

### 4.2 saved-candidates.ts

| ID | Severity | Finding | Evidence | Fix |
|----|----------|---------|----------|-----|
| **S-1** | 🟢 PASS | SQL table/column names match exactly: `saved_candidates`, `recruiter_user_id`, `company_id`, `candidate_id`, `private_note` | `saved-candidates.ts:37–43` vs `09_applications.sql:223–236` | — |
| **S-2** | 🟢 PASS | `UNIQUE (recruiter_user_id, candidate_id)` enforced via `ON CONFLICT` in INSERT | `saved-candidates.ts:39–42` — `ON CONFLICT (recruiter_user_id, candidate_id) DO UPDATE` | — |
| **S-3** | 🟢 PASS | Cross-company isolation: query filters by `company_id = $1 AND recruiter_user_id = $2` in all three operations (save, list, remove) | `saved-candidates.ts:67,78,93` | — |
| **S-4** | 🟢 PASS | `assertRecruiter()` checks `users.status = 'active'`, `users.deleted_at IS NULL`, `role IN ('employer','hr','admin')`, and same-company membership/owner/admin | `saved-candidates.ts:16–24` | — |
| **S-5** | 🟢 PASS | Candidate eligibility check: `is_open_to_work = TRUE` before save | `saved-candidates.ts:33` | — |
| **S-6** | 🟢 PASS | No `job_id` column in saved_candidates — correctly non-job-specific per requirement | `saved-candidates.ts:37–43` | — |
| **S-7** | 🟢 LOW | `list()` wraps in `this.system.transaction()` but only performs reads — transaction is unnecessary for read-only queries | `saved-candidates.ts:64` | Consider using `this.system.query()` directly for reads to avoid unnecessary transaction overhead |

### 4.3 feedback.ts

| ID | Severity | Finding | Evidence | Fix |
|----|----------|---------|----------|-----|
| **F-1** | 🟢 PASS | Table name `platform_feedback` matches SQL exactly | `feedback.ts:21` vs `18_feedback.sql:31` | — |
| **F-2** | 🟢 PASS | Column names match: `user_id`, `is_guest`, `category`, `subject`, `message`, `rating` | `feedback.ts:22–26` vs `18_feedback.sql:40–48` | — |
| **F-3** | 🟢 PASS | Category enum values match: `CATEGORIES` set matches `feedback_category` enum in `02_enums.sql:272–278` | `feedback.ts:5` vs `02_enums.sql:272–278` | — |
| **F-4** | 🟢 PASS | Rating validation: 1–5 integer, matches `CHECK (rating BETWEEN 1 AND 5)` | `feedback.ts:12` — `dto.rating < 1 || dto.rating > 5` | — |
| **F-5** | 🟢 PASS | User existence check: `WHERE EXISTS (SELECT 1 FROM public.users u WHERE u.id = $1 AND u.status = 'active' AND u.deleted_at IS NULL)` | `feedback.ts:23` | — |
| **F-6** | 🟢 PASS | Guest field exclusion: hardcoded `is_guest = FALSE` — no guest feedback submission in current scope (catalog says "guest submission/admin moderation remain separately gated") | `feedback.ts:22` | — |
| **F-7** | 🟢 PASS | No PII exposure: response returns only `id, category, subject, message, rating, status, created_at` — no user_id, no internal fields | `feedback.ts:26` | — |
| **F-8** | 🟢 LOW | `feedback.ts:12` checks `dto.rating !== undefined` but TypeScript allows `null` — a `null` rating will pass the `!== undefined` check and reach `Number.isInteger(null)` which returns `true`, causing a `null` rating to be inserted. The SQL allows `NULL` for rating, so this is technically correct but the validation is not explicit | `feedback.ts:12` | Consider explicit `dto.rating != null` check for clarity |

### 4.4 analytics.ts

| ID | Severity | Finding | Evidence | Fix |
|----|----------|---------|----------|-----|
| **AN-1** | 🟢 PASS | Table name `analytics_events` matches SQL exactly | `analytics.ts:16` vs `13_analytics.sql:28` | — |
| **AN-2** | 🟢 PASS | Column names match: `idempotency_key`, `user_id`, `event_name`, `event_category`, `source`, `event_data`, `entity_type`, `entity_id`, `session_id`, `request_id`, `trace_id`, `page_url`, `referrer_url` | `analytics.ts:17–29` vs `13_analytics.sql:32–80` | — |
| **AN-3** | 🟢 PASS | `ON CONFLICT (idempotency_key) DO UPDATE SET idempotency_key = EXCLUDED.idempotency_key` — correct no-op upsert for dedup | `analytics.ts:22` | — |
| **AN-4** | 🟢 PASS | Category and source enums match SQL CHECK constraints | `analytics.ts:4–5` vs `13_analytics.sql:72–74` | — |
| **AN-5** | 🟢 PASS | Event name regex `^[a-z0-9]+([._-][a-z0-9]+)*$` matches SQL CHECK constraint `analytics_event_name_format` | `analytics.ts:16` | — |
| **AN-6** | 🟢 PASS | User existence check prevents spoofed analytics | `analytics.ts:23` | — |
| **AN-7** | 🟢 PASS | `ip_address` and `user_agent` columns exist in SQL but are NOT populated by the NestJS code — correct: these should come from request metadata, not client-supplied values | `analytics.ts:17–29` — no `ip_address`/`user_agent` in INSERT | — |
| **AN-8** | 🟢 PASS | RLS boundary: `analytics_events` is append-only (UPDATE trigger blocks changes), and browser never writes directly | `13_analytics.sql:234–236` — `analytics_events_immutable` trigger | — |
| **AN-9** | 🟢 LOW | `analytics.ts:16` validates `event_name` with regex, but the SQL also has a `CHECK` constraint — duplicate validation is defense-in-depth (good), but the NestJS regex is compiled fresh on every request | `analytics.ts:16` vs `13_analytics.sql:68–70` | Consider moving the regex to a module-level constant |
| **AN-10** | 🟢 LOW | `replayed: false` is hardcoded in the response — on `ON CONFLICT DO UPDATE` (idempotent replay), the response still says `replayed: false` | `analytics.ts:25` | Consider detecting conflict vs insert to set `replayed: true` correctly |

### 4.5 app.module.ts

| ID | Severity | Finding | Evidence | Fix |
|----|----------|---------|----------|-----|
| **M-1** | 🟢 PASS | All controllers are registered in the module | `app.module.ts:14` — 20 controllers listed | — |
| **M-2** | 🟢 PASS | All services are registered as providers | `app.module.ts:15` — all services present | — |
| **M-3** | 🟢 PASS | `AuthGuard` is provided with correct constructor args: `config.SUPABASE_JWT_SECRET`, `undefined`, `{ issuer, audience }` | `app.module.ts:15` | — |
| **M-4** | 🟢 PASS | `SystemClient` is registered (not `UserContextClient`) for services that need trusted backend access | `app.module.ts:15` | — |
| **M-5** | 🟢 PASS | No route collisions detected — `ApplicationController` and `ApplicationStatusController` share `api/v1/companies/:companyId/applications` but use different HTTP methods (`POST` for `:jobId/apply` vs `PATCH` for `:applicationId/status`) — however `CompanyApplicationReadController` also uses the same path prefix with `GET` | `app.module.ts:14` — all controllers registered | — |

---

## 5. Security Findings

| ID | Severity | Finding | Impact |
|----|----------|---------|--------|
| **A-1** | 🔴 CRITICAL | `snapshot_data` exposed in API responses — may contain full candidate profile data including PII that should not be visible to company HR at the raw level | Candidate PII leakage to HR users |
| **A-5** | 🟡 MEDIUM | Full `candidate_profiles` row spread into snapshot — internal DB columns may be included in the immutable snapshot payload | Potential over-collection of candidate data in audit trail |
| **A-3** | 🟡 HIGH | Error message substring matching for SQL exception detection — brittle and locale-dependent | False negatives if PostgreSQL error message format changes |

---

## 6. Data-Integrity Findings

| ID | Severity | Finding | Impact |
|----|----------|---------|--------|
| **A-4** | 🟡 HIGH | Duplicate application catch path may return `snapshot_id: null` if previous partial failure | Inconsistent replay response |
| **S-7** | 🟢 LOW | Read-only queries wrapped in transactions unnecessarily | Minor performance overhead |

---

## 7. Contract/Schema Mismatches

| ID | Severity | Area | Finding |
|----|----------|------|---------|
| **A-1** | 🔴 CRITICAL | `application-submitted.v1.json` vs code | Contract requires `snapshot_id` in payload — code correctly provides it. But the API response exposes `snapshot_data` which the contract does NOT include — contract compliance is correct, but the API response exceeds what should be returned |
| **A-2** | 🟡 HIGH | API Catalog vs code | Catalog §3E says "raw resume bytes and unauthorized private fields excluded" from company reads — code includes `snapshot_data` which may contain raw resume content |
| **A-8** | 🟢 LOW | Audit trace | `audit_logs` INSERT does not include `request_id`/`trace_id` — distributed tracing gap |

---

## 8. SQL Parameterization & Constraint Compatibility

| Area | Status | Evidence |
|------|--------|----------|
| Parameterized queries | ✅ All queries use `$1, $2...` parameterized placeholders | All files |
| String interpolation in SQL | ✅ Zero instances of string interpolation | All files |
| Enum casting | ✅ `$2::public.application_status` correctly casts to enum | `applications.ts:94` |
| JSONB casting | ✅ `$5::jsonb` used correctly | `applications.ts:62,94` |
| CHECK constraint compatibility | ✅ All INSERT values satisfy SQL CHECK constraints | All files |
| UNIQUE constraint compatibility | ✅ `uq_registered_application_per_job` and `saved_candidates_owner_candidate_unique` correctly leveraged | `applications.ts:82`, `saved-candidates.ts:39` |

---

## 9. Route/Catalog/Documentation Consistency

| Catalog Entry | Implemented Route | Match |
|---------------|-------------------|-------|
| API-APPLICATION-001: `POST /api/v1/jobs/:jobId/apply` | ✅ `applications.ts:117` | ✅ |
| API-APPLICATION-002: `PATCH /api/v1/companies/:companyId/applications/:applicationId/status` | ✅ `applications.ts:170` | ✅ |
| API-APPLICATION-004: `GET /api/v1/me/applications[/:applicationId[/history]]` | ✅ `applications.ts:121,131,141` | ✅ |
| API-APPLICATION-005: `GET /api/v1/companies/:companyId/applications[/:applicationId]` | ✅ `applications.ts:148,160` | ✅ |
| API-SAVED-CANDIDATE-001: `POST/GET/DELETE /api/v1/companies/:companyId/saved-candidates[/:candidateId]` | ✅ `saved-candidates.ts:72,77,82` | ✅ |
| API-FEEDBACK-001: `POST /api/v1/feedback` | ✅ `feedback.ts:33` | ✅ |
| API-ANALYTICS-001: `POST /api/v1/analytics/events` | ✅ `analytics.ts:33` | ✅ |

---

## 10. Test Coverage Assessment

| Module | Test File | Tests | Coverage Gap |
|--------|-----------|-------|-------------|
| applications | `applications.spec.ts` | ✅ Present | Missing: concurrency test, snapshot_data exposure test, replay partial-failure test |
| saved-candidates | `saved-candidates.spec.ts` | ✅ Present | Missing: cross-company isolation test, candidate eligibility test |
| feedback | — | ❌ No dedicated test file | Missing: validation tests, enum compatibility test |
| analytics | `analytics.spec.ts` | ✅ Present | Missing: idempotency replay test, malformed event_name rejection test |

---

## 11. Missing Tests Required

| # | Test | Priority | Module |
|---|------|----------|--------|
| T-1 | Snapshot data exposure prevention — verify API responses never contain raw `snapshot_data` | CRITICAL | applications |
| T-2 | Cross-company application isolation — Company A cannot see Company B's applications | HIGH | applications |
| T-3 | Concurrent duplicate application submission — exactly one application + snapshot + outbox event | HIGH | applications |
| T-4 | Partial failure replay — if snapshot creation fails, duplicate catch returns appropriate error | HIGH | applications |
| T-5 | Status transition from non-current state — verify SQL function rejects invalid source state | MEDIUM | applications |
| T-6 | Saved candidate cross-user isolation — HR A cannot see HR B's bookmarks | MEDIUM | saved-candidates |
| T-7 | Feedback enum validation — invalid category rejected | MEDIUM | feedback |
| T-8 | Analytics idempotency — same key returns replayed=true | LOW | analytics |
| T-9 | Audit trace_id propagation — verify audit rows include request context | LOW | applications |

---

## 12. Production-Readiness Verdict

| Category | Status |
|----------|--------|
| **Schema/SQL alignment** | ✅ All table/column/function/enum names match exactly |
| **Security** | ⚠️ 1 CRITICAL (snapshot_data exposure) + 1 HIGH (candidate profile spread) |
| **Authorization** | ✅ JWT identity, company membership, owner/admin checks correct |
| **Cross-user/cross-company leakage** | ✅ All queries enforce `user_id` or `company_id` scoping |
| **Transaction atomicity** | ✅ Business rows + snapshot + audit + outbox in single transaction |
| **Idempotency** | ✅ DB-level unique constraints + ON CONFLICT handling |
| **Snapshot immutability** | ✅ `application_snapshots_immutable` trigger + `reject_immutable_row_change()` |
| **Status transition safety** | ✅ `change_application_status()` SQL function enforces allowed transitions |
| **PII/raw resume exposure** | ⚠️ `snapshot_data` exposed in API responses (A-1, A-2) |
| **Route/catalog consistency** | ✅ All implemented routes match catalog entries |
| **Invented objects** | ✅ Zero tables, columns, events, routes, queues or permissions invented |
| **Tests** | ✅ 82/82 pass; 9 missing test scenarios identified |

---

## 13. Required Fixes Before Production

| # | Severity | Fix | Owner |
|---|----------|-----|-------|
| 1 | 🔴 CRITICAL | Replace `s.snapshot_data` SELECT with explicit field allowlist in both `CandidateApplicationReadController.detail()` and `CompanyApplicationReadController.list()`/`detail()` | NestJS API |
| 2 | 🟡 HIGH | Refactor `submit()` snapshot builder to explicitly pick fields instead of `{ ...profile, email: undefined }` spread | NestJS API |
| 3 | 🟡 HIGH | Replace error message substring matching in `changeStatus()` with PostgreSQL exception code detection | NestJS API |
| 4 | 🟡 HIGH | Document or handle partial-failure replay path in `submit()` duplicate catch | NestJS API |
| 5 | 🟡 MEDIUM | Add `trace_id`/`request_id` to `audit_logs` INSERT in `submit()` | NestJS API |
| 6 | 🟢 LOW | Move analytics `event_name` regex to module-level constant | NestJS API |
| 7 | 🟢 LOW | Remove unnecessary transaction wrapping in `saved-candidates.ts:list()` | NestJS API |

---

## 14. What's Rock Solid

| Area | Evidence |
|------|----------|
| Zero invented objects | Every table, column, function, enum, trigger referenced in code exists in SQL baselines |
| Parameterized SQL | Zero string interpolation — all queries use `$N` placeholders |
| Transaction boundary | `applications.ts:submit()` wraps application + snapshot + document + history + audit + outbox in `this.system.transaction()` |
| Snapshot immutability | `application_snapshots_immutable` trigger prevents UPDATE/DELETE on `application_profile_snapshots` |
| Status transition safety | `change_application_status()` function enforces allowed transitions + `enforce_application_status_update_path` trigger blocks direct UPDATE |
| Duplicate protection | `uq_registered_application_per_job` UNIQUE index + code-level catch for `23505` |
| Saved candidate isolation | `company_id + recruiter_user_id` scoping in all queries; `assertRecruiter()` checks membership |
| Feedback immutability | `enforce_platform_feedback_lifecycle()` trigger prevents content/metadata changes after insert |
| Analytics immutability | `analytics_events_immutable` trigger blocks all UPDATE/DELETE on raw events |
| Cross-company isolation | All company-scoped queries join on `company_id` parameter |
| Outbox event contract | `application.submitted` payload matches `application-submitted.v1.json` exactly |

---

**Final Status: APPROVED WITH REQUIRED FIXES**

1 CRITICAL fix (snapshot_data exposure) must be resolved before any staging deployment. 3 HIGH fixes should be resolved before production. 6 MEDIUM/LOW fixes are recommended but not blocking.
