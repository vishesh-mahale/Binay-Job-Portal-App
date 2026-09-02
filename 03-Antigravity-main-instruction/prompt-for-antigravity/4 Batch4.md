Batch 4 ko hum do major parts me complete karenge.

## Batch 4A — Password & Auth Security

Sabse pehle:

1. **Forgot Password**
   - Email form
   - Supabase native recovery email
   - Brevo SMTP delivery
   - Known/unknown email par same generic response

2. **Reset Password**
   - `/reset-password` page
   - Supabase recovery link handling
   - Expired/reused link error
   - Token memory-only handling
   - URL hash immediate scrub
   - Reset ke baad login page redirect

3. **Change Password**
   - Logged-in user ke liye authenticated API/page
   - Current password validation
   - New password validation
   - Generic invalid-password response
   - `password_changed` audit event

4. **Old Session Invalidation**
   - `last_password_changed_at`
   - PostgreSQL trigger
   - AuthGuard JWT `iat` cutoff
   - Old access/refresh token rejection
   - Presence session revoke
   - Same-second 1-second boundary tests

5. **Batch 4A verification**
   - Backend build/tests
   - Frontend typecheck/tests/build
   - Real Brevo inbox recovery flow
   - Database evidence
   - Security review handoff

## Phase 09-B — Company & Authorization

Batch 4A ke baad:

6. **Live password auth integration**
   - Signup, login, refresh, logout
   - Cookies and session behavior

7. **Company management**
   - Company create/read/update
   - Rollback-safe testing
   - Company settings and audit

8. **Organization hierarchy**
   - Branch
   - Department
   - Team
   - Manager/reference validation

9. **Member lifecycle**
   - Invite
   - Accept
   - Leave
   - Rejoin
   - Deactivate

10. **Ownership security**
    - Ownership transfer
    - Owner/member guards
    - Department/team manager safety

11. **Multi-tenant isolation**
    - Cross-company read/write rejection
    - Sensitive data leakage checks
    - RLS and resource authorization tests

12. **Production cookie/config hardening**
    - Domain
    - Secure
    - SameSite
    - Deployment environment values

13. **Final reviewer gate**
    - Antigravity
    - FreeBuf
    - OpenCode
    - Codex consolidation and final verification

Motive API is separate workstream hai; Batch 4 ke auth/company work ke saath mix nahi karenge.


==========================================
==========================================

Batch 4 implementation start karo.

Authoritative instructions:
1. 03-Antigravity-main-instruction/ANTIGRAVITY-MASTER-IMPLEMENTATION-PROMPT.md
2. 04-nestjs-api/IMPLEMENTATION-TRACKER-HINGLISH.md
3. Approved implementation_plan.md

Batch 4 ko is order me execute karo:

========================
BATCH 4A — PASSWORD AUTH SECURITY
========================

1. Forgot Password
- POST /api/v1/auth/forgot-password
- Supabase native /auth/v1/recover
- Exact supported REST payload verify karo
- Known/unknown email dono par identical generic HTTP 200
- Account enumeration prevent karo

2. Reset Password
- Next.js /reset-password page
- Supabase recovery hash parse
- `type=recovery` validation
- access_token ko memory me capture karke immediately hash scrub
- Token sirf Supabase native password-update endpoint ko bhejo
- NestJS custom endpoint, localStorage, sessionStorage, logs, analytics me token nahi jana chahiye
- Expired/missing/reused token par safe error
- Successful reset ke baad /login redirect
- Automatic app login mat karo

3. Authenticated Change Password
- POST /api/v1/auth/change-password
- Existing AuthGuard mandatory
- current_password validate karo
- new_password DTO validation
- Invalid current password par generic 401
- password_changed audit event without password/token values
- Recovery reset aur authenticated change-password ko separate flows rakho

4. Session Invalidation
- `public.users.last_password_changed_at` verify/migrate
- `auth.users.encrypted_password` update trigger
- Trigger SECURITY DEFINER + fixed search_path
- Trigger failure/missing profile/DB error par exception re-raise
- Password update aur timestamp update atomic rollback
- AuthGuard JWT `iat` cutoff enforce
- Ceil-based one-second boundary explicitly document/test
- Old access token aur old refresh token rejection prove karo
- Presence-session offline marking ko JWT revocation se separate rakho

5. Batch 4A tests
- Backend unit tests
- Frontend unit tests
- Typecheck/build
- Known/unknown forgot-password
- Valid/invalid/expired/reused reset link
- Change-password success/failure
- Trigger rollback
- Old session rejection
- Same-second and next-second token behavior
- No secret/token/password logging

6. Real verification
- AUTH_AUTO_CONFIRM_EMAIL=false preserve rakho
- Real Brevo inbox recovery flow run karo:
  forgot password → email → reset link → reset → login
- Exact HTTP status, URL, cookie and DB evidence report karo
- Secrets, SMTP keys, passwords and complete tokens report me mat dikhana

========================
PHASE 09-B — IDENTITY / COMPANY / AUTHORIZATION
========================

Batch 4A complete hone ke baad:

- Live signup/login/refresh/logout integration
- Company create/read/update
- Branch/department/team lifecycle
- Member invite/accept/leave/rejoin/deactivate
- Ownership transfer safety
- Cross-company negative tests
- Sensitive-response leakage checks
- RLS/resource authorization verification
- HR permission mapping freeze
- Cookie domain, Secure, SameSite and deployment env hardening

========================
WORKFLOW RULES
========================

- Scope ko Batch 4A aur 09-B tak rakho; Motive API ko separate workstream rakho.
- Existing architecture, JOSE/JWKS AuthGuard, Supabase authority and fail-closed rules preserve karo.
- No custom auth tokens, custom email verification or custom resend system invent mat karo.
- Meaningful batch ke baad build/tests, tracker update and changed-file evidence record karo.
- Reviewer folders application-code folders ke bahar rakho.
- FreeBuf, OpenCode and Codex source code modify nahi karenge.
- No git commit/push.
- Implementation ke baad remaining gaps clearly report karo.