Implement the approved production Option B HR Invite-First flow in stages.

Repository:
C:\Users\ADMIN\Desktop\Vishesh\Binay-Job-Portal-App

Read first:
- 03-Antigravity-main-instruction/ANTIGRAVITY-MASTER-IMPLEMENTATION-PROMPT.md
- 03-Antigravity-main-instruction/prompt-for-antigravity/4 Batch4.md
- 03-Antigravity-main-instruction/prompt-for-antigravity/test-scenario.md
- 04-nestjs-api/project-docs/PHASE-09-B-API-CONTRACT-DECISIONS-HINGLISH.md
- 04-nestjs-api/project-docs/PHASE-09-B-API-CONTRACT-FREEZE.md
- 04-nestjs-api/project-docs/PHASE-06-API-CATALOG.md
- Current auth, identity, membership and outbox/email code
- FreeBuf review:
  04-nestjs-api/Agent_review/phase-09b-option-b/freebuff-review.md

Final frozen business rules:
1. Employer creates company.
2. Platform admin verifies company.
3. Only verified company owner/admin can invite HR.
4. HR direct public signup is disabled.
5. Invitee opens secure invite link and creates account/password through NestJS.
6. Candidate and HR roles cannot coexist for one user.
7. One HR user may have only one active company membership.
8. Existing inactive/left membership history may remain.
9. HR role assignment is server-side only.
10. Browser → NestJS → Supabase architecture must remain intact.

Stage 1 — Formal contract and migration design:
- Create a formal Option B proposal and D9 decision document.
- Resolve exact HR role representation using existing schema/contracts; do not silently invent a conflicting role model.
- Design reviewed migration for company_invitations.
- Include status enum, FKs, indexes, expiry/revoke/accept fields, one-active-invite uniqueness, audit compatibility, and one-active-company membership enforcement.
- Preserve company_members.user_id NOT NULL.
- Add DB-level unique partial index for active membership:
  UNIQUE(user_id) WHERE is_active = true
  unless an equivalent existing constraint is proven.
- Define transaction and state-transition rules.
- Do not implement application code until the migration/contract is internally consistent.

Stage 2 — Backend:
- Add verified owner/admin invitation endpoint.
- Generate cryptographically random raw token in memory.
- Store only SHA-256 token hash.
- Send email through the approved server-side outbox/Brevo path.
- Never log/store raw token, password or complete invite URL outside the email delivery boundary.
- Add invite redemption/signup endpoint.
- Validate token hash, expiry, revoked_at, accepted_at, company status and invited email.
- Create/provision the Supabase Auth account server-side using official APIs.
- Assign HR role server-side; ignore client-supplied role.
- Create company_members only after account identity exists.
- Atomically lock invitation, consume it once, create membership and write audit log.
- Reject concurrent second redemption, wrong-email acceptance and users already active in another company.
- Add revoke/resend/expiry handling according to the approved contract.

Stage 3 — Frontend:
- Employer verified dashboard gets Invite HR by email.
- Invitee gets /invite/accept page.
- Token is memory-only and immediately removed from the URL.
- Signup/password requests go only to NestJS.
- Do not import Supabase or expose Supabase keys/URLs in Next.js.
- Add clear pending, expired, revoked, wrong-email, already-member and success states.
- Redirect successful acceptance to the HR dashboard.

Stage 4 — Verification:
- Run migration validation.
- Backend unit/integration tests.
- Frontend typecheck/Jest/build.
- Real Brevo email E2E with a fresh unregistered HR email.
- Test invitation creation, signup, acceptance, replay, expiry, revoke, wrong email, cross-company use and concurrent redemption.
- Test candidate/HR mutual exclusivity and one-active-company rule.
- Scan source/build/logs for raw tokens and secrets.
- Update tracker and handoff documents with exact evidence.
- No git commit or push.

Important:
- Do not use the old Option A registered-user-only flow as the production implementation.
- Do not create fake admin verification controls.
- Do not make direct browser-to-Supabase calls.
- If a product/schema decision is unresolved, stop and report it before coding.