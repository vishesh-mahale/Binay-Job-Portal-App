# Phase 09-B — Option B HR Invite-First Flow: API Contract & D9 Decisions (STAGE 1 RECONCILED FROZEN DRAFT)

Status: `STAGE 1 DOCUMENTATION FROZEN — READY FOR READ-ONLY RE-REVIEW (STAGE 2/3 CODING HELD)`

This document defines the final reconciled decision **D9** for **Option B — Production HR Invite-First Flow** in the active repository `C:\Users\ADMIN\Desktop\Vishesh\Binay-Job-Portal-App`.

---

## D9 — Production HR Invite-First Flow Architecture Specification

### 1. Final Product Decisions & Core Invariants

1. **Candidate vs. HR Role Exclusivity (FINAL DECISION — CLOSED):**
   - Candidate and HR roles are **mutually exclusive** for a single user account.
   - Acceptance intentionally converts global `users.role` from `'candidate'` to `'hr'` in `public.users`.
   - Once converted to `'hr'`, candidate job-application capabilities are no longer available to that user. This product decision is **FINAL and CLOSED**.

2. **Normalized Case-Insensitive Email Comparison:**
   - Acceptance verification compares the authenticated JWT user's database email against `company_invitations.email` using case-insensitive normalization:
     `LOWER(TRIM(auth_user.email)) = LOWER(TRIM(company_invitations.email))`
   - Client-supplied request-body email alone is strictly insufficient for identity validation.

3. **Single Active Membership Enforcement & Idempotent Replay Ordering:**
   - On a retry for an already accepted invitation, check `invitation.status` FIRST.
   - Return `400 INVITATION_ALREADY_ACCEPTED` BEFORE applying the active-membership conflict check (`USER_ALREADY_ACTIVE_MEMBER_ELSEWHERE`).
   - Repeated retry on an already accepted invitation must remain idempotent and MUST NOT return `USER_ALREADY_ACTIVE_MEMBER_ELSEWHERE` for the same accepted company.

4. **GET Preview Boundary & Token Safety:**
   - GET preview link is optional. The invitation email carries company/inviter context in the email body.
   - Opening an invite link (`GET /invite/accept?token=...`) **MUST NEVER consume or activate the token**. Activation occurs ONLY upon deliberate POST submit (`signup-with-invite` / `login-with-invite`).

5. **Stage 2/3 Implementation Gates (Not Stage 1 Blockers):**
   - The following items are explicitly categorized as **Stage 2/3 Implementation Gates** to be coded and empirically verified during implementation:
     - Cryptographic raw token generation & memory isolation.
     - Outbox worker AES-256-GCM encrypted payload decryption & Brevo SMTP delivery.
     - Frontend Next.js URL query token scrubbing (`history.replaceState`).
     - Dedicated 5-request parallel HTTP acceptance concurrency tests.

---

### 2. API Response Contract & Session Cookie Sequence
- **`POST /api/v1/auth/signup-with-invite` `{ token, password, full_name }`:**
  - **Success Path (`HTTP 201 Created`):** Returns `{ is_accepted: true, requires_login: false, user, company }` + sets NestJS HttpOnly session cookies (`binay_access_token`, `binay_refresh_token`). Data privacy guarantee: raw tokens, hashes, passwords, or Supabase service keys are NEVER returned in JSON.
  - **Network Failure Fallback Path (`HTTP 200 OK`):** Returned if PostgreSQL acceptance commits successfully, but server-side `signInWithPassword()` encounters network failure. Returns `{ is_accepted: true, requires_login: true, message: 'Account created and company invitation accepted! Please log in to reach your HR Dashboard.' }` (no invalid cookies issued).
- **Post-Login HR Membership Redirection (Stage 2/3 Gate):**
  - Upon normal `/login`, authentication services call `GET /api/v1/auth/me` / membership lookup to detect active HR membership (`company_members.is_active = true`) and return redirection metadata to route the user directly to `/dashboard/employer`.

---

### 3. Database Schema Artifacts (Unapplied Migration)
- Migration file `20260903000000_option_b_company_invitations.sql` is a Stage 1 design artifact in `02-database/migrations/` and is **intentionally UNAPPLIED** to the database.
- Defines `invitation_status` enum (`pending`, `accepted`, `expired`, `revoked`), `company_invitations` table (`role CHECK (role = 'hr')`, `accepted_state_check`, `revoked_state_check`), `idx_company_invitations_pending_unique` partial index, preflight duplicate active membership guard, and `idx_company_members_active_user_unique` partial index.

---

### 4. Frozen 7-Step Lifecycle

1. **Create:** Verified Owner/Admin calls `POST /api/v1/companies/:id/invitations` `{ email, title, branch_id, department_id, team_id }`.
2. **Send (Stage 2 Gate):** Outbox worker decrypts AES-256 payload in memory, sends email via Brevo SMTP with link `http://localhost:3001/invite/accept?token=<rawToken>`.
3. **Open:** Invitee opens link. Next.js immediately scrubs raw token from URL (`history.replaceState`) into React memory. Link open / GET request **NEVER activates membership or consumes token**.
4. **Signup / Login Submit:**
   - Path A (New User): Invitee calls `POST /api/v1/auth/signup-with-invite` `{ token, password, full_name }`. NestJS validates token, checks email match, provisions account with `email_confirm: true`, executes atomic acceptance, performs server-side sign-in, and sets HttpOnly cookies.
   - Path B (Existing User): Invitee calls `POST /api/v1/auth/login-with-invite` `{ token, email, password }`. NestJS authenticates user, executes atomic acceptance, and sets HttpOnly cookies.
5. **PostgreSQL Atomic DB Transaction:** NestJS locks invitation (`FOR UPDATE`), checks `invitation.status` first (`400 INVITATION_ALREADY_ACCEPTED`), checks candidate active applications (`job_applications` + `candidate_profiles`), checks single active membership constraint, updates `users.role = 'hr'`, inserts `company_members` (`is_active = true`), marks `status = 'accepted'`, and writes audit event in ONE atomic DB transaction.
6. **Token Consumption:** Invitation transitions to `status = 'accepted'`. Replay attempts fail with `400 INVITATION_ALREADY_ACCEPTED`.
7. **Redirection:** Invitee is redirected directly to HR Dashboard with active HR session.
