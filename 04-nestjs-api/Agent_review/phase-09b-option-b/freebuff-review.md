# FreeBuff — Option B HR Invite-First Architecture Review

**Reviewer:** FreeBuff (Codebuff Read-Only Reviewer)  
**Date:** 2026-09-03  
**Scope:** Read-only review of the proposed Option B HR Invite-First external email invitation architecture  
**Status:** **BLOCKERS IDENTIFIED — PROPOSAL REQUIRES CORRECTIONS BEFORE IMPLEMENTATION**  
**Review path:** `04-nestjs-api/Agent_review/phase-09b-option-b/freebuff-review.md`

---

## 0. Review Basis

No standalone "Option B HR Invite-First" proposal document exists in the repository. This review reconstructs the proposed architecture from:

- **D3 decision** in `PHASE-09-B-API-CONTRACT-DECISIONS-HINGLISH.md` (lines describing "Option B external email ke liye nayi invitation table/token migration maangega")
- **Current `membership.ts` code** which only supports registered-user invite (Option A)
- **`company_members.user_id UUID NOT NULL`** constraint in `04_companies.sql`
- **API-COMPANY-003** catalog entry in `PHASE-06-API-CATALOG.md`
- **ANTIGRAVITY-MASTER-IMPLEMENTATION-PROMPT.md** architecture and authority rules
- **Existing `referral_invitations` table** as the only token-based invitation pattern in the codebase (in `09_applications.sql`)
- **D1–D8 resolved decisions** in `PHASE-09-B-API-CONTRACT-DECISIONS-HINGLISH.md`

**Assumed Option B architecture (reconstructed):**

```
1. HR/admin calls POST /api/v1/companies/:companyId/invitations
2. NestJS creates company_invitations row (hashed token, email, expiry)
3. NestJS sends email via Supabase Edge Function / Brevo with raw token in link
4. Invited user clicks link → redirected to /invite/accept?token=<raw>
5. User signs up (or logs in) → NestJS verifies token hash
6. NestJS creates company_members row (user_id from JWT sub) → membership active
```

---

## 1. Alignment with ANTIGRAVITY-MASTER-IMPLEMENTATION-PROMPT.md

### ✅ PASS — Architecture boundary preserved

The proposed flow keeps **Browser → NestJS → Supabase Auth/PostgreSQL** intact:

- NestJS generates the token, stores the hash, sends the email
- The browser never receives service-role or trusted database credentials
- NestJS is the sole authorization boundary for token verification and membership creation
- No direct browser-to-Supabase business writes

### ✅ PASS — HR role policy respected

The master prompt explicitly states:

> "HR accounts are created only through the approved employer/admin invitation flow."

Option B IS this approved invitation flow. It does not violate the public signup role policy.

### ⚠️ WARNING — Authority order compliance

Per the master prompt authority order:

> 1. AGENTS.md  
> 2. Approved requirements, product decisions, ADRs and final decisions  
> 3. Executable SQL migrations  
> 4. Shared contracts

**Problem:** The proposed `company_invitations` table is NOT in any existing executable SQL migration (baseline 01–18). It requires a **new approved migration** before any NestJS code references it. The D3 decision explicitly states:

> "Future external invitation के लिए अलग invitation table/token, expiry, email/outbox contract और reviewed migration आवश्यक होगी।"

**Verdict:** Option B is architecturally aligned but requires a new migration gate before implementation.

---

## 2. company_invitations Schema Completeness and Safety

### Proposed schema (reconstructed from project patterns):

```sql
CREATE TABLE company_invitations (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    email               CITEXT NOT NULL,
    invited_by_user_id  UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    role                user_role NOT NULL DEFAULT 'hr',
    token_hash          VARCHAR(255) NOT NULL UNIQUE,
    status              invitation_status NOT NULL DEFAULT 'pending',
    branch_id           UUID,
    department_id       UUID,
    team_id             UUID,
    permissions         JSONB,
    is_primary_hr       BOOLEAN NOT NULL DEFAULT false,
    expires_at          TIMESTAMPTZ NOT NULL,
    accepted_at         TIMESTAMPTZ,
    accepted_by_user_id UUID REFERENCES users(id),
    revoked_at          TIMESTAMPTZ,
    revoked_by_user_id  UUID REFERENCES users(id),
    revoke_reason       TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 🔴 BLOCKER B-1 — Missing `invitation_status` enum in baseline

The baseline `02_enums.sql` does NOT define an `invitation_status` enum. The proposed schema references it but it does not exist. This migration MUST create the enum.

**Required enum values (minimum):**

```sql
CREATE TYPE invitation_status AS ENUM (
    'pending',      -- Invitation created, email sent, awaiting acceptance
    'accepted',     -- Token verified, membership created
    'expired',      -- expires_at passed, no acceptance
    'revoked',      -- Admin/owner cancelled before acceptance
    'superseded'    -- New invitation replaces old pending one for same email+company
);
```

**Missing:** No `'superseded'` status is described in D3 or any contract. This is a safety gap — see B-2.

### 🔴 BLOCKER B-2 — No unique-constraint preventing duplicate pending invitations

Without a partial unique index like:

```sql
CREATE UNIQUE INDEX idx_company_invitations_pending_unique
    ON company_invitations(company_id, email)
    WHERE status = 'pending';
```

An HR admin could send 50 invitations to the same email, creating 50 pending rows. When the user accepts, all 50 would match the token and create conflicting state.

**Required correction:** Add a partial unique index on `(company_id, email) WHERE status = 'pending'` OR implement supersession logic (mark old pending as `'superseded'` on new invite).

### 🔴 BLOCKER B-3 — `role` column default and validation not constrained

If the `role` column defaults to `'hr'` but the signup flow later allows the user to choose their own role during acceptance, this violates:

> "Never trust raw client metadata as proof of authorization or ownership."

The role MUST be locked at invitation creation time and immutable during acceptance. The schema needs:

```sql
CONSTRAINT company_invitations_role_immutable CHECK (
    (status = 'pending' AND role IN ('hr', 'admin'))
    OR status IN ('accepted', 'expired', 'revoked', 'superseded')
)
```

Or more practically, the NestJS acceptance service must NEVER read role from the request body — only from the `company_invitations` row.

### ⚠️ WARNING — Missing `revoke_reason` as structured field

The reconstructed schema includes `revoke_reason TEXT` but the existing `company_members` table has no equivalent field. If revocation audit trail is required, this field should be consistent with the audit_logs pattern already established in `membership.ts`.

**Recommendation:** Store revocation metadata in `audit_logs` (which already exists) rather than a separate column. This avoids schema bloat and maintains consistency.

### ✅ PASS — `company_id` ON DELETE CASCADE appropriate

If a company is soft-deleted (`deleted_at`), invitations should also be invalidated. `ON DELETE CASCADE` handles hard deletes. Soft-delete invalidation should be handled by query filters (`WHERE company_id IN (SELECT id FROM companies WHERE deleted_at IS NULL)`).

---

## 3. Raw Invite Tokens Never Stored/Logged

### 🔴 BLOCKER B-4 — No evidence that raw token is never stored

The proposal must guarantee:

1. **Database:** Only `token_hash` (SHA-256 or bcrypt) is stored in `company_invitations.token_hash`. The raw token is NEVER written to any database column, audit log, or outbox event.

2. **Logs:** NestJS `logger.log()`, `logger.error()`, and any console output must NEVER contain the raw token value. The only place the raw token appears is:
   - In-memory during generation (crypto.randomUUID() or crypto.randomBytes())
   - In the email body/link sent via the email provider

3. **Email:** The email transport (Brevo/Supabase) receives the raw token in the link URL. The email provider's logs may contain it — this is acceptable if the email provider is approved and server-side.

4. **Frontend:** The `/invite/accept?token=<raw>` page receives the token in the URL query parameter. It must be sent to NestJS and NEVER stored in localStorage, sessionStorage, cookies, or any persistent client-side storage.

**Required implementation rule:**

```typescript
// GENERATION: token never leaves this function scope
const rawToken = crypto.randomBytes(32).toString('base64url');
const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
// rawToken → email only. tokenHash → database only.
```

**Required audit:** Add a code review gate that greps for any `INSERT` or `console.log` containing `token_hash` value alongside `raw` or `token` in the same context.

---

## 4. Token Hashing, Expiry, Revocation, Replay Prevention and Concurrent Redemption

### Token Hashing

#### ⚠️ WARNING — Hash algorithm choice

The existing `referral_invitations` table uses `invite_token_hash VARCHAR(255)`. The proposal should follow the same pattern for consistency, but must specify the hash algorithm:

- **SHA-256** is sufficient for invite tokens (not password hashing). Fast verification, collision-resistant for random 32-byte tokens.
- **bcrypt** is overkill and would slow down the verify path unnecessarily.

**Recommendation:** Use SHA-256 with a per-invitation random salt stored alongside the hash, OR use SHA-256 of `raw_token` without salt (acceptable for cryptographically random tokens).

```sql
token_hash VARCHAR(64) NOT NULL UNIQUE  -- SHA-256 hex = 64 chars
```

**Correction:** The `VARCHAR(255)` is wasteful. Use `VARCHAR(64)` for SHA-256 hex.

### Expiry

#### ✅ PASS — `expires_at TIMESTAMPTZ NOT NULL` present

The reconstructed schema includes `expires_at`. NestJS must check:

```sql
-- Acceptance query MUST include:
WHERE ci.status = 'pending' AND ci.expires_at > NOW()
```

#### 🔴 BLOCKER B-5 — No scheduled expiry cleanup mechanism

Pending invitations that expire are never cleaned up. Without a mechanism:

1. Expired rows accumulate indefinitely
2. Partial unique index on `status = 'pending'` doesn't help because expired rows still have `status = 'pending'` until explicitly updated

**Required correction:** Either:
- (a) Add a scheduled job (pg_cron or NestJS cron) that updates `pending` → `expired` where `expires_at < NOW()`, OR
- (b) Treat expiry as query-time only (never update status) and adjust the unique index to `(company_id, email, status)` instead of a partial index — but this loses the ability to show "expired" status in the UI

**Recommended:** Option (a) — scheduled expiry + status update. This also enables email notification of expiry.

### Revocation

#### ✅ PASS — Revocation fields present

`revoked_at`, `revoked_by_user_id`, `revoke_reason` are included in the reconstructed schema.

#### ⚠️ WARNING — Revocation must be atomic with membership check

If a user accepts an invitation at the exact moment an admin revokes it, the transaction must handle the race:

```sql
BEGIN;
SELECT 1 FROM company_invitations WHERE id=$1 AND status='pending' AND expires_at > NOW() FOR UPDATE;
-- If no row → rejected
UPDATE company_invitations SET status='accepted', accepted_by_user_id=$2, accepted_at=NOW() WHERE id=$1;
INSERT INTO company_members (...) VALUES (...);
COMMIT;
```

The `FOR UPDATE` lock prevents concurrent redemption.

### Replay Prevention

#### 🔴 BLOCKER B-6 — Single-use enforcement not documented

Once a token is used to create a `company_members` row, the `company_invitations.status` must change to `'accepted'` and NEVER be reversible. Without this:

1. An attacker who intercepts the token link could use it after the legitimate user has already accepted
2. The `accepted` status + the unique `company_members` row prevent double-membership via the same invitation

**Required correction:** The acceptance query must use:

```sql
UPDATE company_invitations SET status='accepted' ... 
WHERE id=$1 AND status='pending' AND expires_at > NOW()
RETURNING *;
```

If `RETURNING` returns 0 rows → already used, expired, or revoked → return appropriate error.

### Concurrent Redemption

#### 🔴 BLOCKER B-7 — Concurrent redemption race condition not addressed

If the same user (or two different users with the same email) clicks the link simultaneously:

1. Both transactions read `status='pending'`
2. Both attempt to insert into `company_members`
3. `UNIQUE (company_id, user_id)` constraint on `company_members` catches the duplicate → second insert fails

**This is partially safe** because of the existing `company_members` unique constraint. However, the invitation status update and membership insert must be in the same transaction to prevent:

- Transaction A: inserts membership, commits
- Transaction B: inserts membership (fails due to unique constraint), but invitation status was already read as 'pending' → inconsistent state

**Required correction:** Use `SELECT ... FOR UPDATE` on the invitation row at the start of the acceptance transaction, as shown in B-6 above. This serializes concurrent redemptions.

---

## 5. HR Role Assigned Only Server-Side

### ✅ PASS — Role locked at invitation creation

The reconstructed schema stores `role` at invitation creation time by the admin. During acceptance, NestJS reads `role` from `company_invitations` row, NOT from the request body.

**Implementation rule (mandatory):**

```typescript
// In NestJS acceptance service:
async acceptInvitation(rawToken: string, userId: string) {
    const tokenHash = sha256(rawToken);
    const invitation = await client.query(
        `UPDATE company_invitations SET status='accepted' ... 
         WHERE token_hash=$1 AND status='pending' AND expires_at > NOW()
         RETURNING *`, [tokenHash]
    );
    if (!invitation.rowCount) throw new BadRequestException('INVALID_INVITATION');
    
    const inv = invitation.rows[0];
    // Role comes from inv.role, NOT from any request parameter
    await client.query(
        `INSERT INTO company_members (company_id, user_id, is_active, ...) 
         VALUES ($1, $2, true, ...)`,
        [inv.company_id, userId /* from JWT sub */]
    );
}
```

### ⚠️ WARNING — Default role assignment needs clarification

D3 says HR accounts are created through invitation flow. But the `user_role` enum (in `02_enums.sql`) currently has values: `candidate`, `employer`, `hr`, `admin`.

**Question:** When an external email user accepts an HR invitation:
1. Is their `users.role` set to `'hr'` during signup? Or is it set to `'candidate'`/`'employer'` at public signup and then elevated to `'hr'` during invitation acceptance?
2. Can the SAME user be both a `candidate` (from public signup) and an `hr` member of a company?

**This is a CRITICAL architectural decision that is NOT resolved in D1–D8.** The current `users.role` is a single-value field, not a per-company role. The `company_members` table has `is_primary_hr` but the user's global role must also be updated.

**Required decision:** 
- Option (i): `users.role` is updated to `'hr'` at invitation acceptance → user can no longer apply to jobs as candidate
- Option (ii): `users.role` remains unchanged; HR permissions are scoped entirely through `company_members` → user can be both candidate and HR

**Recommendation:** Option (ii) is safer and more flexible. The master prompt says role is assigned server-side — it should be the per-company membership role, not a global user role mutation.

---

## 6. Email Identity Mismatch Prevented

### 🔴 BLOCKER B-8 — No email identity binding documented

When a user accepts an invitation, the system must verify that the authenticated user's email MATCHES the invitation email. Without this:

1. User A (attacker) obtains the token link
2. User B (legitimate invitee) has already signed up with the correct email
3. User A logs in with their own different email and accepts User B's invitation
4. User A becomes a member of the company instead of User B

**Required correction:**

```typescript
// In acceptance service:
const user = await client.query('SELECT email FROM users WHERE id=$1', [userId]);
const invitation = await client.query('SELECT email FROM company_invitations WHERE token_hash=$1', [tokenHash]);

if (user.rows[0].email.toLowerCase() !== invitation.rows[0].email.toLowerCase()) {
    throw new ForbiddenException('FORBIDDEN'); // Email mismatch
}
```

This is CRITICAL for security. The existing `referral_invitations` table has `referred_email_normalized` for exactly this purpose.

### ⚠️ WARNING — Email normalization

The invitation email must be normalized (lowercase, trim) at creation time and stored normalized. The user's email must be compared after the same normalization. Use `CITEXT` column type for case-insensitive matching (already used in the reconstructed schema).

---

## 7. company_members.user_id NOT NULL Respected

### ✅ PASS — Schema constraint preserved

The reconstructed Option B flow creates the `company_members` row AFTER the user has authenticated and has a valid `user_id` from JWT `sub`. The `NOT NULL` constraint on `user_id` is naturally satisfied.

**Implementation flow:**

```
1. Admin creates invitation → company_invitations row (no user_id needed)
2. User receives email, clicks link
3. User signs up (or logs in) → users row exists → user_id available
4. NestJS verifies token, creates company_members with user_id from JWT sub
```

The `company_members.user_id NOT NULL` constraint is correctly respected because the membership row is ONLY created during the authenticated acceptance step.

### ⚠️ WARNING — What if user deletes account after invitation?

If a user:
1. Receives invitation
2. Creates account, accepts invitation → membership active
3. Deletes their account → `users.id` is soft-deleted or hard-deleted

The `company_members.user_id REFERENCES users(id) ON DELETE CASCADE` means the membership row is automatically deleted. This is correct behavior.

But if the user:
1. Receives invitation
2. Never accepts
3. Invitation expires

The `company_invitations` row has no `user_id` FK, so no cascade issue. This is correct.

---

## 8. Browser → NestJS → Supabase Architecture Preserved

### ✅ PASS — Full proxy chain maintained

The proposed flow preserves the approved architecture:

```
Browser → Next.js → NestJS (token generation, hash, email send, verification, membership creation) → Supabase PostgreSQL
```

- **Token generation:** NestJS generates and hashes the token (server-side only)
- **Email send:** NestJS calls Supabase Edge Function or Brevo API (server-side only)
- **Token verification:** NestJS verifies hash against database (server-side only)
- **Membership creation:** NestJS inserts into `company_members` via SystemClient (server-side only)

**No browser-to-Supabase direct calls.** ✅

### ⚠️ WARNING — Email sending mechanism

D3 says "future external invitation के लिए अलग ... email/outbox contract आवश्यक होगी।"

**Question:** Will email be sent:
1. Synchronously in the NestJS request handler (blocking)?
2. Via the existing transactional outbox → Outbox Dispatcher → Cloud Tasks pipeline?
3. Via Supabase Edge Function called from NestJS?

**Recommendation:** Option (2) — use the existing outbox pipeline. This ensures:
- Email is sent only after the invitation transaction commits
- Email sending failure doesn't lose the invitation (retriable)
- Consistent with the existing outbox architecture

---

## 9. Email Mechanism — Official and Server-Side

### ✅ PASS — Brevo/Supabase email is server-side

The existing infrastructure already sends emails via:
- **Supabase Auth recovery emails** through **Brevo Custom SMTP** (`noreply@collabfor.com`) — verified in the existing codebase
- **Outbox Dispatcher** pipeline for async email sends

The invitation email can reuse this infrastructure:

```typescript
// Option 1: Supabase Auth admin API (if invitation is tied to auth signup)
// Option 2: Brevo API directly from NestJS
// Option 3: Via outbox → Cloud Tasks → email worker
```

**All three are server-side.** ✅

### ⚠️ WARNING — Email template not defined

No invitation email template exists. Required fields:
- Company name
- Inviter name (from `users` via `invited_by_user_id`)
- Role being offered
- Acceptance link with raw token
- Expiry notice
- Unsubscribe/revocation notice

This should be defined as part of the implementation, not invented during code review.

---

## 10. Transaction Boundaries, Uniqueness and Audit Requirements

### Transaction Boundaries

#### 🔴 BLOCKER B-9 — Invitation creation must be atomic with outbox event

The invitation creation must include:

```sql
BEGIN;
-- 1. Check admin permission
-- 2. Check no existing pending invitation for same email+company (or supersede)
-- 3. Insert company_invitations row
-- 4. Insert outbox event (invitation.created) for email dispatch
-- 5. Insert audit_log entry
COMMIT;
```

External email API call must be OUTSIDE this transaction (per master prompt: "External API calls must not occur inside open database transactions").

#### 🔴 BLOCKER B-10 — Acceptance must be atomic with membership creation

```sql
BEGIN;
-- 1. SELECT invitation FOR UPDATE (lock row)
-- 2. Verify: status='pending', expires_at > NOW(), email matches JWT user
-- 3. UPDATE company_invitations SET status='accepted', accepted_by_user_id, accepted_at
-- 4. INSERT company_members (is_active=true, joined_at=NOW())
-- 5. INSERT audit_log
COMMIT;
```

**Important:** The membership creation row (step 4) is within the SAME transaction as the invitation status update (step 3). If membership insert fails (e.g., unique constraint), the invitation status reverts. This is correct.

### Uniqueness

#### ✅ PASS — Existing constraints prevent duplicate membership

```sql
CONSTRAINT unique_member_per_company UNIQUE (company_id, user_id)
```

This prevents the same user from being added twice to the same company.

#### ⚠️ WARNING — Invitation uniqueness needs clarification

Two options:
1. **Partial unique index** on `(company_id, email) WHERE status = 'pending'` — only one pending invitation per email per company
2. **Application-level supersession** — new invitation marks old one as `'superseded'`

Option (1) is simpler and safer. Option (2) preserves invitation history but adds complexity.

**Recommendation:** Option (1) for v1. Add supersession as a future enhancement.

### Audit Requirements

#### ✅ PASS — Audit pattern established

The existing `membership.ts` uses:

```typescript
await this.audit(client, companyId, actorId, targetId, 'membership.invited', entityId, oldValues, newValues);
```

The invitation flow should follow the same pattern:

| Event | Old Values | New Values |
|-------|-----------|------------|
| `invitation.created` | null | `{ email, role, company_id, invited_by }` |
| `invitation.accepted` | `{ status: 'pending' }` | `{ status: 'accepted', user_id }` |
| `invitation.expired` | `{ status: 'pending' }` | `{ status: 'expired' }` |
| `invitation.revoked` | `{ status: 'pending' }` | `{ status: 'revoked', revoked_by }` |

**Missing:** No `audit_logs` index exists for invitation-related queries. Consider:

```sql
CREATE INDEX idx_audit_logs_invitation ON audit_logs(company_id, entity_type, action) 
WHERE entity_type = 'company_invitation';
```

---

## 11. Blockers, Missing Fields, Unsafe Assumptions, and Required Corrections

### BLOCKERS (Must be resolved before implementation)

| ID | Severity | Finding | Required Correction |
|----|----------|---------|---------------------|
| B-1 | **BLOCKER** | `invitation_status` enum not defined in baseline | Add enum to new migration with required states |
| B-2 | **BLOCKER** | No unique constraint preventing duplicate pending invitations per email per company | Add partial unique index `(company_id, email) WHERE status = 'pending'` |
| B-3 | **BLOCKER** | `role` column not constrained to be immutable after creation | Add CHECK constraint or document NestJS enforcement rule |
| B-4 | **BLOCKER** | No explicit guarantee that raw token is never stored/logged | Add mandatory code review rule + grep gate for token value leakage |
| B-5 | **BLOCKER** | No scheduled expiry mechanism for pending invitations | Add pg_cron job or NestJS scheduled task for expiry cleanup |
| B-6 | **BLOCKER** | Single-use enforcement not documented | Document that acceptance must atomically update status from 'pending' to 'accepted' |
| B-7 | **BLOCKER** | Concurrent redemption race condition | Use `SELECT ... FOR UPDATE` on invitation row at start of acceptance transaction |
| B-8 | **BLOCKER** | No email identity binding — any authenticated user could accept any invitation | Compare invitation email against JWT user email during acceptance |
| B-9 | **BLOCKER** | Invitation creation not specified as atomic with outbox event | Define transaction boundary: invitation row + outbox event in same commit |
| B-10 | **BLOCKER** | Acceptance not specified as atomic with membership creation | Define transaction boundary: invitation status update + membership insert in same commit |

### WARNINGS (Should be addressed but not blocking)

| ID | Severity | Finding | Recommendation |
|----|----------|---------|----------------|
| W-1 | MEDIUM | `users.role` global role mutation unclear when accepting HR invitation | Decide: update global role or scope HR via company_members only |
| W-2 | MEDIUM | `token_hash VARCHAR(255)` is wasteful for SHA-256 | Use `VARCHAR(64)` for SHA-256 hex |
| W-3 | LOW | `revoke_reason` column vs audit_logs inconsistency | Use audit_logs for revocation metadata, not separate column |
| W-4 | LOW | No invitation email template defined | Define template as part of implementation |
| W-5 | LOW | Email sending mechanism not specified | Use existing outbox → Cloud Tasks pipeline |
| W-6 | LOW | No audit_logs index for invitation entity type | Add index if invitation audit queries are expected |
| W-7 | LOW | Superseded status not in enum (if supersession is chosen) | Add 'superseded' to enum if supersession approach is adopted |

### MISSING FIELDS (Required additions to schema)

| Field | Table | Purpose |
|-------|-------|---------|
| `invitation_status` enum | `02_enums.sql` | Lifecycle states for invitations |
| Partial unique index | `company_invitations` | Prevent duplicate pending invitations |
| `token_hash` length | `company_invitations` | Specify `VARCHAR(64)` for SHA-256 |
| `redeeemed_by_user_id` | `company_invitations` | Track which user accepted (currently `accepted_by_user_id` proposed) |

### UNSAFE ASSUMPTIONS (Must not be assumed without evidence)

1. **Assumption:** "Supabase Brevo email will handle delivery" — **UNSAFE without testing.** Brevo free tier has daily limits. Invitation email volume must be estimated and rate-limited.

2. **Assumption:** "Token in URL query parameter is secure enough" — **UNSAFE.** URL query parameters appear in browser history, server logs, and referrer headers. The frontend must:
   - Parse token from URL immediately
   - Clear URL via `history.replaceState`
   - Send token to NestJS via POST body (not keep in URL)
   - Never store in localStorage/cookies

3. **Assumption:** "Existing `is_primary_hr` flag is sufficient for HR role" — **UNSAFE.** The `is_primary_hr` flag is a per-membership boolean. It does NOT map to the `users.role` enum value `'hr'`. The relationship between `is_primary_hr`, `company_members.permissions`, and `users.role` must be explicitly documented.

4. **Assumption:** "Expiry of 7 days is standard" — **UNSAFE without decision.** The expiry duration must be configurable and explicitly decided. D3 does not specify a duration.

---

## 12. Comparison with Existing Referral Invitation Pattern

The `referral_invitations` table in `09_applications.sql` provides a mature reference pattern:

| Aspect | referral_invitations | company_invitations (proposed) |
|--------|---------------------|-------------------------------|
| Token hash | `invite_token_hash VARCHAR(255) UNIQUE` | Should use `VARCHAR(64)` |
| Email binding | `referred_email_normalized CITEXT NOT NULL` | `email CITEXT NOT NULL` ✅ |
| Expiry | `expires_at TIMESTAMPTZ NOT NULL` | `expires_at TIMESTAMPTZ NOT NULL` ✅ |
| Status lifecycle | `referral_invitation_status` enum with transitions | Needs own enum |
| Identity guard trigger | `enforce_referral_invitation_identity()` | Missing — needs equivalent |
| Transition guard trigger | `enforce_referral_invitation_transition()` | Missing — needs equivalent |
| No hard delete | `reject_immutable_row_change()` trigger | Should add for audit trail |
| Unique pending index | `UNIQUE (job_id, referrer_user_id, referred_email_normalized) WHERE status NOT IN ('expired', 'cancelled')` | Should follow pattern |

**Recommendation:** Model `company_invitations` after `referral_invitations` as closely as possible. The referral pattern has already been reviewed and approved. Key patterns to adopt:

1. Transition guard trigger (prevent invalid state changes)
2. Identity guard trigger (prevent immutable field changes after acceptance)
3. No-hard-delete trigger (preserve audit trail)
4. Partial unique index on pending invitations

---

## 13. Summary Verdict

### **BLOCKERS: 10 — Proposal requires corrections before implementation**

The Option B HR Invite-First architecture is **architecturally sound** and aligns with the master prompt's approved architecture, HR role policy, and server-side authorization boundary. However, it has **10 blocking findings** that must be resolved before any implementation code is written:

1. Schema prerequisites (enum, unique index, field constraints)
2. Token security (hash only, never log, identity binding)
3. Concurrency safety (FOR UPDATE, atomic transactions)
4. Lifecycle management (expiry, single-use, revocation)
5. Critical architectural decision (global user role vs per-company role)

### Recommended Next Steps

1. **Create a formal Option B proposal document** in `04-nestjs-api/project-docs/` that addresses all 10 blockers
2. **Resolve the users.role global mutation decision** (B-8/W-1) — this affects the entire auth architecture
3. **Write the executable migration** for `company_invitations` table, enum, indexes, and triggers
4. **Update API-COMPANY-003** in `PHASE-06-API-CATALOG.md` with frozen paths, DTOs, and error catalog
5. **Add to PHASE-09-B-API-CONTRACT-DECISIONS** as decision D9
6. **Submit for three-reviewer gate** before implementation

---

*Reviewed by FreeBuff — Codebuff Read-Only Reviewer*  
*Review date: 2026-09-03*  
*Status: BLOCKERS IDENTIFIED — NOT READY FOR IMPLEMENTATION*
