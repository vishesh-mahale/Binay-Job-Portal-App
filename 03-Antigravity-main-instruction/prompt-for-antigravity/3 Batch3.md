Implement Batch 3 — Auth Onboarding Role Selection.

First read and follow:
- 03-Antigravity-main-instruction/ANTIGRAVITY-MASTER-IMPLEMENTATION-PROMPT.md
- AGENTS.md
- existing auth requirements, API catalog, contracts and SQL triggers
- 04-nestjs-api/IMPLEMENTATION-TRACKER-HINGLISH.md

Repository:
C:\Users\ADMIN\OneDrive\Desktop\Vishesh\Binay-Job-Portal-App

Frontend:
03-nextjs-web/03-nextjs-web-app

Backend:
04-nestjs-api/04-nestjs-api-app

Approved signup policy:

Public signup may select only:
- candidate
- employer

Public signup must never allow:
- hr
- admin

Login remains email/username + password.

After login, call NestJS `/api/v1/auth/me` and redirect using the server role:

- candidate → `/dashboard/candidate`
- employer → `/dashboard/employer`
- hr → `/dashboard/employer`
- admin → `/dashboard/admin`

HR remains invitation-based through Employer/Admin.
Admin remains controlled provisioning only.

Tasks:

1. Inspect the existing Supabase signup provider, NestJS `SignupDto`,
   `public.users.role` trigger and verification lifecycle.
2. Add a strictly validated signup role field using the repository naming
   convention. Use `register_as` only if it matches the existing contract.
3. Add Candidate/Employer selector to the Next.js signup page.
4. Provision candidate/employer roles through the trusted NestJS server path.
5. Never trust raw client metadata as authorization proof.
6. Keep HR/Admin unavailable through public signup.
7. Keep pending email verification and fail-closed access behavior.
8. Do not automatically make every employer a company owner unless the approved
   schema/requirements explicitly require it.
9. Add frontend and backend tests for:
   - candidate signup
   - employer signup
   - HR/Admin rejection
   - invalid role rejection
   - pending verification
   - server-role-based login redirect
10. Run one safe local integration flow:
    signup → login → `/auth/me` → correct dashboard redirect.
11. Never print credentials, tokens, cookies, PII or database connection strings.
12. Update README, relevant contract/decision documents and
    `IMPLEMENTATION-TRACKER-HINGLISH.md`.

Rules:

- Preserve existing Batch 1 and Batch 2 work.
- Do not modify unrelated features.
- Do not invent tables, columns, roles, events or providers.
- Do not invoke reviewer agents.
- Do not commit or push.
- If safe employer-role provisioning is not possible with the existing trigger,
  stop and report the exact conflict instead of inventing a workaround.

At the end report:
- files changed
- final signup request/response contract
- candidate flow
- employer flow
- HR/Admin flow
- tests and exact results
- integration result or blocker
- documentation updates
- remaining gaps