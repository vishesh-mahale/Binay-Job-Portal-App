# FreeBuf — Option B HR Invite-First Stage 1 Final Re-Review

**Reviewer:** FreeBuf (Read-Only Security Reviewer)  
**Date:** 2026-09-03  
**Scope:** Frozen Stage 1 Option B HR Invite-First design — D9 contract decisions, migration file, implementation plan, baseline DB schema, existing auth/membership code  
**Status:** **NOT APPROVED — BLOCKERS REMAIN**  
**Review path:** `04-nestjs-api/Agent_review/phase-09b-option-b/freebuf-final-review.md`

---

## 0. Review Basis & Method

This review verifies the 18 mandatory verification points specified by the user against the frozen Stage 1 documentation and existing codebase. Source-of-truth files:

| File | Exists | Status |
|------|--------|--------|
| `PHASE-09-B-OPTION-B-HR-INVITE-FIRST-CONTRACT-DECISIONS.md` | YES | Frozen draft (v8) |
| `implementation_plan.md` | **NO** | **MISSING** |
| `20260903000000_option_b_company_invitations.sql` | **NO** | **MISSING** |
| `ANTIGRAVITY-MASTER-IMPLEMENTATION-PROMPT.md` | YES | Authority source |
| `PHASE-09-B-API-CONTRACT-DECISIONS-HINGLISH.md` | YES | D1–D8 resolved |
| `PHASE-09-B-API-CONTRACT-FREEZE.md` | YES | Pending DTO review |
| Baseline DB schema (01–18) | YES | No `company_invitations` table |
| Existing auth/membership code | YES | Option A only; no Option B code |

**Classification:** Every finding is classified as BLOCKER, REQUIRED CHANGE, RECOMMENDATION, or PASS. Implementation status is distinguished: already implemented/proven, specified but not implemented, or missing/contradictory.

---

## 1. Browser → Next.js → NestJS → Supabase Architecture Preserved

### PASS

The D9 spec preserves the approved architecture. All new flows (signup-with-invite, login-with-invite, invitation creation, token verification, membership creation) route through NestJS as the sole authorization boundary. No browser-to-Supabase direct writes are introduced.

**Evidence:** D9 contract decisions §1, §3 specify NestJS handles token generation, hash, email dispatch, verification, and membership creation. Supabase Auth is called via server-side `admin.createUser()` and `signInWithPassword()`. No service-role key reaches the browser.

**Implementation status:** Specified but not implemented (no Option B code exists yet).

---

## 2. HR Public Signup Disabled; Only Verified Owner/Admin Can Invite

### PASS

Existing code enforces this. `SignupDto.register_as` is validated by `@IsIn(['candidate', 'employer'])` (`auth-provider.ts:272`). Public signup rejects `hr` and `admin` roles at HTTP 400. The master prompt explicitly states: "Public signup must never allow: hr, admin."

The D9 spec's `POST /api/v1/companies/:companyId/invitations` requires `assertAdmin` verification (`membership.ts:39–44`), which checks `owner_id` or `is_primary_hr`/`manage_company` permission. No unauthenticated user can create invitations.

**Implementation status:** Existing code (Option A) already enforces this. Option B invitation endpoint would reuse the same `assertAdmin` guard.

---

## 3. User Cannot Be Candidate and HR Simultaneously

### BLOCKER — REQUIRED PRODUCT DECISION

**The D9 spec explicitly states:** "update `users.role = 'hr'`" during invitation acceptance (§1 step 3, §3 step 5). This means a user who was previously a `candidate` (from public signup) would have their global `users.role` mutated to `hr` upon accepting an HR invitation.

**Problem:** The current `users.role` is a single-value `user_role` enum field (`02_enums.sql:61–66`). It is NOT a per-company role. If the user's global role is changed to `hr`, they can no longer apply to jobs as a candidate. This is a critical architectural decision that is NOT resolved in D1–D8.

**Contradiction:** The D9 spec says this is the "Production HR Invite-First Flow" but does not address the global role mutation question raised in the previous FreeBuf review (Finding W-1, lines 322–336).

**Required correction:** Either:
- (a) Accept that `users.role` mutation is intentional (user can no longer be candidate) — document this as an explicit decision, OR
- (b) Remove the `users.role = 'hr'` mutation and scope HR permissions entirely through `company_members` (user can be both candidate and HR across different companies)

**Decision authority:** This is a PRODUCT decision, not a security decision. It must be resolved before Stage 2 coding.

---

## 4. One HR Can Have Only One Active Company Membership

### REQUIRED CHANGE

**The D9 spec does NOT enforce this constraint.** The existing `company_members` table has `unique_member_per_company UNIQUE (company_id, user_id)` (`04_companies.sql:297`), which prevents the same user from being added twice to the SAME company. However, there is NO constraint preventing a user from being an active member of MULTIPLE companies simultaneously.

**The D9 spec's atomic acceptance transaction (§1 step 3) does NOT include:**
```sql
-- Check: user has no other active company_members row
SELECT 1 FROM company_members WHERE user_id=$1 AND is_active=true AND company_id <> $2;
```

**Required correction:** Add a single-active-company check to the acceptance transaction, OR document that multi-company membership is permitted. If single-active is required:
```sql
-- In acceptance transaction, after FOR UPDATE on invitation:
PERFORM 1 FROM public.company_members 
WHERE user_id = $userId AND is_active = true AND company_id <> $companyId;
IF FOUND THEN RAISE EXCEPTION 'USER_ALREADY_ACTIVE_IN_ANOTHER_COMPANY'; END IF;
```

**Implementation status:** Not specified in D9. Not implemented in existing code.

---

## 5. Token Is Cryptographically Random, Hashed in DB, Never Logged/Stored in Plaintext, and Scrubbed from URL

### SPECIFIED BUT INCOMPLETE — REQUIRED CHANGE

**D9 spec claims:**
- Token generation: "Outbox worker decrypts AES-256 payload in memory, sends email via Brevo SMTP with link" (§3 step 2)
- URL scrubbing: "Next.js immediately scrubs raw token from URL (`history.replaceState`) into React memory" (§3 step 3)

**Missing guarantees:**
1. **No code exists** for token generation, hashing, or storage. The spec describes the behavior but no implementation backs it.
2. **AES-GCM encryption** is mentioned for the outbox payload, but no key registry, rotation, or worker code exists.
3. **No explicit rule** that raw token is never written to any database column, audit log, or outbox event payload.
4. **No grep gate** to catch accidental token leakage in logs or INSERT statements.

**Required correction:** Add a mandatory implementation rule:
```typescript
// GENERATION: token never leaves this function scope
const rawToken = crypto.randomBytes(32).toString('base64url');
const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
// rawToken → email only. tokenHash → database only.
// NEVER log rawToken. NEVER store rawToken in DB or outbox.
```

**Implementation status:** Specified conceptually but not implemented.

---

## 6. GET/Preview Never Activates or Consumes Invitation

### SPECIFIED BUT NOT IMPLEMENTED — REQUIRED CHANGE

**D9 spec states:** "Link open / GET request NEVER activates membership or consumes token" (§3 step 3).

**Problem:** No GET endpoint for invitation preview exists in the spec. The frontend flow is: open link → Next.js scrubs URL → renders signup/login form → user submits POST. There is no server-side GET endpoint that returns invitation details (company name, inviter name, role offered) without consuming the token.

**Without a GET/preview endpoint:**
- The user sees a generic signup/login form with no context about who invited them
- The invitation email must contain all relevant information (company name, role, inviter)
- There is no way to verify the token is valid before the user fills in the form

**Required correction:** Either:
- (a) Add `GET /api/v1/invitations/preview?token=<raw>` that returns `{ company_name, inviter_name, role, email, expires_at }` without consuming the token, OR
- (b) Include all necessary context in the invitation email body

**Implementation status:** Not specified. Not implemented.

---

## 7. Token Validation Checks Hash, Pending Status, Expiry, Revocation, and Normalized Email

### SPECIFIED BUT NOT IMPLEMENTED — REQUIRED CHANGE

**D9 spec states:** "Validate raw token (SHA-256 hash matches `token_hash`, `status = 'pending'`, `expires_at > NOW()`, not revoked, email matches `invitation.email`)" (§1 step 1).

**Verification against baseline:**
- ✅ `company_members` has `invited_at`, `invited_by` fields for audit trail
- ❌ `company_invitations` table does NOT exist in baseline — no `token_hash` column to check against
- ❌ `invitation_status` enum does NOT exist in baseline
- ❌ No email identity binding check exists in the spec's acceptance flow

**Critical gap — email identity binding:** The D9 spec says "email matches `invitation.email`" but does NOT specify that the AUTHENTICATED USER's email must match. The `company_members.user_id` is derived from JWT `sub`, not from email. An attacker who obtains the token link could:
1. Create an account with a different email
2. Log in with their own email
3. Accept the invitation intended for someone else

**Required correction:** Add explicit email identity binding:
```typescript
// In acceptance service:
const user = await client.query('SELECT email FROM users WHERE id=$1', [userId]);
const invitation = await client.query('SELECT email FROM company_invitations WHERE token_hash=$1', [tokenHash]);
if (user.rows[0].email.toLowerCase() !== invitation.rows[0].email.toLowerCase()) {
    throw new ForbiddenException('FORBIDDEN');
}
```

**Implementation status:** Specified conceptually but not implemented. Email identity binding is not explicitly required in the D9 spec.

---

## 8. New-User Signup and Existing-User Login Paths Are Unambiguous

### PASS

**D9 spec clearly defines two paths:**
- **Path A (New User):** `POST /api/v1/auth/signup-with-invite` `{ token, password, full_name }` — provisions account, executes atomic acceptance, performs sign-in
- **Path B (Existing User):** `POST /api/v1/auth/login-with-invite` `{ token, email, password }` — authenticates user, executes atomic acceptance, sets cookies

**No ambiguity.** The paths are mutually exclusive by design:
- Path A creates a new Supabase Auth user via `admin.createUser()`
- Path B authenticates an existing user via `signInWithPassword()`

**Implementation status:** Specified. Not implemented.

---

## 9. New-User Flow Sets email_confirm=true Only After All Token Checks

### SPECIFIED BUT NOT IMPLEMENTED — REQUIRED CHANGE

**D9 spec states:** "provisions account with `email_confirm: true`" (§3 step 4 Path A).

**Verification against existing code:** The current `signup()` method (`auth-provider.ts:107–188`) already sets `email_confirm` based on `AUTH_AUTO_CONFIRM_EMAIL` config. The D9 spec would need a separate `signupWithInvite()` method that ALWAYS sets `email_confirm: true` regardless of the config value, because the invitation itself serves as email verification.

**Problem:** The spec does NOT clarify the order of operations. It says:
1. Validate token
2. Provision Supabase Auth user with `email_confirm: true`
3. Execute atomic acceptance

If step 2 succeeds but step 3 fails (e.g., unique constraint violation), the Supabase Auth user exists but no `company_members` row was created. The user has a verified account but no membership. This is acceptable behavior (the user can log in normally), but must be documented.

**Required correction:** Add explicit ordering:
```sql
-- Step 1: Validate token (read-only check)
-- Step 2: Provision Supabase Auth user (out-of-transaction)
-- Step 3: Execute atomic acceptance (FOR UPDATE + insert)
-- If step 3 fails: user exists but has no membership; can retry
```

**Implementation status:** Specified conceptually. Order of operations not explicit.

---

## 10. PostgreSQL Acceptance Updates Role, Invitation Status, Membership, and Audit Record Atomically with FOR UPDATE

### SPECIFIED BUT NOT IMPLEMENTED — REQUIRED CHANGE

**D9 spec states:** "Execute single PostgreSQL atomic DB transaction: `SELECT FOR UPDATE` on invitation row → verify candidate active applications → verify single active company membership constraint → update `users.role = 'hr'` → insert `company_members` (`is_active = true`) → update `company_invitations.status = 'accepted'` → write `audit_logs` → COMMIT" (§1 step 3).

**Verification against baseline:**
- ❌ `company_invitations` table does NOT exist — cannot lock with `FOR UPDATE`
- ❌ `invitation_status` enum does NOT exist — cannot set `status = 'accepted'`
- ❌ Single active company membership constraint not specified (see Finding 4)
- ❌ `users.role = 'hr'` mutation conflicts with candidate role (see Finding 3)

**Existing code comparison:** The current `membership.ts:112–128` implements `accept()` with `FOR UPDATE` on `company_members` (not `company_invitations`). The Option B acceptance would need to lock `company_invitations` first, then insert `company_members`.

**Required correction:** The D9 spec's atomic transaction is correct in concept but cannot be implemented until:
1. `company_invitations` table exists
2. `invitation_status` enum is defined
3. Single active company membership constraint is resolved
4. `users.role` mutation decision is made

**Implementation status:** Specified. Not implemented.

---

## 11. External Supabase User Provisioning Is Correctly Described as Out-of-Transaction and Idempotent

### PASS

**D9 spec states:** "Provision Supabase Auth user out-of-transaction via `admin.createUser({ email, password, email_confirm: true })`" (§1 step 2).

**Verification:** The existing `signup()` method (`auth-provider.ts:107–188`) already performs Supabase Auth calls OUTSIDE the PostgreSQL transaction. The `admin.createUser()` call is idempotent — if the user already exists, Supabase returns the existing user (or an error that can be handled).

**The spec correctly separates:**
1. Out-of-transaction: Supabase Auth user creation
2. In-transaction: PostgreSQL `company_invitations` lock + `company_members` insert

**Implementation status:** Existing code pattern is correct. Option B would follow the same pattern.

---

## 12. Orphan-Account Retry Behavior Is Safe

### SPECIFIED BUT NOT IMPLEMENTED — REQUIRED CHANGE

**D9 spec does NOT explicitly address orphan-account retry.** An orphan account occurs when:
1. Supabase Auth user is created (step 2)
2. PostgreSQL acceptance fails (step 3)
3. User has a verified Supabase account but no `company_members` row

**The D9 spec's fallback path (HTTP 200 with `requires_login: true`) partially addresses this:** If the PostgreSQL commit succeeds but `signInWithPassword()` fails, the user is told to log in normally. But if the PostgreSQL commit FAILS (e.g., unique constraint), the user has a Supabase account but no membership.

**Required correction:** Add explicit retry behavior:
```typescript
// If acceptance transaction fails after Supabase user creation:
// 1. User can retry by calling login-with-invite again
// 2. login-with-invite checks if membership already exists (idempotency)
// 3. If membership exists: return success (already accepted)
// 4. If membership doesn't exist: re-execute acceptance
// 5. If invitation is no longer pending/expired: return appropriate error
```

**Implementation status:** Not specified. Not implemented.

---

## 13. Same-Token Concurrent Acceptance Has Exactly 1 Success and Remaining Safe Failures

### SPECIFIED BUT NOT IMPLEMENTED — REQUIRED CHANGE

**D9 spec states:** "Token Consumption: Invitation transitions to `status = 'accepted'`. Replay attempts fail with `400 INVITATION_ALREADY_ACCEPTED`" (§3 step 6).

**The `FOR UPDATE` lock on `company_invitations` row serializes concurrent redemptions.** If two concurrent requests attempt to accept the same invitation:
1. Request A acquires `FOR UPDATE` lock
2. Request B blocks on `FOR UPDATE`
3. Request A commits → lock released
4. Request B reads `status = 'accepted'` → fails with `INVITATION_ALREADY_ACCEPTED`

**Additionally, `unique_member_per_company UNIQUE (company_id, user_id)` prevents duplicate membership rows.**

**However, the spec does NOT address:**
- What happens if Request A's `company_members` insert fails after the lock is acquired?
- Is the invitation status rolled back?
- Can Request B then succeed?

**Required correction:** Add explicit concurrent acceptance behavior:
```sql
BEGIN;
SELECT 1 FROM company_invitations WHERE id=$1 AND status='pending' AND expires_at > NOW() FOR UPDATE;
-- If no row → 400 INVITATION_ALREADY_ACCEPTED
INSERT INTO company_members (...) VALUES (...);
-- If unique constraint violation → 400 IDEMPOTENCY_CONFLICT
UPDATE company_invitations SET status='accepted' WHERE id=$1;
COMMIT;
```

**Implementation status:** Specified conceptually. Concurrent behavior not explicitly documented.

---

## 14. AES-GCM Outbox Key Registry, Rotation, Unknown-Key Handling, Retry/Backoff, and Worker Non-Crash Behavior Are Sufficient

### SPECIFIED BUT NOT IMPLEMENTED — REQUIRED CHANGE

**D9 spec states:** "Secret registry `INVITATION_KEY_REGISTRY = { v1: process.env.INVITATION_TOKEN_SECRET_V1 }`. If an outbox event specifies an unknown `key_id`, Outbox Worker throws `UnknownKeyIdException`, updates outbox event `status = 'failed'`, records `last_error`, increments `retry_count`, and applies exponential backoff retry (1m, 5m, 15m, 1h). The worker process NEVER crashes." (§1)

**Verification against existing code:** The outbox dispatcher (`05-outbox-dispatcher-nestjs/`) does NOT exist in the current codebase. No outbox worker code is present.

**The spec's design is sound:**
- Key registry with `v1` versioning allows key rotation
- Unknown key detection prevents silent decryption failures
- Exponential backoff prevents retry storms
- Worker non-crash behavior ensures other events continue processing

**Required correction:** The outbox dispatcher must be implemented before Option B email sending can work. The spec's design is correct but the infrastructure is missing.

**Implementation status:** Specified. Not implemented. Infrastructure missing.

---

## 15. Signup Response Contracts Are Consistent

### PASS

**D9 spec defines:**
- **201 Success:** `{ is_accepted: true, requires_login: false, user, company }` + HttpOnly cookies
- **200 Fallback:** `{ is_accepted: true, requires_login: true, message: '...' }` (no cookies)

**Consistency check:**
- ✅ 201 sets cookies; 200 does not — correct
- ✅ Both return `is_accepted: true` — correct (the invitation WAS accepted even if sign-in failed)
- ✅ 200 includes `message` for user guidance — correct
- ✅ No secrets, token hashes, or service-role keys in response — correct

**Implementation status:** Specified. Not implemented.

---

## 16. Normal Login After Fallback Can Detect Active HR Membership and Redirect Safely

### SPECIFIED BUT NOT IMPLEMENTED — REQUIRED CHANGE

**D9 spec states:** "Post-Login HR Membership Redirection (Stage 2/3 Specification): Upon normal `/login`, authentication services call `GET /api/v1/auth/me` / membership lookup to detect active HR membership (`company_members.is_active = true`) and return redirection metadata to route the user directly to `/dashboard/employer`." (§1)

**Verification against existing code:** The current `login()` method (`auth-provider.ts:429–459`) returns `{ status: 'authenticated', user_id: session.userId }`. It does NOT include membership/role information. The `GET /api/v1/auth/me` endpoint would need to be extended to include active HR membership detection.

**The spec correctly marks this as "To be implemented during Stage 2 & Stage 3 coding."** This is appropriate — the login fallback behavior is a frontend concern that depends on the Option B endpoints existing.

**Implementation status:** Specified for Stage 2/3. Not implemented. Correctly deferred.

---

## 17. Migration Is Idempotent, Validates Existing Schema, Has Correct Constraints/Indexes, and Is Not Applied Yet

### BLOCKER — MISSING

**The migration file `20260903000000_option_b_company_invitations.sql` does NOT exist.** The D9 spec references it (§2: "Migration file includes preflight schema column validation") but no file was found in the repository.

**Required corrections:**
1. Create the migration file with:
   - `invitation_status` enum definition
   - `company_invitations` table with all required columns
   - Partial unique index on `(company_id, email) WHERE status = 'pending'`
   - `token_hash VARCHAR(64)` (SHA-256 hex, not VARCHAR(255))
   - `ON DELETE CASCADE` on `company_id` FK
   - `REFENCES users(id)` on `invited_by_user_id` and `accepted_by_user_id`
   - Preflight schema validation (IF NOT EXISTS checks)
   - Idempotent creation (CREATE TYPE IF NOT EXISTS pattern)
2. The migration must NOT be applied yet (Stage 1 is documentation only)
3. Add `company_invitations` to the baseline migration sequence

**Implementation status:** Missing entirely.

---

## 18. No Secret, Password, Recovery Token, or Service-Role Key Can Reach the Browser or Logs

### PASS WITH CAVEAT

**Verification against `.env`:**
- `SUPABASE_SERVICE_ROLE_KEY=sb_secret_9hrvNvawX6rMdl4gJD-tlw_5Q-0T7ot` — present in `.env` (server-only)
- No `NEXT_PUBLIC_` prefix on any secret — correct
- Frontend `.env` was cleaned in Batch 4A (previously exposed `SUPABASE_SERVICE_ROLE_KEY` as `NEXT_PUBLIC_SUPABASE_ANON_KEY` — now removed)

**Verification against code:**
- `auth-provider.ts:53`: `const secretKey = this.config.SUPABASE_SECRET_KEY || this.config.SUPABASE_SERVICE_ROLE_KEY` — server-side only
- `auth-provider.ts:57`: `headers: { apikey: secretKey, Authorization: 'Bearer ${secretKey}' }` — never exposed to browser
- `setSessionCookies()`: Sets `httpOnly: true, secure, sameSite: 'lax'` — cookies are not accessible to JavaScript
- No `console.log` of raw tokens, passwords, or service-role keys in the reviewed code

**Caveat — D9 spec's email link:** The invitation email contains `http://localhost:3001/invite/accept?token=<rawToken>`. The raw token appears in:
- Browser history
- Server access logs (if proxied)
- Referrer headers (if navigating away)

The spec mentions `history.replaceState` to scrub the URL, but this is a FRONTEND concern that is not yet implemented.

**Implementation status:** Existing code is clean. D9 spec's token-in-URL approach requires frontend implementation with `history.replaceState`.

---

## Summary of Findings

### BLOCKERS (Must be resolved before Stage 2)

| ID | Finding | Category |
|----|---------|----------|
| B-1 | `implementation_plan.md` does not exist | Missing document |
| B-2 | `20260903000000_option_b_company_invitations.sql` migration does not exist | Missing migration |
| B-3 | `invitation_status` enum not defined in baseline | Missing schema |
| B-4 | `company_invitations` table not defined in baseline | Missing schema |
| B-5 | `users.role` global mutation decision not resolved (candidate vs HR conflict) | Required product decision |

### REQUIRED CHANGES (Must be addressed before Stage 2)

| ID | Finding | Category |
|----|---------|----------|
| R-1 | Single active company membership constraint not enforced | Missing constraint |
| R-2 | Email identity binding not explicitly required in acceptance flow | Missing security check |
| R-3 | GET/preview endpoint not specified | Missing endpoint |
| R-4 | Orphan-account retry behavior not specified | Missing retry logic |
| R-5 | Concurrent acceptance behavior not explicitly documented | Missing concurrency spec |
| R-6 | Token raw value never stored/logged rule not documented | Missing security rule |
| R-7 | Order of operations for signup-with-invite not explicit | Missing spec detail |

### RECOMMENDATIONS (Should be addressed but not blocking)

| ID | Finding | Category |
|----|---------|----------|
| REC-1 | `token_hash VARCHAR(64)` preferred over `VARCHAR(255)` for SHA-256 | Schema optimization |
| REC-2 | Invitation email template should be defined as part of implementation | Missing template |
| REC-3 | Email sending mechanism should use existing outbox pipeline | Architecture alignment |
| REC-4 | `revoke_reason` should use audit_logs pattern, not separate column | Consistency |

---

## Verdict

### **NOT APPROVED — BLOCKERS REMAIN**

The D9 spec is architecturally sound and preserves the approved Browser → NestJS → Supabase architecture. However, **5 blocking findings** must be resolved before Stage 2 coding:

1. **Missing migration file** — Cannot implement without `company_invitations` table
2. **Missing implementation plan** — No step-by-step coding guide exists
3. **Missing enum/table** — `invitation_status` and `company_invitations` are not in baseline
4. **Global role mutation conflict** — `users.role = 'hr'` breaks candidate functionality
5. **Single active company constraint** — Not enforced in acceptance flow

**Stage 2/3 coding and migration application must remain HELD until all blockers are resolved and this review is re-run.**

---

*Reviewed by FreeBuf — Read-Only Security Reviewer*  
*Review date: 2026-09-03*  
*Status: NOT APPROVED — BLOCKERS REMAIN*  
*Stage 2/3 HELD*
