Your read-only audit is accepted as the working baseline.

Proceed according to:
03-Antigravity-main-instruction/ANTIGRAVITY-MASTER-IMPLEMENTATION-PROMPT.md

Implement the approved first vertical slice:

NEXT.JS FRONTEND FOUNDATION + AUTHENTICATION CORE

Scope:

1. Initialize the Next.js application only in:
   03-nextjs-web/03-nextjs-web-app/

2. Keep all frontend documentation/plans outside the app-code folder.

3. Implement authentication UI for all current roles:
   - candidate
   - employer
   - hr
   - admin

4. Implement:
   - /login
   - /signup
   - /verify-email
   - protected dashboard layout
   - role-based dashboard redirect
   - logout
   - refresh-session handling
   - unauthorized and forbidden states

5. Connect the frontend only through the existing NestJS auth APIs:
   - POST /api/v1/auth/signup
   - POST /api/v1/auth/login
   - POST /api/v1/auth/refresh
   - POST /api/v1/auth/logout
   - GET /api/v1/auth/me
   - GET /api/v1/auth/sessions
   - POST /api/v1/auth/sessions/revoke

6. Do not create or assume new API routes.
   Verify every route against:
   04-nestjs-api/project-docs/PHASE-06-API-CATALOG.md
   and current NestJS controllers.

7. Preserve the existing NestJS authentication implementation.
   Modify backend code only if integration proves an evidence-based contract or DTO correction is required.

8. Preserve:
   - JOSE/JWKS verification
   - fail-closed authentication
   - UserContextClient/SystemClient separation
   - cookie security settings
   - server-side role and authorization checks
   - no service-role credentials in the browser

9. Role behavior:
   - candidate → candidate dashboard
   - employer → employer/company dashboard
   - hr → HR dashboard
   - admin → admin dashboard
   - pending_verification → verify-email page
   - invalid/expired session → login page
   - authenticated wrong-role access → 403/forbidden page

10. Frontend route protection is only for navigation.
    NestJS remains the real authorization boundary.
    Never trust a client-supplied role.

11. Use a typed centralized API client.
    Do not scatter raw fetch calls across components.
    Handle cookies, trace/request IDs, standardized errors, timeout and refresh behavior.

12. Add tests for:
    - login form validation
    - signup form validation
    - loading/success/error states
    - pending verification
    - role-based redirects
    - expired session
    - logout
    - forbidden role access
    - API error mapping

13. Work in meaningful batches:

    Batch 1:
    Next.js scaffold, TypeScript, compatible stable dependencies,
    base layout, UI primitives and typed API client.

    Batch 2:
    Login, signup and verify-email pages with validation.

    Batch 3:
    Auth provider, protected layouts, role redirects,
    logout and refresh handling.

    Batch 4:
    Integration tests, build verification and tracker update.

14. After each meaningful batch:
    - run build
    - run relevant tests
    - update IMPLEMENTATION-TRACKER-HINGLISH.md
    - report changed files and evidence

15. Do not request reviewer reports for trivial changes.
    After the complete auth vertical slice, prepare a reviewer handoff outside the app folder:

    04-nestjs-api/Agent_review/09-A-auth-vertical-slice/

16. Do not create commits, push branches or perform destructive operations
    unless explicitly instructed.

17. If any contract, security, database or requirement conflict appears:
    stop that part, report the exact evidence and do not invent a solution.

Proceed with Batch 1 only first.
Report the files created, dependency decisions, build result and tests.Your read-only audit is accepted as the working baseline.

Proceed according to:
03-Antigravity-main-instruction/ANTIGRAVITY-MASTER-IMPLEMENTATION-PROMPT.md

Implement the approved first vertical slice:

NEXT.JS FRONTEND FOUNDATION + AUTHENTICATION CORE

Scope:

1. Initialize the Next.js application only in:
   03-nextjs-web/03-nextjs-web-app/

2. Keep all frontend documentation/plans outside the app-code folder.

3. Implement authentication UI for all current roles:
   - candidate
   - employer
   - hr
   - admin

4. Implement:
   - /login
   - /signup
   - /verify-email
   - protected dashboard layout
   - role-based dashboard redirect
   - logout
   - refresh-session handling
   - unauthorized and forbidden states

5. Connect the frontend only through the existing NestJS auth APIs:
   - POST /api/v1/auth/signup
   - POST /api/v1/auth/login
   - POST /api/v1/auth/refresh
   - POST /api/v1/auth/logout
   - GET /api/v1/auth/me
   - GET /api/v1/auth/sessions
   - POST /api/v1/auth/sessions/revoke

6. Do not create or assume new API routes.
   Verify every route against:
   04-nestjs-api/project-docs/PHASE-06-API-CATALOG.md
   and current NestJS controllers.

7. Preserve the existing NestJS authentication implementation.
   Modify backend code only if integration proves an evidence-based contract or DTO correction is required.

8. Preserve:
   - JOSE/JWKS verification
   - fail-closed authentication
   - UserContextClient/SystemClient separation
   - cookie security settings
   - server-side role and authorization checks
   - no service-role credentials in the browser

9. Role behavior:
   - candidate → candidate dashboard
   - employer → employer/company dashboard
   - hr → HR dashboard
   - admin → admin dashboard
   - pending_verification → verify-email page
   - invalid/expired session → login page
   - authenticated wrong-role access → 403/forbidden page

10. Frontend route protection is only for navigation.
    NestJS remains the real authorization boundary.
    Never trust a client-supplied role.

11. Use a typed centralized API client.
    Do not scatter raw fetch calls across components.
    Handle cookies, trace/request IDs, standardized errors, timeout and refresh behavior.

12. Add tests for:
    - login form validation
    - signup form validation
    - loading/success/error states
    - pending verification
    - role-based redirects
    - expired session
    - logout
    - forbidden role access
    - API error mapping

13. Work in meaningful batches:

    Batch 1:
    Next.js scaffold, TypeScript, compatible stable dependencies,
    base layout, UI primitives and typed API client.

    Batch 2:
    Login, signup and verify-email pages with validation.

    Batch 3:
    Auth provider, protected layouts, role redirects,
    logout and refresh handling.

    Batch 4:
    Integration tests, build verification and tracker update.

14. After each meaningful batch:
    - run build
    - run relevant tests
    - update IMPLEMENTATION-TRACKER-HINGLISH.md
    - report changed files and evidence

15. Do not request reviewer reports for trivial changes.
    After the complete auth vertical slice, prepare a reviewer handoff outside the app folder:

    04-nestjs-api/Agent_review/09-A-auth-vertical-slice/

16. Do not create commits, push branches or perform destructive operations
    unless explicitly instructed.

17. If any contract, security, database or requirement conflict appears:
    stop that part, report the exact evidence and do not invent a solution.

Proceed with Batch 1 only first.
Report the files created, dependency decisions, build result and tests.