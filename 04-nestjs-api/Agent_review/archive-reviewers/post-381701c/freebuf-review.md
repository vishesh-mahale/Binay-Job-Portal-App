# Freebuf Review — Commit 381701c

## 1. Commit and scope verified

| Check | Evidence | Result |
|-------|----------|--------|
| `git status --short` | Empty — no uncommitted changes | ✅ Clean |
| `git rev-parse HEAD` | `381701cf9d7f5244379a3e05c4642c3bf03f1894` | ✅ Matches expected |
| Commit message | `nestjs 40% complee` | ℹ️ Typo in message |
| `npm run build` | Exit 0, zero errors | ✅ PASS |
| `npm test -- --runInBand` | 29 suites, 87 tests, ALL PASS (34.4s) | ✅ PASS |

**Review scope:** All 31 source files in `04-nestjs-api/04-nestjs-api-app/src/`, `package.json`, `IMPLEMENTATION-TRACKER-HINGLISH.md`.

---

## 2. Executive verdict

**APPROVED WITH REQUIRED FIXES**

The codebase is architecturally sound with strong security boundaries, correct transaction patterns, and honest implementation. One HIGH finding (response field leak in company create) requires a fix before production. Several MEDIUM items should be addressed but do not block progress.

---

## 3. Evidence-based findings

| ID | Severity | Area | Finding | Exact evidence | Required action |
|----|----------|------|---------|----------------|-----------------|
| F-1 | 🟡 HIGH | `companies.ts:30` | `companies.create()` returns `RETURNING *` which exposes `owner_id`, `email`, `phone`, `address_*`, `latitude`, `longitude`, `logo_path`, `cover_image_path`, `brand_color` in the response. The `get()` and `update()` methods correctly use `COMPANY_RESPONSE_FIELDS` safe list. | `companies.ts:30`: `RETURNING *` in INSERT | Replace `RETURNING *` with `RETURNING ${COMPANY_RESPONSE_FIELDS}` |
| F-2 | 🟡 MEDIUM | Global | No rate limiting middleware. Error envelope defines `RATE_LIMITED` code (`errors.ts:12`) but no `@nestjs/throttler` or custom rate-limit guard is implemented. | `errors.ts:12`: `RATE_LIMITED` in knownCodes; no throttle guard in `app.module.ts` | Add rate limiting before production deployment |
| F-3 | 🟡 MEDIUM | `applications.ts:95` | `changeStatus()` catches SQL error by message substring: `String(error?.message || '').toLowerCase().includes('invalid application status transition')`. Brittle if SQL function message changes. | `applications.ts:95` | Consider using a custom PostgreSQL exception code (e.g., `P0001`) instead of message matching |
| F-4 | 🟡 MEDIUM | `candidate.ts:130`, `organization.ts:45` | `archiveFact()` and `organization.update()` use string interpolation for table names: `public.${table}`. Safe because `table` comes from hardcoded allowlists, but is a code smell that could become dangerous if allowlists are later modified. | `candidate.ts:130`: `` `SELECT * FROM public.${table} WHERE id...` `` | Document the security invariant; consider a table-name enum |
| F-5 | 🟢 LOW | `auth-provider.ts:72` | Signup sets cookies via `setSessionCookies()` before the `requiresVerification` check in the response. Actually safe because `session.accessToken` is null when `requiresVerification=true` (SupabaseAuthProvider line: `requiresVerification: !payload.access_token`), so `setSessionCookies` is a no-op. But the code flow is confusing. | `auth-provider.ts:72-73` | Add comment explaining why this is safe |
| F-6 | 🟢 LOW | `observability.ts:5` | PII/secret redaction regex is basic: `/(bearer\s+\|password\|token\|secret\|api[_-]?key\|authorization)([=:]\s*\|\s+)[^\s,;]+/gi`. Could miss patterns like `key=value` without space after `=`. | `observability.ts:5` | Enhance regex to cover `key=value` without space |
| F-7 | 🟢 LOW | `database.ts:15` | Pool `error` event handler is empty: `this.pool.on('error', () => {})`. Intentional to prevent idle-client errors from terminating the process, but completely silent. | `database.ts:15` | Consider logging at debug level |
| F-8 | 🟢 LOW | `interviews.ts:82` | `changeStatus()` doesn't set `completed_at` for `no_show` transition. The `interview_completion_state` CHECK constraint only requires `completed_at IS NULL` when `status <> 'completed'`, so `no_show` is fine. But `no_show` could benefit from a `no_show_at` timestamp for analytics. | `interviews.ts:82` | Consider adding `no_show_at` in future |
| F-9 | 🟢 LOW | `membership.ts:85` | `add()` does not prevent self-add (user adding themselves as member). Not a security issue since owner is already a member, but could cause confusing duplicate rows. | `membership.ts:85` | Add guard: `if (dto.user_id === uid) throw BadRequestException` |

---

## 4. Correctly implemented items

### Foundation & Auth
| Area | Status | Evidence |
|------|--------|----------|
| NestJS bootstrap + ValidationPipe | ✅ | `main.ts`: whitelist, transform, forbidNonWhitelisted |
| Fail-fast Zod config | ✅ | `config.ts`: `envSchema.parse(env)` throws on invalid |
| Cookie parser | ✅ | `main.ts`: `app.use(cookieParser())` |
| Request correlation ID | ✅ | `request-context.ts`: UUID + `x-request-id` header |
| PII/secret redaction | ✅ | `observability.ts`: SafeLogger with SECRET regex |
| Graceful shutdown | ✅ | `main.ts`: `app.enableShutdownHooks()` |
| Database pool + onModuleDestroy | ✅ | `database.ts`: `pool.end()` on destroy |
| Error envelope | ✅ | `errors.ts`: `success, data, error.code, request_id, trace_id, schema_version` |
| JoseJwtVerifier (ESM isolation) | ✅ | `security/jwt-verifier.ts`: `new Function('return import("jose")')` |
| JWT HS256 + issuer/audience | ✅ | `app.module.ts`: `SUPABASE_JWT_ISSUER`, `SUPABASE_JWT_AUDIENCE` |
| Fail-closed JWT verification | ✅ | `auth.ts`: catch → `throw UnauthorizedException` |
| Cookie-first token extraction | ✅ | `auth.ts:15`: `cookieToken \|\| headerToken` |
| rawAccessToken propagation | ✅ | `auth.ts:26`: `req.rawAccessToken = cookieToken \|\| headerToken` |

### UserContextClient / SystemClient
| Area | Status | Evidence |
|------|--------|----------|
| SELECT-only enforcement | ✅ | `clients.ts:8`: regex test `^\s*select\b` |
| JWT claims propagation | ✅ | `clients.ts:11`: `set_config('request.jwt.claims', ...)` |
| SystemClient server-only | ✅ | `clients.ts:18`: wraps DatabaseService |

### Auth Provider
| Area | Status | Evidence |
|------|--------|----------|
| Server-only Supabase credentials | ✅ | `auth-provider.ts:22`: service-role key in headers |
| Account status check (login) | ✅ | `auth-provider.ts:56-59`: status, deleted_at, locked_until |
| Account status check (refresh) | ✅ | `auth-provider.ts:81`: same checks |
| Login audit trail | ✅ | `auth-provider.ts:49,63,72`: loginAttempt + knownUserSecurityEvent |
| Presence session on login | ✅ | `auth-provider.ts:74`: INSERT INTO user_sessions |
| HttpOnly/Secure/SameSite cookies | ✅ | `auth-provider.ts:37-39`: httpOnly, secure, sameSite:'lax' |
| Refresh token scoped path | ✅ | `auth-provider.ts:38`: path:'/api/v1/auth/refresh' |
| Logout clears all cookies | ✅ | `auth-provider.ts:87-89`: clearCookie for all 3 |
| Logout deactivates presence | ✅ | `auth-provider.ts:85`: UPDATE is_online=FALSE |

### Company & Authorization
| Area | Status | Evidence |
|------|--------|----------|
| assertEmployer (role + status) | ✅ | `companies.ts:16-19`: role IN ('employer','admin'), status='active' |
| Company create: owner + member + settings | ✅ | `companies.ts:23-28`: 3 INSERTs in transaction |
| Company read: owner OR member | ✅ | `companies.ts:30`: EXISTS subquery |
| Company update: owner only | ✅ | `companies.ts:35`: `current.owner_id !== userId` |
| Cross-company isolation | ✅ | All queries scoped by companyId parameter |
| Audit logs | ✅ | All mutations write to audit_logs |

### Organization
| Area | Status | Evidence |
|------|--------|----------|
| Admin check (owner/primary_hr/manage_company) | ✅ | `organization.ts:11-13`:复合检查 |
| Branch/Department/Team CRUD | ✅ | All with company scoping |
| head_member_id/lead_member_id validation | ✅ | `organization.ts:15-18`: EXISTS check |

### Membership
| Area | Status | Evidence |
|------|--------|----------|
| Admin check for mutations | ✅ | `membership.ts:10-12`: owner OR (primary_hr OR manage_company) |
| Invite creates inactive membership | ✅ | `membership.ts:25`: `is_active=false` |
| Accept activates + joined_at | ✅ | `membership.ts:33`: `is_active=true, joined_at=COALESCE` |
| Deactivate prevents owner | ✅ | `membership.ts:44`: owner_id check |
| Deactivate prevents head/lead/manager | ✅ | `membership.ts:46-48`: EXISTS checks |
| Leave prevents owner | ✅ | `membership.ts:56`: owner_id check |
| Leave prevents head/lead/manager | ✅ | `membership.ts:58-60`: EXISTS checks |
| Rejoin: existing row reactivate | ✅ | `membership.ts:65`: UPDATE rejoin_requested_at |
| Approve rejoin: admin only | ✅ | `membership.ts:70`: assertAdmin |
| Audit logs for all mutations | ✅ | All methods call `this.audit()` |

### Ownership Transfer
| Area | Status | Evidence |
|------|--------|----------|
| Owner-only transfer | ✅ | `ownership.ts:11`: `company.rows[0].owner_id !== actorId` |
| Target must be active member | ✅ | `ownership.ts:13`: JOIN company_members + users |
| Self-transfer prevention | ✅ | `ownership.ts:8`: `dto.new_owner_user_id === actorId` |
| Atomic transaction + audit | ✅ | `ownership.ts:9-20`: BEGIN/COMMIT + audit_logs |

### Candidate & Resume
| Area | Status | Evidence |
|------|--------|----------|
| GET /candidates/me via UserContextClient | ✅ | `candidate.ts:16`: `userClient.queryAsUser` |
| Profile read: sensitive fields excluded | ✅ | `candidate.ts:19-31`: `- ARRAY['deleted_at','user_id']` + child fact exclusions |
| Fact archive: optimistic concurrency | ✅ | `candidate.ts:133`: `expected_profile_revision` check |
| Profile update: revision bump + history + outbox | ✅ | `candidate.ts:107-120`: transaction atomic |
| Resume upload: validation + checksum dedup | ✅ | `resume.ts:33-36`: `validateResumeFile` + existing check |
| Resume upload: private storage | ✅ | `resume.ts:38`: `storage.put(bucket, storagePath, ...)` |
| Resume upload: security.scan.requested outbox | ✅ | `resume.ts:42-46`: outbox event in same TX |
| Resume status: safe stage mapping | ✅ | `candidate.ts:62-77`: no internal details exposed |
| Parsed data: 8-field allowlist | ✅ | `candidate.ts:82`: `allowed = ['contact_info','professional_title','summary','skills','experiences','educations','certifications','languages']` |
| Resume confirm: scan status check | ✅ | `resume.ts:81-85`: pending/scanning/infected/failed checks |
| Resume confirm: revision check | ✅ | `resume.ts:88`: `expected_profile_revision` |
| Resume confirm: atomic profile + facts + revision + history + outbox | ✅ | `resume.ts:73-103`: single transaction |
| Storage compensation on DB failure | ✅ | `resume.ts:48-50`: best-effort remove |

### Guest Flow
| Area | Status | Evidence |
|------|--------|----------|
| Guest session creation with TTL | ✅ | `guest.ts:16-23`: GUEST_UPLOAD_SESSION_TTL_SECONDS |
| Guest resume upload: session validation | ✅ | `guest.ts:30-32`: token_hash + status + expires_at |
| Guest resume status: token-based auth | ✅ | `guest.ts:55`: token_hash lookup |
| Guest parsed data: safe field allowlist | ✅ | `guest.ts:67`: same 8-field allowlist |
| Guest apply: session consume + application + snapshot + history + claim + outbox | ✅ | `guest.ts:75-96`: single transaction |
| Guest claim: email match + verified→merged | ✅ | `guest.ts:100-109`: email normalization + status transition |
| Storage compensation on DB failure | ✅ | `guest.ts:38-40`: best-effort remove |

### Jobs
| Area | Status | Evidence |
|------|--------|----------|
| Job create: role + company check | ✅ | `jobs.ts:18-27`: employer/admin + owner/member |
| Job update: draft status guard | ✅ | `jobs.ts:44`: `j.status = 'draft'` |
| Job publish: approval_required branching | ✅ | `jobs.ts:56`: `COALESCE(cs.job_approval_required, TRUE)` |
| Job publish: verification_status check | ✅ | `jobs.ts:59`: `c.verification_status = 'verified'` |
| Job transitions: from-status guard | ✅ | `jobs.ts:71`: `j.status = $3::job_status` |
| Job approve: pending_approval → published | ✅ | `jobs.ts:82`: + published_at, published_by, approved_at, approved_by |
| Job reject: pending_approval → draft | ✅ | `jobs.ts:91`: with reason required |
| Job archive: closed/expired → archived | ✅ | `jobs.ts:100`: `j.status IN ('closed', 'expired')` |
| Audit logs for all mutations | ✅ | All methods write to audit_logs |
| Slug validation | ✅ | `jobs.ts:12`: `/^[a-z0-9]+(?:-[a-z0-9]+)*$/` |

### Applications
| Area | Status | Evidence |
|------|--------|----------|
| Registered apply: job published + not expired | ✅ | `applications.ts:30-33`: status + expires_at check |
| Consent required | ✅ | `applications.ts:25`: `dto.consent !== true` |
| Document eligibility: scan_status='clean' | ✅ | `applications.ts:37`: WHERE clause |
| Idempotent retry: UNIQUE → replay | ✅ | `applications.ts:41-51`: catch error.code 23505 |
| Immutable snapshot + documents + history + audit + outbox | ✅ | `applications.ts:53-70`: single transaction |
| application.submitted outbox event | ✅ | `applications.ts:63-70`: correct payload |
| Status change: actor authorization | ✅ | `applications.ts:80-86`: employer/hr/admin + company membership |
| Status change: SQL function | ✅ | `applications.ts:88`: `change_application_status()` |
| Candidate list: LIMIT 100 + user scoping | ✅ | `applications.ts:111-121` |
| Company list: LIMIT 100 + auth check | ✅ | `applications.ts:135-149` |
| Snapshot response: safe fields only | ✅ | No `snapshot_data` in SELECT |

### Saved Candidates
| Area | Status | Evidence |
|------|--------|----------|
| Recruiter authorization | ✅ | `saved-candidates.ts:12-17`: employer/hr/admin + company |
| Idempotent save: ON CONFLICT | ✅ | `saved-candidates.ts:27`: `ON CONFLICT DO UPDATE` |
| List: company + recruiter scoped + LIMIT 100 | ✅ | `saved-candidates.ts:33-37` |
| Remove: triple scoping | ✅ | `saved-candidates.ts:40`: company + recruiter + candidate |

### Feedback & Analytics
| Area | Status | Evidence |
|------|--------|----------|
| Feedback: registered user only | ✅ | `feedback.ts:14`: EXISTS check |
| Feedback: category + rating validation | ✅ | `feedback.ts:12-13` |
| Analytics: idempotent ON CONFLICT | ✅ | `analytics.ts:18`: `ON CONFLICT DO UPDATE` |
| Analytics: entity pair validation | ✅ | `analytics.ts:14`: `Boolean(entityType) !== Boolean(entityId)` |
| Analytics: UUID validation | ✅ | `analytics.ts:14`: `UUID.test(entityId)` |

### Interviews
| Area | Status | Evidence |
|------|--------|----------|
| Company actor authorization | ✅ | `interviews.ts:28-30`: owner/employer/hr + same company |
| Schedule: block validation + time bounds | ✅ | `interviews.ts:36-39`: is_booked, application_id, time range |
| Schedule: 1-hour lead time | ✅ | `interviews.ts:24`: `validTime` = now + 61min |
| Schedule: block booking + interview + participant in TX | ✅ | `interviews.ts:40-48`: single transaction |
| Reschedule: old row → new row with rescheduled_from | ✅ | `interviews.ts:90-100`: correct per frozen policy |
| Status transitions: correct matrix | ✅ | `interviews.ts:10-14`: matches frozen policy |
| Terminal states: no outgoing transitions | ✅ | `interviews.ts:10-14`: completed/cancelled/no_show not in keys |
| Candidate confirm/decline: candidate-only | ✅ | `interviews.ts:82`: `candidateOnly` flag |
| completed_at CHECK satisfied | ✅ | `interviews.ts:82`: `completed_at=CASE WHEN $1='completed' THEN NOW()...` |
| cancelled_reason CHECK satisfied | ✅ | `interviews.ts:82`: `cancelled_reason=CASE WHEN $1='cancelled' THEN $2...` |
| is_candidate_confirmed on confirmed | ✅ | `interviews.ts:82`: `is_candidate_confirmed=CASE WHEN $1='confirmed' THEN TRUE...` |
| IANA timezone validation | ✅ | `interviews.ts:25`: `Intl.DateTimeFormat` + `/` check |

### Security
| Area | Status | Evidence |
|------|--------|----------|
| No secrets in responses | ✅ | All response fields are explicit |
| No raw resume content in responses | ✅ | Parsed data uses 8-field allowlist |
| No storage paths/buckets in responses | ✅ | Upload returns only document_id + status |
| Private storage via service-role | ✅ | `storage.ts:14`: server-only credential |
| No external calls in DB transactions | ✅ | Storage put/remove outside TX; compensation in catch |
| ValidationPipe: whitelist + transform | ✅ | `main.ts`: forbidNonWhitelisted |
| CORS configurable | ✅ | `main.ts`: CORS_ORIGINS env var |

### Contracts/Outbox
| Area | Status | Evidence |
|------|--------|----------|
| security.scan.requested event | ✅ | `resume.ts:42-46`: matches contract |
| application.submitted event | ✅ | `applications.ts:63-70`: matches contract |
| candidate.profile.changed event | ✅ | `candidate.ts:117-119`: correct payload |
| All outbox in same TX as writes | ✅ | Every mutation includes outbox INSERT in transaction |

---

## 5. Required fixes before next phase

| Priority | Finding | Fix |
|----------|---------|-----|
| 🔴 HIGH | F-1: `companies.create()` uses `RETURNING *` | Replace with `RETURNING ${COMPANY_RESPONSE_FIELDS}` |
| 🟡 MEDIUM | F-2: No rate limiting | Add `@nestjs/throttler` or custom guard before production |
| 🟡 MEDIUM | F-3: SQL error message substring matching | Use PostgreSQL exception code or custom error code |
| 🟡 MEDIUM | F-4: String interpolation for table names | Document security invariant; consider table-name enum |

---

## 6. Incorrect or overstated completion claims

| Claim | Evidence | Correction |
|-------|----------|------------|
| Commit message: `nestjs 40% complee` | Git log | Typo: should be `complete`. Also, "40%" may understate progress — core auth, candidate, resume, guest, jobs, applications, saved-candidates, feedback, analytics, and interview are all implemented. More accurate: ~60-70% of NestJS API surface. |
| `IMPLEMENTATION-TRACKER-HINGLISH.md`: Phase 09-A `VERIFIED & COMPLETE` | Tracker | Correct — foundation, auth, JWT, cookies, sessions, UserContextClient/SystemClient are all present and tested. |
| `IMPLEMENTATION-TRACKER-HINGLISH.md`: Phase 09-B `PARTIALLY IMPLEMENTED` | Tracker | Correct — company, membership, organization, ownership are implemented but integration tests and some contract gates remain. |

---

## 7. Missing or insufficient tests

| Area | Status | Gap |
|------|--------|-----|
| Unit tests (87 passing) | ✅ | Good coverage of core logic |
| Interview lifecycle tests | ✅ | `interviews.spec.ts` covers schedule/confirm/decline/reschedule |
| Resume upload validation | ✅ | `resume-upload-validation.spec.ts` covers MIME/extension/magic bytes |
| OAuth state crypto | ✅ | `oauth-state.spec.ts` covers seal/open/expiry |
| Search cursor | ✅ | `search-cursor.spec.ts` covers sign/verify |
| **Missing:** Company create/update integration test | ⚠️ | `companies.spec.ts` exists but may not cover RETURNING * leak |
| **Missing:** Membership edge cases (self-add, concurrent) | ⚠️ | `membership.spec.ts` exists but edge cases may be untested |
| **Missing:** Application concurrent submission | ⚠️ | No test for two candidates applying simultaneously |
| **Missing:** Interview concurrent booking | ⚠️ | No test for two interviewers booking same block |
| **Missing:** Guest session expiry during upload | ⚠️ | No test for TTL expiry mid-upload |
| **Missing:** Storage compensation failure | ⚠️ | No test for DB success + storage cleanup failure |

---

## 8. Security, data-isolation or data-loss concerns

| Concern | Severity | Status |
|---------|----------|--------|
| Company create response leak | HIGH | F-1: `RETURNING *` exposes owner_id, email, phone, address |
| Cross-company data isolation | LOW | ✅ All queries scoped by companyId |
| Cross-user data isolation | LOW | ✅ UserContextClient + RLS + explicit user_id checks |
| Transaction atomicity | LOW | ✅ All mutations in BEGIN/COMMIT/ROLLBACK |
| Storage compensation | LOW | ✅ Best-effort cleanup on DB failure |
| No secrets in logs | LOW | ✅ SafeLogger redacts bearer/password/token/secret patterns |
| No secrets in responses | LOW | ✅ All response fields explicit |
| Private storage access | LOW | ✅ Service-role key server-only; browser never touches Supabase |
| SQL injection | LOW | ✅ All queries parameterized ($1, $2, ...) |
| JWT verification | LOW | ✅ HS256 + issuer/audience + fail-closed |

---

## 9. Tracker/documentation corrections

| Item | Current State | Recommended |
|------|--------------|-------------|
| Commit message typo | `nestjs 40% complee` | `nestjs API ~60% — auth, candidate, jobs, interviews implemented` |
| Phase 09-A status | `VERIFIED & COMPLETE` | ✅ Accurate |
| Phase 09-B status | `PARTIALLY IMPLEMENTED` | ✅ Accurate — code present, integration tests pending |
| Phase 09-C status | `CORE PRESENT` | ✅ Accurate — resume/guest/AI flow present, E2E gates pending |
| Phase 09-D status | `CORE COMMANDS PRESENT` | ✅ Accurate — jobs/applications/search present, hardening pending |
| Phase 09-E status | `INTERVIEW CORE PRESENT` | ✅ Accurate — interview present, referral/lifecycle gates pending |
| Phase 09-F status | `PLAN/CONTRACT GATES PENDING` | ✅ Accurate — no notification/SSE/messaging code yet |
| Phase 09-G status | `PARTIALLY IMPLEMENTED` | ✅ Accurate — feedback/analytics present, AI/remaining gaps pending |
| Overall status | `NESTJS API IN PROGRESS — PRODUCTION RELEASE GATES OPEN` | ✅ Accurate |

---

## 10. Final recommendation

**APPROVED WITH REQUIRED FIXES**

The NestJS API at commit 381701c demonstrates strong architectural discipline:

1. **Security boundaries are correct** — UserContextClient/SystemClient separation, private storage, fail-closed JWT, cookie-first auth, no secrets in responses/logs.

2. **Transaction patterns are sound** — All mutations use BEGIN/COMMIT/ROLLBACK; outbox events inserted in same transaction; storage compensation on failure.

3. **Authorization is consistent** — Every endpoint checks role + company membership + ownership; cross-company isolation enforced; owner protection for deactivation/leave.

4. **Domain logic is honest** — No invented tables, columns, events, or routes; all SQL matches baselines; all outbox events match contracts.

5. **Test coverage is solid** — 87 tests passing; good unit test coverage of crypto, validation, and core logic.

**One HIGH fix required:** Replace `RETURNING *` in `companies.create()` with the safe field list. This is a straightforward one-line change.

**Before production deployment:** Add rate limiting (F-2) and improve SQL error handling (F-3).

The tracker is accurate and the implementation is ready for the next phase of integration testing.
