You are the primary implementation agent for Batch 2 of the Binay Job Portal.

Repository:
C:\Users\ADMIN\OneDrive\Desktop\Vishesh\Binay-Job-Portal-App

Implement both applications together:

Frontend:
C:\Users\ADMIN\OneDrive\Desktop\Vishesh\Binay-Job-Portal-App\03-nextjs-web\03-nextjs-web-app

Backend:
C:\Users\ADMIN\OneDrive\Desktop\Vishesh\Binay-Job-Portal-App\04-nestjs-api\04-nestjs-api-app

Follow:
- 03-Antigravity-main-instruction/ANTIGRAVITY-MASTER-IMPLEMENTATION-PROMPT.md
- 04-nestjs-api/IMPLEMENTATION-TRACKER-HINGLISH.md
- approved requirements, API catalog, contracts, SQL migrations and AGENTS.md

Batch 1 is complete:
- Next.js foundation exists
- typed API client exists
- refresh/retry handling exists
- UI primitives and tests exist
- do not recreate or replace this foundation

==================================================
BATCH 2 SCOPE: AUTH UI + NESTJS AUTH INTEGRATION
==================================================

Before coding:

1. Inspect the existing NestJS auth implementation and tests.
2. Identify the exact available endpoints, methods, request DTOs, response DTOs and error envelope.
3. Inspect the approved auth decisions:
   - Supabase Auth is the identity/token authority.
   - Browser must not receive service-role or database credentials.
   - Preserve the approved separation between user-request access and privileged/system access exactly as implemented/documented.
   - Access/refresh cookie rules must remain secure.
4. Do not invent endpoints or fields.
5. If frontend and backend contracts conflict, report the exact evidence and use the existing backend contract as the source of truth.

Implement one complete vertical slice:

A. Signup UI
- email and password fields
- client-side validation
- loading, success and error states
- call the real NestJS signup endpoint
- do not send a client-selected role unless the backend contract explicitly requires it

B. Login UI
- email and password fields
- validation
- call the real NestJS login endpoint
- use credentials: include
- handle invalid credentials and server errors
- do not expose tokens in JavaScript or localStorage

C. Session handling
- use the existing typed API client
- preserve single refresh-and-retry behavior
- prevent infinite retry loops
- handle refresh failure by clearing the session state and redirecting to login

D. Logout
- call the real NestJS logout endpoint
- clear client auth state
- redirect to login
- do not attempt to manipulate trusted cookies from browser code

E. Protected route behavior
- unauthenticated users must not access protected dashboard routes
- authenticated users must be routed according to the role returned by the approved session/user contract
- do not invent role names or dashboard routes; verify them first

F. Initial role-aware entry pages
Create only the minimum routes needed for the current approved roles:
- candidate
- employer/HR
- admin, only if already supported by the backend contract

Do not implement full dashboards in Batch 2. Add clear placeholder/entry screens only where necessary for verified routing.

G. Tests
Add tests for:

Frontend:
- signup validation
- login validation
- successful login
- invalid login
- logout
- refresh retry
- refresh failure
- protected-route redirect
- role-based redirect

Backend:
- run the existing auth tests
- add tests only if Batch 2 exposes a genuine missing auth behavior

H. Documentation/tracker
Update:
- 03-nextjs-web/README.md
- 04-nestjs-api/IMPLEMENTATION-TRACKER-HINGLISH.md

Record:
- exact endpoints used
- request/response contract
- cookie/session behavior
- completed frontend/backend/integration/tests status
- remaining gaps

==================================================
SECURITY RULES
==================================================

- Never store access or refresh tokens in localStorage/sessionStorage.
- Never expose service-role keys, database credentials or JWT secrets to the browser.
- Do not trust client-supplied user_id, role, company_id or ownership values.
- Preserve server-side authorization.
- Fail closed on invalid or expired authentication.
- Do not add a custom JWT verifier or crypto fallback.
- Do not make direct privileged Supabase writes from Next.js.

==================================================
WORKING RULES
==================================================

- Work as one cohesive Batch 2, not many tiny unrelated changes.
- Reuse Batch 1 components and API client.
- Keep controllers, services, DTOs and UI components focused.
- Do not modify unrelated modules.
- Do not delete existing working code.
- Do not invoke reviewer agents.
- Do not create review files inside either app folder.
- Do not commit or push unless explicitly instructed.
- Run typecheck and the relevant test suites after implementation.
- Build failure caused only by the known Windows `spawn EPERM` environment issue may remain documented.

At the end, report:

1. Files changed
2. Exact endpoints integrated
3. Signup/login/logout/session flow
4. Protected and role-based routes
5. Tests and results
6. Remaining gaps or blockers
7. Tracker updates

Start by inspecting the existing auth code and contracts, then implement Batch 2.