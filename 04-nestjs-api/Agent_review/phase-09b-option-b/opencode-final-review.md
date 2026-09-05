# OpenCode — Option B HR Invite-First Stage 1 Final Re-Review

**Reviewer:** OpenCode (Read-Only Architecture Reviewer)  
**Date:** 2026-09-03  
**Scope:** Frozen Stage 1 Option B HR Invite-First design — D9 contract decisions, migration file, implementation plan, baseline DB schema, existing auth/membership code  
**Status:** **NOT APPROVED — BLOCKERS REMAIN**  
**Review path:** `04-nestjs-api/Agent_review/phase-09b-option-b/opencode-final-review.md`

---

## 0. Review Method

This review independently verifies the same 18 mandatory verification points as FreeBuf, focusing on architecture, contract consistency, and implementation readiness. Cross-references FreeBuf findings for consistency.

---

## 1. Browser → Next.js → NestJS → Supabase Architecture Preserved

### PASS

The D9 spec maintains the approved architecture chain. All new endpoints route through NestJS:
- `POST /api/v1/companies/:companyId/invitations` → NestJS → PostgreSQL
- `POST /api/v1/auth/signup-with-invite` → NestJS → Supabase Auth → PostgreSQL
- `POST /api/v1/auth/login-with-invite` → NestJS → Supabase Auth → PostgreSQL

No browser-to-Supabase direct writes. No service-role key in frontend. Supabase Auth calls use `admin.createUser()` and `signInWithPassword()` — both server-side.

**Implementation status:** Specified. Not implemented.

---

## 2. HR Public Signup Disabled; Only Verified Owner/Admin Can Invite

### PASS

**Existing code evidence:**
- `SignupDto.register_as` validated by `@IsIn(['candidate', 'employer'])` (`auth-provider.ts:272`)
- `assertAdmin()` guard (`membership.ts:39–44`) checks `owner_id` or `is_primary_hr`/`manage_company`
- Master prompt: "Public signup must never allow: hr, admin"

**D9 spec alignment:** The invitation endpoint requires owner/admin authorization. No unauthenticated path exists.

**Implementation status:** Existing code (Option A) enforces this. Option B would reuse the same guard.

---

## 3. User Cannot Be Candidate and HR Simultaneously

### BLOCKER — REQUIRED PRODUCT DECISION

**Same finding as FreeBuf B-5.** The D9 spec explicitly says "update `users.role = 'hr'`" during acceptance. The `users.role` field is a single-value enum (`02_enums.sql:61–66`), not a per-company role.

**Two options:**

| Option | Description | Consequence |
|--------|-------------|-------------|
| (a) Global role mutation | `users.role` changes to `'hr'` at acceptance | User loses candidate capabilities (cannot apply to jobs) |
| (b) Per-company role only | `users.role` unchanged; HR scoped via `company_members` | User can be both candidate and HR across companies |

**Recommendation:** Option (b) is safer and more flexible. The master prompt says "Role assignment happens after successful Supabase account creation" — this should be the per-company membership role, not a global user role mutation.

**Implementation status:** Not resolved. Must be decision D9-a or D9-b before Stage 2.

---

## 4. One HR Can Have Only One Active Company Membership

### REQUIRED CHANGE

**Same finding as FreeBuf R-1.** The existing `unique_member_per_company UNIQUE (company_id, user_id)` (`04_companies.sql:297`) prevents duplicate membership within ONE company, but does NOT prevent a user from being active in MULTIPLE companies.

**The D9 spec's atomic acceptance transaction does NOT include:**
```sql
-- Check: user has no other active company_members row
SELECT 1 FROM company_members WHERE user_id=$1 AND is_active=true AND company_id <> $2;
```

**If single-active-company is required:** Add this check to the acceptance transaction.
**If multi-company is permitted:** Document this as an explicit decision.

**Implementation status:** Not specified. Not enforced.

---

## 5. Token Is Cryptographically Random, Hashed in DB, Never Logged/Stored in Plaintext, and Scrubbed from URL

### SPECIFIED BUT INCOMPLETE — REQUIRED CHANGE

**D9 spec describes:**
- Token generation via AES-256 encrypted outbox payload
- `token_hash` stored in `company_invitations` table
- URL scrubbing via `history.replaceState`

**Missing:**
1. No code exists for token generation, hashing, or storage
2. No explicit rule that raw token is never written to DB, audit log, or outbox payload
3. No grep gate for token leakage detection
4. `token_hash` column length not specified (should be `VARCHAR(64)` for SHA-256 hex)

**Required implementation rule:**
```typescript
const rawToken = crypto.randomBytes(32).toString('base64url');
const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
// rawToken → email only. tokenHash → database only.
```

**Implementation status:** Specified conceptually. No code.

---

## 6. GET/Preview Never Activates or Consumes Invitation

### SPECIFIED BUT NOT IMPLEMENTED — REQUIRED CHANGE

**Same finding as FreeBuf R-3.** The D9 spec says "Link open / GET request NEVER activates membership or consumes token" but provides no GET/preview endpoint.

**Without a preview endpoint:**
- User sees generic signup/login form with no context
- All invitation context must be in the email body
- No pre-validation of token before form submission

**Options:**
- (a) Add `GET /api/v1/invitations/preview?token=<raw>` — returns company name, inviter, role, email, expiry
- (b) Include all context in invitation email body

**Implementation status:** Not specified. Not implemented.

---

## 7. Token Validation Checks Hash, Pending Status, Expiry, Revocation, and Normalized Email

### SPECIFIED BUT NOT IMPLEMENTED — REQUIRED CHANGE

**D9 spec states:** "Validate raw token (SHA-256 hash matches `token_hash`, `status = 'pending'`, `expires_at > NOW()`, not revoked, email matches `invitation.email`)" (§1 step 1).

**Critical gap — email identity binding:** The spec says "email matches `invitation.email`" but does NOT specify that the AUTHENTICATED USER's email must match. The `company_members.user_id` comes from JWT `sub`, not from email. Without explicit email binding:
1. Attacker obtains token link
2. Creates account with different email
3. Logs in with their own email
4. Accepts invitation intended for someone else

**Required correction:**
```typescript
const user = await client.query('SELECT email FROM users WHERE id=$1', [userId]);
const invitation = await client.query('SELECT email FROM company_invitations WHERE token_hash=$1', [tokenHash]);
if (user.rows[0].email.toLowerCase() !== invitation.rows[0].email.toLowerCase()) {
    throw new ForbiddenException('FORBIDDEN');
}
```

**Implementation status:** Specified conceptually. Email identity binding not explicitly required.

---

## 8. New-User Signup and Existing-User Login Paths Are Unambiguous

### PASS

**D9 spec clearly defines:**
- **Path A (New User):** `POST /api/v1/auth/signup-with-invite` `{ token, password, full_name }` — creates account + accepts invitation
- **Path B (Existing User):** `POST /api/v1/auth/login-with-invite` `{ token, email, password }` — authenticates + accepts invitation

**No overlap.** Path A uses `admin.createUser()`. Path B uses `signInWithPassword()`. The paths are mutually exclusive by design.

**Implementation status:** Specified. Not implemented.

---

## 9. New-User Flow Sets email_confirm=true Only After All Token Checks

### SPECIFIED BUT NOT IMPLEMENTED — REQUIRED CHANGE

**D9 spec states:** "provisions account with `email_confirm: true`" (§3 step 4 Path A).

**Order of operations concern:** The spec lists:
1. Validate token
2. Provision Supabase Auth user with `email_confirm: true`
3. Execute atomic acceptance

If step 2 succeeds but step 3 fails (e.g., unique constraint, single-active-company violation), the user has a verified Supabase account but no `company_members` row. This is acceptable behavior but must be documented.

**Required correction:** Add explicit ordering and failure handling:
```typescript
// Step 1: Validate token (read-only check, no mutation)
// Step 2: Provision Supabase Auth user (out-of-transaction, idempotent)
// Step 3: Execute atomic acceptance (FOR UPDATE + insert)
// On step 3 failure: user exists but has no membership; can retry via login-with-invite
```

**Implementation status:** Specified conceptually. Order not explicit.

---

## 10. PostgreSQL Acceptance Updates Role, Invitation Status, Membership, and Audit Record Atomically with FOR UPDATE

### SPECIFIED BUT NOT IMPLEMENTED — REQUIRED CHANGE

**D9 spec states:** "Execute single PostgreSQL atomic DB transaction: `SELECT FOR UPDATE` on invitation row → verify candidate active applications → verify single active company membership constraint → update `users.role = 'hr'` → insert `company_members` (`is_active = true`) → update `company_invitations.status = 'accepted'` → write `audit_logs` → COMMIT" (§1 step 3).

**Issues:**
1. ❌ `company_invitations` table does NOT exist — cannot lock with `FOR UPDATE`
2. ❌ `invitation_status` enum does NOT exist — cannot set `status = 'accepted'`
3. ❌ Single active company membership constraint not in spec (see Finding 4)
4. ❌ `users.role = 'hr'` mutation conflicts with candidate role (see Finding 3)

**Existing code comparison:** `membership.ts:112–128` uses `FOR UPDATE` on `company_members`. Option B would lock `company_invitations` first, then insert `company_members`.

**Required correction:** The spec's atomic transaction is correct in concept but cannot be implemented until schema prerequisites exist.

**Implementation status:** Specified. Not implemented.

---

## 11. External Supabase User Provisioning Is Correctly Described as Out-of-Transaction and Idempotent

### PASS

**D9 spec states:** "Provision Supabase Auth user out-of-transaction via `admin.createUser({ email, password, email_confirm: true })`" (§1 step 2).

**Verification:** The existing `signup()` method (`auth-provider.ts:107–188`) performs Supabase Auth calls OUTSIDE the PostgreSQL transaction. `admin.createUser()` is idempotent — if user exists, Supabase returns existing user or error.

**The spec correctly separates:**
1. Out-of-transaction: Supabase Auth user creation
2. In-transaction: PostgreSQL `company_invitations` lock + `company_members` insert

**Implementation status:** Existing code pattern is correct. Option B follows same pattern.

---

## 12. Orphan-Account Retry Behavior Is Safe

### SPECIFIED BUT NOT IMPLEMENTED — REQUIRED CHANGE

**Same finding as FreeBuf R-4.** An orphan account occurs when:
1. Supabase Auth user created (step 2)
2. PostgreSQL acceptance fails (step 3)
3. User has verified Supabase account but no `company_members` row

**D9 spec's fallback path (HTTP 200 with `requires_login: true`) partially addresses this** for the `signInWithPassword()` failure case. But if the PostgreSQL commit FAILS, the user has a Supabase account but no membership.

**Required correction:** Add explicit retry behavior:
```typescript
// If acceptance transaction fails after Supabase user creation:
// 1. User can retry via login-with-invite
// 2. login-with-invite checks if membership already exists (idempotency)
// 3. If membership exists: return success
// 4. If membership doesn't exist: re-execute acceptance
// 5. If invitation expired/revoked: return appropriate error
```

**Implementation status:** Not specified. Not implemented.

---

## 13. Same-Token Concurrent Acceptance Has Exactly 1 Success and Remaining Safe Failures

### SPECIFIED BUT NOT IMPLEMENTED — REQUIRED CHANGE

**D9 spec states:** "Token Consumption: Invitation transitions to `status = 'accepted'`. Replay attempts fail with `400 INVITATION_ALREADY_ACCEPTED`" (§3 step 6).

**The `FOR UPDATE` lock serializes concurrent redemptions:**
1. Request A acquires lock → commits → membership created
2. Request B blocks → reads `status = 'accepted'` → fails with `INVITATION_ALREADY_ACCEPTED`

**Additionally, `unique_member_per_company` prevents duplicate membership rows.**

**Gap:** The spec does NOT address what happens if Request A's `company_members` insert fails after the lock is acquired. Is the invitation status rolled back? Can Request B then succeed?

**Required correction:** Add explicit concurrent acceptance behavior:
```sql
BEGIN;
SELECT 1 FROM company_invitations WHERE id=$1 AND status='pending' AND expires_at > NOW() FOR UPDATE;
-- If no row → 400 INVITATION_ALREADY_ACCEPTED
INSERT INTO company_members (...) VALUES (...);
-- If unique constraint → 400 IDEMPOTENCY_CONFLICT
UPDATE company_invitations SET status='accepted' WHERE id=$1;
COMMIT;
```

**Implementation status:** Specified conceptually. Concurrent behavior not explicit.

---

## 14. AES-GCM Outbox Key Registry, Rotation, Unknown-Key Handling, Retry/Backoff, and Worker Non-Crash Behavior Are Sufficient

### SPECIFIED BUT NOT IMPLEMENTED — REQUIRED CHANGE

**D9 spec states:** "Secret registry `INVITATION_KEY_REGISTRY = { v1: process.env.INVITATION_TOKEN_SECRET_V1 }`. If an outbox event specifies an unknown `key_id`, Outbox Worker throws `UnknownKeyIdException`, updates outbox event `status = 'failed'`, records `last_error`, increments `retry_count`, and applies exponential backoff retry (1m, 5m, 15m, 1h). The worker process NEVER crashes." (§1)

**Verification:** The outbox dispatcher (`05-outbox-dispatcher-nestjs/`) does NOT exist in the current codebase. No outbox worker code is present.

**The spec's design is sound:**
- Key registry with versioning allows rotation
- Unknown key detection prevents silent failures
- Exponential backoff prevents retry storms
- Worker non-crash ensures other events continue

**Required correction:** The outbox dispatcher must be implemented before Option B email sending can work.

**Implementation status:** Specified. Not implemented. Infrastructure missing.

---

## 15. Signup Response Contracts Are Consistent

### PASS

**D9 spec defines:**
- **201 Success:** `{ is_accepted: true, requires_login: false, user, company }` + HttpOnly cookies
- **200 Fallback:** `{ is_accepted: true, requires_login: true, message: '...' }` (no cookies)

**Consistency check:**
- ✅ 201 sets cookies; 200 does not
- ✅ Both return `is_accepted: true` (invitation WAS accepted)
- ✅ 200 includes `message` for user guidance
- ✅ No secrets in response

**Implementation status:** Specified. Not implemented.

---

## 16. Normal Login After Fallback Can Detect Active HR Membership and Redirect Safely

### SPECIFIED BUT NOT IMPLEMENTED — CORRECTLY DEFERRED

**D9 spec states:** "Post-Login HR Membership Redirection (Stage 2/3 Specification): Upon normal `/login`, authentication services call `GET /api/v1/auth/me` / membership lookup to detect active HR membership (`company_members.is_active = true`) and return redirection metadata to route the user directly to `/dashboard/employer`." (§1)

**Verification:** The current `login()` method (`auth-provider.ts:429–459`) returns `{ status: 'authenticated', user_id: session.userId }`. It does NOT include membership/role information.

**The spec correctly marks this as "To be implemented during Stage 2 & Stage 3 coding."** This is appropriate — the login fallback behavior depends on Option B endpoints existing.

**Implementation status:** Specified for Stage 2/3. Correctly deferred.

---

## 17. Migration Is Idempotent, Validates Existing Schema, Has Correct Constraints/Indexes, and Is Not Applied Yet

### BLOCKER — MISSING

**Same finding as FreeBuf B-2.** The migration file `20260903000000_option_b_company_invitations.sql` does NOT exist.

**Required contents:**
```sql
-- 1. invitation_status enum (CREATE TYPE IF NOT EXISTS pattern)
CREATE TYPE invitation_status AS ENUM (
    'pending', 'accepted', 'expired', 'revoked', 'superseded'
);

-- 2. company_invitations table
CREATE TABLE company_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    email CITEXT NOT NULL,
    invited_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    role user_role NOT NULL DEFAULT 'hr',
    token_hash VARCHAR(64) NOT NULL UNIQUE,  -- SHA-256 hex
    status invitation_status NOT NULL DEFAULT 'pending',
    branch_id UUID,
    department_id UUID,
    team_id UUID,
    permissions JSONB,
    is_primary_hr BOOLEAN NOT NULL DEFAULT false,
    expires_at TIMESTAMPTZ NOT NULL,
    accepted_at TIMESTAMPTZ,
    accepted_by_user_id UUID REFERENCES users(id),
    revoked_at TIMESTAMPTZ,
    revoked_by_user_id UUID REFERENCES users(id),
    revoke_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Partial unique index
CREATE UNIQUE INDEX idx_company_invitations_pending_unique
    ON company_invitations(company_id, email)
    WHERE status = 'pending';

-- 4. Preflight schema validation
-- (IF company_invitations exists, verify columns)
```

**Implementation status:** Missing entirely.

---

## 18. No Secret, Password, Recovery Token, or Service-Role Key Can Reach the Browser or Logs

### PASS WITH CAVEAT

**Verification:**
- `.env` line 15: `SUPABASE_SERVICE_ROLE_KEY=sb_secret_...` — server-only, no `NEXT_PUBLIC_` prefix
- `auth-provider.ts:53–57`: Uses `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY` server-side only
- `setSessionCookies()`: `httpOnly: true, secure, sameSite: 'lax'` — not accessible to JS
- No `console.log` of raw tokens, passwords, or service-role keys

**Caveat — D9 spec's email link:** The invitation email contains `http://localhost:3001/invite/accept?token=<rawToken>`. The raw token appears in browser history, server logs, and referrer headers. The spec mentions `history.replaceState` but this is a frontend concern not yet implemented.

**Implementation status:** Existing code is clean. D9 spec's token-in-URL requires frontend `history.replaceState`.

---

## Cross-Reference with FreeBuf Findings

| FreeBuf ID | FreeBuf Finding | OpenCode Assessment |
|------------|-----------------|---------------------|
| B-1 | `implementation_plan.md` missing | AGREE — Required for Stage 2 |
| B-2 | Migration file missing | AGREE — Critical blocker |
| B-3 | `invitation_status` enum missing | AGREE — Schema prerequisite |
| B-4 | `company_invitations` table missing | AGREE — Schema prerequisite |
| B-5 | `users.role` mutation conflict | AGREE — Must be decision D9-a/b |
| R-1 | Single active company constraint | AGREE — Missing from spec |
| R-2 | Email identity binding | AGREE — Critical security gap |
| R-3 | GET/preview endpoint | AGREE — Missing from spec |
| R-4 | Orphan-account retry | AGREE — Missing from spec |
| R-5 | Concurrent acceptance behavior | AGREE — Not explicit enough |
| R-6 | Token raw value never stored | AGREE — Missing security rule |
| R-7 | Order of operations | AGREE — Not explicit enough |

---

## Verdict

### **NOT APPROVED — BLOCKERS REMAIN**

The D9 spec is architecturally sound and preserves the approved Browser → NestJS → Supabase architecture. The response contracts are consistent. The out-of-transaction Supabase provisioning is correctly specified. The atomic acceptance transaction with `FOR UPDATE` is correct in concept.

However, **5 blocking findings** must be resolved before Stage 2 coding:

1. **Missing migration file** — Cannot implement without `company_invitations` table
2. **Missing implementation plan** — No step-by-step coding guide exists
3. **Missing enum/table** — `invitation_status` and `company_invitations` are not in baseline
4. **Global role mutation conflict** — `users.role = 'hr'` breaks candidate functionality
5. **Single active company constraint** — Not enforced in acceptance flow

Additionally, **7 required changes** must be addressed:
- Email identity binding
- GET/preview endpoint
- Orphan-account retry behavior
- Concurrent acceptance documentation
- Token raw value never stored rule
- Order of operations explicitness
- Token hash column length

**Stage 2/3 coding and migration application must remain HELD until all blockers are resolved and this review is re-run.**

---

*Reviewed by OpenCode — Read-Only Architecture Reviewer*  
*Review date: 2026-09-03*  
*Status: NOT APPROVED — BLOCKERS REMAIN*  
*Stage 2/3 HELD*
