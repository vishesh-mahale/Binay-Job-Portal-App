Continue this existing project from the current workspace. Do not restart or redesign completed work.

The previous Codex account has limited remaining usage. Continue from this handoff exactly; do not repeat completed analysis or recreate files.

This handoff is intended for the next Codex account. Read it fully before taking any action.

Repository path:
C:\Users\ADMIN\Desktop\Vishesh\Binay-Job-Portal-App

Authoritative architecture:
Next.js Browser → NestJS API → Supabase.
Next.js must never contact Supabase directly.
No custom auth tokens, no direct Supabase browser calls, no fake admin verification toggle.

Completed:
- Batch 4A password recovery/security complete.
- Phase 09-B company/authorization core complete.
- Company verification flow implemented:
  employer creates company → status unverified → platform admin verifies → verified company can create branches/departments/teams and invite existing registered users.
- Unverified organization mutations return 403.
- Admin verification endpoint is platform-admin-only.
- Advisory-lock duplicate company protection implemented.
- Option A invite flow: existing registered email only; unknown email returns 404; invite creates is_active=false; authenticated invite accept changes it to true.
- Employer dashboard persistence, status refresh, organization lists/forms implemented.
- Database schema/migrations are already sufficient and must not be modified unless a read-only check proves something missing.

Read these files first:
1. 03-Antigravity-main-instruction/ANTIGRAVITY-MASTER-IMPLEMENTATION-PROMPT.md
2. 03-Antigravity-main-instruction/prompt-for-antigravity/4 Batch4.md
3. 04-nestjs-api/IMPLEMENTATION-TRACKER-HINGLISH.md
4. 04-nestjs-api/Agent_review/phase-09b/PHASE-09B-HANDOFF.md
5. 04-nestjs-api/Agent_review/phase-09b/walkthrough.md

Current final verification already completed:
- Live concurrent company creation: 5 parallel requests → 1 HTTP 201, 4 HTTP 400 conflicts.
- Unverified branch mutation → HTTP 403.
- Non-admin verification → HTTP 403.
- Platform admin verification → HTTP 200.
- Verified branch mutation → HTTP 201.
- Unknown invite email → HTTP 404.
- Existing-user invite → is_active=false.
- Authenticated accept → is_active=true.
- Backend: 35 suites / 234 tests passed.
- Frontend employer UI tests passed.
- Frontend production build passed.
- Database directory untouched.

Approved next workstream: Phase 09-B Option B — Production HR Invite-First flow.

Stage 1 is approved for Stage 2 by BOTH read-only reviewers:
- 04-nestjs-api/Agent_review/phase-09b-option-b/freebuf-final-review-v2.md
- 04-nestjs-api/Agent_review/phase-09b-option-b/opencode-final-review-v2.md

Stage 1 artifacts (already reconciled and frozen):
- 04-nestjs-api/project-docs/PHASE-09-B-OPTION-B-HR-INVITE-FIRST-CONTRACT-DECISIONS.md
- 02-database/migrations/20260903000000_option_b_company_invitations.sql
- implementation_plan.md

Option B frozen business rules:
- HR cannot use public signup; only a verified company owner or platform admin can invite.
- Candidate and HR are mutually exclusive. Acceptance intentionally changes global users.role from candidate to hr.
- One HR can have only one active company membership.
- Lifecycle: Create invitation -> send email -> open and scrub URL token -> deliberate signup or login -> automatic acceptance -> HR dashboard.
- GET/preview never activates or consumes an invitation; no separate Accept button.
- Raw token is random, memory-only in the browser, SHA-256 hashed in DB, never logged or returned.
- Authenticated user email must match invitation.email using normalized case-insensitive comparison.
- New-user signup validates token before email_confirm=true; existing-user path never resets the existing password.
- External Supabase provisioning is outside the PostgreSQL transaction. Role, membership, invitation status, and audit record are atomic with FOR UPDATE.
- Already accepted token returns INVITATION_ALREADY_ACCEPTED before membership-conflict checks.
- Migration is a design artifact and is NOT applied yet.

Historical Stage 2 implementation work is now complete at unit-test level. Do not repeat Units 1–4 or recreate the outbox worker. The remaining work is the live Stage 2 verification sequence listed below, followed only after approval by Stage 3 frontend work.

Before any new changes:
- Run git status.
- Inspect current source and handoff documents.
- Do not revert completed work.
- Do not create DB migrations.
- Do not commit or push.
- If proposing further work, first identify whether it belongs to Phase 09-C or another approved workstream.
- Report actual evidence, not assumptions.
- Do not start Stage 3 frontend work while Stage 2 is incomplete.
- Do not apply 20260903000000_option_b_company_invitations.sql without a separate explicit approval.
- Do not treat the old OneDrive copy as authoritative; use the Desktop repository path above.

Latest verified state (do not overwrite these fixes):
- Codex fixed raw token response leakage: `raw_token_preview` is removed from invitation API responses.
- Codex removed nested transactions from resendInvitation().
- GET invitation verification is strictly read-only.
- signupWithInvite rejects existing accounts with `EXISTING_USER_CANNOT_BE_INVITED`.
- HR invitations strictly serve new unregistered users only.
- Invite auth uses the shared `setSessionCookies()` helper; refresh cookie path is `/api/v1/auth/refresh`.
- Outbox payload includes encrypted `company_name`.
- Missing EmailDeliveryService is a controlled retry/failure, never a false published event.
- Outbox claims only `invitation.created` events inside the locking candidate query.
- Outbox uses baseline `outbox_event_status` and baseline columns/procedures from `15_infrastructure.sql`.
- External SMTP calls occur outside open PostgreSQL transactions.

Latest reported verification (treat as reported evidence, re-run if needed):
- Backend: 41 suites / 257 tests passed.
- TypeScript backend build: 0 errors.
- Targeted identity/outbox tests pass.

Current blockers and exact next sequence:
1. Do NOT apply the migration automatically. First inspect the migration against the live Supabase schema and produce a dry-run/preflight report.
2. Request/confirm explicit user approval before applying:
   02-database/migrations/20260903000000_option_b_company_invitations.sql
3. After explicit approval, apply the migration through the approved database workflow only. Record exact result and rollback/repair notes.
4. Verify live schema objects: invitation_status, company_invitations, constraints, pending-invitation unique index, and one-active-membership index.
5. Configure/verify server-only Brevo SMTP credentials. Never expose or print them.
6. Run live HTTP E2E against the real database/Supabase:
   - verified owner creates HR invitation
   - outbox event is claimed and Brevo email is delivered
   - GET verify never consumes token
   - new-user signup-with-invite creates candidate then atomically converts to HR
   - existing-user login-with-invite uses existing password
   - wrong email, expired, revoked, replay, active application, and active membership cases reject safely
   - 5 parallel acceptance requests for one token produce exactly 1 success and 4 replay failures
7. Redact all tokens, passwords, SMTP keys, cookies, and authorization headers from logs and reports.
8. Stop for a live Stage 2 review after the above gates. Only after explicit approval begin Stage 3 frontend UI.

Never claim Stage 2 live-complete based only on unit tests. Never start Stage 3 while live backend gates are pending.
