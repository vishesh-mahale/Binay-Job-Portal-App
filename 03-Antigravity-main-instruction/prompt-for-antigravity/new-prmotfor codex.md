Continue this existing project from the current workspace. Do not restart or redesign completed work.

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

Before any new changes:
- Run git status.
- Inspect current source and handoff documents.
- Do not revert completed work.
- Do not create DB migrations.
- Do not commit or push.
- If proposing further work, first identify whether it belongs to Phase 09-C or another approved workstream.
- Report actual evidence, not assumptions.