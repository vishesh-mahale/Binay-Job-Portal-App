# OpenCode — Option B HR Invite-First Stage 1 Final Re-Review v2

**Reviewer:** OpenCode (Read-Only Architecture Reviewer)  
**Date:** 2026-09-03  
**Scope:** Frozen Stage 1 Option B HR Invite-First design — D9 contract decisions, migration file, baseline DB schema, existing auth/membership code  
**Status:** **APPROVED FOR STAGE 2**  
**Review path:** `04-nestjs-api/Agent_review/phase-09b-option-b/opencode-final-review-v2.md`

---

## 0. Review Method

Independent verification of 19 mandatory verification points against the frozen Stage 1 documentation and existing codebase. Final product decisions are CLOSED per user instruction. Stage 2/3 implementation gates are intentionally held and are NOT classified as missing blockers. Cross-references FreeBuf findings for consistency.

---

## 1. Browser → Next.js → NestJS → Supabase Architecture Preserved

### PASS

The D9 spec maintains the approved architecture chain. All new endpoints route through NestJS:
- `POST /api/v1/companies/:companyId/invitations` → NestJS → PostgreSQL
- `POST /api/v1/auth/signup-with-invite` → NestJS → Supabase Auth → PostgreSQL
- `POST /api/v1/auth/login-with-invite` → NestJS → Supabase Auth → PostgreSQL

No browser-to-Supabase direct writes. No service-role key in frontend. Supabase Auth calls use `admin.createUser()` and `signInWithPassword()` — both server-side. The master prompt architecture invariant is preserved.

**Implementation status:** Specified. Not implemented (Stage 2/3 gate).

---

## 2. HR Public Signup Disabled

### PASS

**Already implemented/proven.** `SignupDto.register_as` validated by `@IsIn(['candidate', 'employer'])` (`auth-provider.ts:272`). Public signup rejects `hr` and `admin` roles at HTTP 400. The master prompt states: "Public signup must never allow: hr, admin."

**D9 spec alignment:** The invitation endpoint requires owner/admin authorization. No unauthenticated path exists.

---

## 3. Only Verified Company Owner/Platform Admin Can Invite

### PASS

**Already implemented/proven (Option A).** `assertAdmin()` (`membership.ts:39–44`) verifies `owner_id` or `is_primary_hr`/`manage_company` permission, plus `verification_status='verified'` and `deleted_at IS NULL`.

**D9 spec alignment:** "Verified Owner/Admin calls `POST /api/v1/companies/:id/invitations`" — consistent with existing guard. Option B invitation endpoint reuses the same authorization pattern.

---

## 4. Token Generation, SHA-256 Hash Storage, Expiry, Revocation, Replay Prevention, URL Scrubbing, No Plaintext Token Logging/Storage

### PASS (Stage 1 design artifact exists)

**Migration file specifies:**
- `token_hash VARCHAR(64) NOT NULL UNIQUE` — SHA-256 hex, correct length
- `expires_at TIMESTAMPTZ NOT NULL` — expiry field
- `status invitation_status NOT NULL DEFAULT 'pending'` — lifecycle state machine with `pending`, `accepted`, `expired`, `revoked`
- `revoked_at`, `revoked_by_user_id`, `revoke_reason` — revocation fields
- `accepted_at`, `accepted_by_user_id` — acceptance fields

**D9 spec states:**
- "Outbox worker decrypts AES-256 payload in memory" — raw token never stored in DB
- "Next.js immediately scrubs raw token from URL (`history.replaceState`)" — URL scrubbing
- "raw tokens, hashes, passwords, or Supabase service keys are NEVER returned in JSON"

**Implementation status:** Specified. Not implemented (Stage 2/3 gate — cryptographic token generation, outbox worker, frontend URL scrubbing are Stage 2/3 gates per D9 §1.5).

---

## 5. GET/Preview Never Consumes or Activates an Invitation

### PASS

**D9 spec (§1.4):** "GET preview link is optional. The invitation email carries company/inviter context in the email body. Opening an invite link (`GET /invite/accept?token=...`) MUST NEVER consume or activate the token. Activation occurs ONLY upon deliberate POST submit."

**No GET/preview endpoint is defined.** The email body carries all context. This is a valid design choice — the GET boundary is enforced by not having a consuming GET endpoint.

**Implementation status:** Specified. Not implemented (Stage 2/3 gate — frontend URL handling).

---

## 6. Authenticated JWT User Email Must Match invitation.email Using Normalized Case-Insensitive Comparison

### PASS

**D9 spec (§1.2):** "Acceptance verification compares the authenticated JWT user's database email against `company_invitations.email` using case-insensitive normalization: `LOWER(TRIM(auth_user.email)) = LOWER(TRIM(company_invitations.email))`. Client-supplied request-body email alone is strictly insufficient for identity validation."

**Migration schema supports this:** `email CITEXT NOT NULL` — CITEXT provides case-insensitive comparison at the DB level.

**Implementation status:** Specified. Not implemented (Stage 2/3 gate — NestJS acceptance service).

---

## 7. New-User Signup and Existing-User Login Paths Are Unambiguous

### PASS

**D9 spec clearly defines two mutually exclusive paths:**
- **Path A (New User):** `POST /api/v1/auth/signup-with-invite` `{ token, password, full_name }` — provisions Supabase Auth user, then executes atomic acceptance
- **Path B (Existing User):** `POST /api/v1/auth/login-with-invite` `{ token, email, password }` — authenticates user, then executes atomic acceptance

**No overlap.** Path A creates a new Supabase Auth user via `admin.createUser()`. Path B authenticates an existing user via `signInWithPassword()`. Mutually exclusive by design.

**Implementation status:** Specified. Not implemented (Stage 2/3 gate — new NestJS endpoints).

---

## 8. email_confirm=true Is Allowed Only After All Token Validations Pass

### PASS

**D9 spec (§4, step 4 Path A):** "NestJS validates token, checks email match, provisions account with `email_confirm: true`, executes atomic acceptance..."

**Order of operations is explicit:**
1. Validate token (SHA-256 hash match, pending status, expiry, revocation)
2. Check email match (`LOWER(TRIM(auth_user.email)) = LOWER(TRIM(company_invitations.email))`)
3. Provision Supabase Auth account with `email_confirm: true` (OUT-of-transaction)
4. Execute atomic PostgreSQL transaction

**`email_confirm=true` is set ONLY after steps 1–2 pass.** The Supabase Auth `admin.createUser()` call happens at step 3, after all token validations.

**Implementation status:** Specified. Not implemented (Stage 2/3 gate).

---

## 9. External Supabase Provisioning Is Correctly Separated from the PostgreSQL Transaction

### PASS

**D9 spec (§4, step 4):** The Supabase Auth `admin.createUser()` call at step 3 is OUTSIDE the PostgreSQL transaction. The atomic PostgreSQL transaction at step 4 is separate.

**Follows master prompt rule:** "External API calls must not occur inside open database transactions."

**The separation is explicit:**
1. Read-only token validation (no mutation)
2. Read-only email match check (no mutation)
3. Supabase Auth user creation (OUT-of-transaction)
4. Atomic PostgreSQL transaction (FOR UPDATE + insert)

**Implementation status:** Specified. Not implemented (Stage 2/3 gate).

---

## 10. PostgreSQL Acceptance Updates Role, Invitation Status, Membership, and Audit Atomically with FOR UPDATE

### PASS

**D9 spec (§4, step 5):** "NestJS locks invitation (`FOR UPDATE`), checks `invitation.status` first (`400 INVITATION_ALREADY_ACCEPTED`), checks candidate active applications (`job_applications` + `candidate_profiles`), checks single active membership constraint, updates `users.role = 'hr'`, inserts `company_members` (`is_active = true`), marks `status = 'accepted'`, and writes audit event in ONE atomic DB transaction."

**All four elements are in the same atomic transaction:**
1. `users.role = 'hr'` — role update
2. `company_invitations.status = 'accepted'` — invitation status update
3. `company_members` insert — membership creation
4. `audit_logs` insert — audit record

**`FOR UPDATE` lock on `company_invitations` row serializes concurrent redemptions.**

**Implementation status:** Specified. Not implemented (Stage 2/3 gate).

---

## 11. One-Active-Membership Conflict Handling Is Deterministic

### PASS

**Migration file enforces this at the DB level:**
```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_company_members_active_user_unique
    ON company_members(user_id)
    WHERE is_active = true;
```

**Migration preflight ensures clean state:**
```sql
DO $$
DECLARE dup_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO dup_count
    FROM (SELECT user_id FROM company_members WHERE is_active = true GROUP BY user_id HAVING COUNT(*) > 1) dups;
    IF dup_count > 0 THEN
        RAISE EXCEPTION 'MIGRATION_BLOCKED: Detected % user(s) with duplicate active memberships...', dup_count;
    END IF;
END $$;
```

**D9 spec (§1.3) specifies ordering:** "On a retry for an already accepted invitation, check `invitation.status` FIRST."

**Deterministic:** The `idx_company_members_active_user_unique` partial unique index prevents any duplicate active membership at the DB level. If the NestJS acceptance transaction attempts to insert a second active membership for the same user, PostgreSQL rejects it with a unique constraint violation.

**Implementation status:** Migration artifact exists (design). Index is idempotent and ready for application.

---

## 12. Retry of Already Accepted Invitation Returns INVITATION_ALREADY_ACCEPTED Before Membership-Conflict Checks

### PASS

**D9 spec (§1.3):** "On a retry for an already accepted invitation, check `invitation.status` FIRST. Return `400 INVITATION_ALREADY_ACCEPTED` BEFORE applying the active-membership conflict check (`USER_ALREADY_ACTIVE_MEMBER_ELSEWHERE`). Repeated retry on an already accepted invitation must remain idempotent and MUST NOT return `USER_ALREADY_ACTIVE_MEMBER_ELSEWHERE` for the same accepted company."

**D9 spec (§4, step 5):** "checks `invitation.status` first (`400 INVITATION_ALREADY_ACCEPTED`)"

**Ordering is explicit:** Status check → `INVITATION_ALREADY_ACCEPTED` → membership conflict check → `USER_ALREADY_ACTIVE_MEMBER_ELSEWHERE`.

**Implementation status:** Specified. Not implemented (Stage 2/3 gate).

---

## 13. Candidate Active-Application Conversion Rule Uses Correct Baseline Table Names

### PASS

**D9 spec (§4, step 5):** "checks candidate active applications (`job_applications` + `candidate_profiles`)"

**Verified against baseline:**
- `job_applications` table exists in `09_applications.sql:50` ✅
- `candidate_profiles` table exists in `08_candidates.sql:46` ✅

**Both table names are correct and exist in the baseline schema.**

**Implementation status:** Specified. Not implemented (Stage 2/3 gate — the actual conversion logic).

---

## 14. Orphan-Account Retry Behavior Is Safe

### PASS

**D9 spec defines two failure scenarios:**

1. **Supabase Auth `signInWithPassword()` network failure after PostgreSQL commit:**
   - Returns `HTTP 200 OK` with `{ is_accepted: true, requires_login: true, message: '...' }`
   - No invalid cookies issued
   - User retries via normal `/login` → HR membership detected → redirect to `/dashboard/employer`

2. **PostgreSQL acceptance transaction failure after Supabase Auth user creation:**
   - Supabase Auth user exists but no `company_members` row
   - User can retry via `login-with-invite` (idempotent — checks invitation status first)
   - If invitation still pending: re-execute acceptance
   - If invitation already accepted: return `INVITATION_ALREADY_ACCEPTED`

**Safe:** The orphan account has a verified Supabase Auth user but no membership. The user can log in normally and retry the invitation acceptance. No data inconsistency.

**Implementation status:** Specified. Not implemented (Stage 2/3 gate).

---

## 15. AES-GCM Outbox Key Registry, Rotation, Unknown-Key Handling, Retry/Backoff, and Worker Non-Crash Behavior

### PASS (Stage 2/3 gate — specified, not implemented)

**D9 spec (§1):** "Secret registry `INVITATION_KEY_REGISTRY = { v1: process.env.INVITATION_TOKEN_SECRET_V1 }`. If an outbox event specifies an unknown `key_id`, Outbox Worker throws `UnknownKeyIdException`, updates outbox event `status = 'failed'`, records `last_error`, increments `retry_count`, and applies exponential backoff retry (1m, 5m, 15m, 1h). The worker process NEVER crashes."

**Design is sound:**
- Key registry with versioning allows rotation
- Unknown key detection prevents silent decryption failures
- Exponential backoff prevents retry storms
- Worker non-crash ensures other events continue processing

**This is explicitly marked as a Stage 2/3 implementation gate in D9 §1.5.** Not a Stage 1 blocker.

---

## 16. Signup Response Contracts: 201 Success with Cookies; 200 Requires_Login Fallback Without Cookies

### PASS

**D9 spec (§2) explicitly defines:**

- **201 Success:** `{ is_accepted: true, requires_login: false, user, company }` + HttpOnly cookies
- **200 Fallback:** `{ is_accepted: true, requires_login: true, message: '...' }` (no cookies)

**Consistency check:**
- ✅ 201 sets cookies; 200 does not
- ✅ Both return `is_accepted: true`
- ✅ 200 includes `message` for user guidance
- ✅ No secrets in response
- ✅ Data privacy guarantee stated

**Implementation status:** Specified. Not implemented (Stage 2/3 gate).

---

## 17. Migration Idempotency, Schema Preflight, Constraints, Indexes, and Trigger Safety

### PASS

**Migration file (`20260903000000_option_b_company_invitations.sql`) verified:**

| Aspect | Implementation | Status |
|--------|---------------|--------|
| **Idempotent enum** | `IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'invitation_status')` | ✅ |
| **Preflight schema guard** | `RAISE EXCEPTION 'MIGRATION_BLOCKED_SCHEMA_MISMATCH'` if `company_invitations` exists but `token_hash` missing | ✅ |
| **Idempotent table** | `CREATE TABLE IF NOT EXISTS company_invitations (...)` | ✅ |
| **Role constraint** | `CHECK (role = 'hr')` | ✅ |
| **Accepted state check** | `(status = 'accepted' AND accepted_at IS NOT NULL AND accepted_by_user_id IS NOT NULL) OR (status != 'accepted' ...)` | ✅ |
| **Revoked state check** | `(status = 'revoked' AND revoked_at IS NOT NULL AND revoked_by_user_id IS NOT NULL) OR (status != 'revoked' ...)` | ✅ |
| **Pending unique index** | `CREATE UNIQUE INDEX IF NOT EXISTS ... WHERE status = 'pending'` | ✅ |
| **Single active membership index** | `CREATE UNIQUE INDEX IF NOT EXISTS ... WHERE is_active = true` | ✅ |
| **Preflight duplicate check** | `RAISE EXCEPTION 'MIGRATION_BLOCKED: Detected % user(s) with duplicate active memberships...'` | ✅ |
| **Idempotent trigger** | `IF NOT EXISTS (...tgname = 'company_invitations_updated_at'...)` | ✅ |
| **FK constraints** | `REFERENCES companies(id) ON DELETE CASCADE`, `REFERENCES users(id) ON DELETE RESTRICT/SET NULL` | ✅ |
| **Token hash length** | `VARCHAR(64)` — correct for SHA-256 hex | ✅ |

**All migration aspects are correct and idempotent.** The migration is intentionally unapplied (Stage 1 design artifact).

---

## 18. Stage 2/3 Implementation Gates Are Clearly Separated from Stage 1 Design

### PASS

**D9 spec (§1.5) explicitly lists Stage 2/3 implementation gates:**
- Cryptographic raw token generation & memory isolation
- Outbox worker AES-256-GCM encrypted payload decryption & Brevo SMTP delivery
- Frontend Next.js URL query token scrubbing (`history.replaceState`)
- Dedicated 5-request parallel HTTP acceptance concurrency tests

**These are correctly categorized as "Stage 2/3 Implementation Gates to be coded and empirically verified during implementation."** They are NOT Stage 1 blockers.

**Stage 1 design is complete:** D9 spec, migration artifact, API contract decisions (D1–D8), and contract freeze worksheet are all frozen. The `implementation_plan.md` is a Stage 2/3 artifact that will be created during implementation.

---

## 19. No Secrets, Passwords, Service-Role Keys, or Raw Invitation Tokens Reach Browser/Logs

### PASS

**Verification against `.env`:**
- `SUPABASE_SERVICE_ROLE_KEY=sb_secret_...` — server-side only, no `NEXT_PUBLIC_` prefix ✅

**Verification against code:**
- `auth-provider.ts:53`: `const secretKey = this.config.SUPABASE_SECRET_KEY || this.config.SUPABASE_SERVICE_ROLE_KEY` — server-side only ✅
- `setSessionCookies()`: `httpOnly: true, secure, sameSite: 'lax'` — not accessible to JS ✅
- No `console.log` of raw tokens, passwords, or service-role keys ✅

**D9 spec guarantee:** "raw tokens, hashes, passwords, or Supabase service keys are NEVER returned in JSON" ✅

**Token-in-URL caveat:** The invitation email contains `http://localhost:3001/invite/accept?token=<rawToken>`. The D9 spec addresses this with `history.replaceState` URL scrubbing (Stage 2/3 gate). The raw token appears transiently in the URL but is immediately scrubbed by the frontend.

---

## Cross-Reference with FreeBuf Findings

| FreeBuf # | FreeBuf Finding | OpenCode Assessment |
|-----------|-----------------|---------------------|
| 1 | Architecture preserved | AGREE — PASS |
| 2 | HR public signup disabled | AGREE — PASS |
| 3 | Owner/admin invite-only | AGREE — PASS |
| 4 | Token security | AGREE — PASS |
| 5 | GET/preview never consumes | AGREE — PASS |
| 6 | Email identity binding | AGREE — PASS |
| 7 | Unambiguous paths | AGREE — PASS |
| 8 | email_confirm ordering | AGREE — PASS |
| 9 | Supabase out-of-transaction | AGREE — PASS |
| 10 | Atomic acceptance | AGREE — PASS |
| 11 | Deterministic membership | AGREE — PASS |
| 12 | Retry ordering | AGREE — PASS |
| 13 | Correct table names | AGREE — PASS |
| 14 | Safe orphan retry | AGREE — PASS |
| 15 | Outbox design | AGREE — PASS |
| 16 | Response contracts | AGREE — PASS |
| 17 | Migration correct | AGREE — PASS |
| 18 | Stage gates separated | AGREE — PASS |
| 19 | No secrets leaked | AGREE — PASS |

**Full agreement between FreeBuf and OpenCode reviews. No discrepancies.**

---

## Summary

### BLOCKERS: 0

No blocking findings. All 19 verification points pass.

### REQUIRED CHANGES: 0

No required changes for Stage 1. The design is complete and sound.

### RECOMMENDATIONS: 0

No recommendations for Stage 1. The migration artifact and D9 spec are comprehensive.

---

## Verdict

### **APPROVED FOR STAGE 2**

The Stage 1 Option B HR Invite-First design is complete, architecturally sound, and ready for Stage 2 coding. All 19 verification points pass:

1. ✅ Architecture preserved
2. ✅ HR public signup disabled
3. ✅ Owner/admin invite-only
4. ✅ Token security (SHA-256, expiry, revocation, URL scrubbing)
5. ✅ GET/preview never consumes
6. ✅ Email identity binding
7. ✅ Unambiguous new/existing user paths
8. ✅ email_confirm=true after token validation
9. ✅ Supabase provisioning out-of-transaction
10. ✅ Atomic acceptance with FOR UPDATE
11. ✅ Deterministic single-active-membership
12. ✅ Correct retry ordering
13. ✅ Correct baseline table names
14. ✅ Safe orphan-account retry
15. ✅ Outbox design sound (Stage 2/3 gate)
16. ✅ Response contracts consistent
17. ✅ Migration idempotent and correct
18. ✅ Stage 2/3 gates clearly separated
19. ✅ No secrets in browser/logs

**Stage 2/3 coding may proceed. Migration application remains HELD until Stage 2 implementation is complete.**

---

*Reviewed by OpenCode — Read-Only Architecture Reviewer*  
*Review date: 2026-09-03*  
*Status: APPROVED FOR STAGE 2*
