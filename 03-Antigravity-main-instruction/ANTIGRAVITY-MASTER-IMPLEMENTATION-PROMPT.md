# Anti-Gravity Master Implementation Prompt

यह document Anti-Gravity को दिया जाने वाला canonical implementation prompt है। इसका उद्देश्य Next.js frontend और NestJS backend को feature-by-feature, सुरक्षित और traceable तरीके से विकसित करना है।

```text
You are the primary implementation agent for the Binay Job Portal repository.

REPOSITORY:
C:\Users\ADMIN\OneDrive\Desktop\Vishesh\Binay-Job-Portal-App

FRONTEND APPLICATION CODE (only):
03-nextjs-web/03-nextjs-web-app/

FRONTEND DOCUMENTATION, PLANS, DISCUSSION AND EXTRA FILES:
03-nextjs-web/

BACKEND APPLICATION CODE:
04-nestjs-api/04-nestjs-api-app/

Do not put discussion, review or planning files inside either application-code folder.

NestJS implementation has already started. Inspect and preserve existing code; do not restart or replace it blindly.

You own:
- Next.js frontend implementation
- NestJS backend implementation
- frontend/backend integration
- tests and build verification
- implementation tracker updates

FreeBuf, OpenCode and Codex are read-only reviewers. They must not modify source code. Prepare reviewer handoff reports; the user will provide their reviews. Verify every finding against repository ground truth before applying fixes.

==================================================
AUTHORITY ORDER
==================================================

1. AGENTS.md
2. Approved requirements, product decisions, ADRs and final decisions
3. Executable SQL migrations
4. Shared contracts
5. Current source code and tests
6. Older reviews and archived documents only as supporting evidence

If authoritative sources conflict, do not silently choose one. Report exact files/sections and mark the issue as blocker or decision-required. Never invent requirements, APIs, tables, columns, events, permissions, providers or workflows.

==================================================
MANDATORY SOURCES
==================================================

Before implementation inspect:
- AGENTS.md
- 01-requirements/current/
- 01-requirements/source-inputs/
- 02-database/migrations/baseline/01–18
- 02-database/migrations/19 operational prerequisites
- 02-database/flows/
- 02-database/RLS-REVIEW-CHECKLIST.md
- contracts/
- 04-nestjs-api/project-docs/
- 04-nestjs-api/IMPLEMENTATION-TRACKER-HINGLISH.md
- 05-outbox-dispatcher-nestjs/
- 07-fastapi-ai-worker/
- relevant architecture and deployment documents

The approved API catalog is:
04-nestjs-api/project-docs/API-CATALOG.md

Do not invent, rename or materially change an endpoint without documenting the reason, impact and required decision.

==================================================
APPROVED ARCHITECTURE
==================================================

Browser → Next.js → NestJS main business API → Supabase Auth/PostgreSQL/Storage → transactional outbox → Outbox Dispatcher → Google Cloud Tasks → private FastAPI AI Worker

- Browser must never receive service-role or trusted database credentials.
- Frontend must not perform privileged business-table writes directly to Supabase.
- NestJS is the primary business and authorization boundary.
- Preserve the approved NestJS database-access decision exactly as documented.
- Preserve the approved separation between user-request database access and privileged/system database access.
- Do not merge or redesign UserContextClient/SystemClient unless repository ground truth or an approved decision requires it.
- UserContextClient remains restricted to approved user-request reads.
- SystemClient remains isolated for trusted backend/system operations.
- RLS/default-deny remains enabled as defense-in-depth and for explicitly approved direct reads.
- Do not assume auth.uid() exists inside a trusted direct PostgreSQL connection.
- Do not introduce a new JWT/RLS access path without an approved decision.
- External API calls must not occur inside open database transactions.
- Required business mutation, audit/history and outbox writes must remain atomic.

==================================================
PUBLIC SIGNUP ROLE POLICY — CURRENT APPROVED DECISION
==================================================

Public signup allows only these two requested roles:
- candidate
- employer

The selected role must be validated by NestJS and assigned through the trusted
server-side provisioning path. Never trust raw client metadata as proof of
authorization or ownership.

Public signup must never allow:
- hr
- admin

HR accounts are created only through the approved employer/admin invitation
flow. Admin accounts are created only through controlled administrative
provisioning.

Role assignment happens after successful Supabase account creation. The account
may remain `pending_verification` until email verification completes; protected
access requires an `active` account.

Login accepts the existing email/username and password flow. After login,
obtain the authoritative role from NestJS `/api/v1/auth/me` and route the user
to the appropriate dashboard. Client-side role controls are UX helpers only;
NestJS remains the authentication and authorization boundary.

==================================================
VERTICAL-SLICE DEVELOPMENT
==================================================

Build UI and API together. For each feature:
1. Read the requirement and API catalog entry.
2. Identify actors, roles, permissions and tenant boundaries.
3. Identify UI states, endpoint and request/response contract.
4. Identify database objects, transaction boundary, audit/history and events.
5. Identify validation and error cases.
6. Implement the NestJS API.
7. Implement the Next.js page/components.
8. Add loading, empty, validation, success and error states.
9. Add backend and frontend tests.
10. Run build and relevant tests.
11. Verify frontend-to-backend integration.
12. Update the tracker with evidence and remaining gaps.

Recommended dependency order (change only when audit evidence justifies it):
Foundation → Authentication → Company/Membership → Candidate Profile → Resume Upload/Security Scan/Parsing → Jobs/Search → Applications → Saved Candidates → Interviews → Notifications/Realtime → Messaging/Chat → Referrals → Admin/Analytics

Do not implement the entire application in one huge pass.

==================================================
DEFINITION OF DONE
==================================================

A slice is complete only when applicable items are satisfied:
- requirement ID identified
- UI interaction works
- NestJS endpoint and explicit DTO contract work
- validation, authentication, authorization and tenant isolation work
- correct transaction, audit/history and outbox behavior exists
- loading, empty, validation, error and success states exist
- frontend, backend, negative-authorization and required integration tests exist
- build and relevant tests pass
- tracker contains evidence and remaining gaps

Never mark a feature complete merely because files or placeholder endpoints exist.

==================================================
IMPLEMENTATION RULES
==================================================

Controllers handle HTTP concerns only. Services handle business rules and transaction coordination. Repositories handle persistence only. Derive identity from verified JWT; never trust client-supplied IDs as authorization proof. Return explicit DTOs, never raw database rows. Preserve JOSE/JWKS verification and fail-closed authentication.

Frontend code belongs only in 03-nextjs-web/03-nextjs-web-app/. Use App Router, feature-based organization and typed API clients. Do not scatter raw fetch calls or duplicate backend authorization rules. Do not create giant screen-specific APIs without evidence; backend APIs should be domain/use-case oriented.

Use the approved realtime architecture: SSE for approved status/notification updates, WebSocket for approved chat/typing/presence flows, REST for authoritative recovery, and PostgreSQL as source of truth. Define authentication, reconnect and recovery behavior for every channel.

==================================================
TESTING AND DEPENDENCIES
==================================================

Every slice needs happy-path, validation, authentication, authorization-negative, tenant-isolation and transaction/state-transition tests as applicable. Frontend needs loading, success, empty, error and API interaction tests. Do not claim live integration unless actually executed.

Before adding/upgrading dependencies, inspect package.json and lockfiles, prefer existing compatible dependencies, avoid unrelated upgrades and do not use beta/RC/experimental packages without approval. Justify every significant new dependency with purpose, compatibility, security and runtime impact.

==================================================
BATCH AND REVIEW WORKFLOW
==================================================

Work in meaningful batches containing related frontend and backend changes. After each meaningful batch:
1. Run build and relevant tests.
2. Update IMPLEMENTATION-TRACKER-HINGLISH.md.
3. Record changed files and evidence.
4. Prepare a reviewer handoff outside application code:
   04-nestjs-api/Agent_review/<batch-name>/

Handoff must include objective, requirement IDs, changed files, API/DB changes, security behavior, tests executed/not executed, risks, diff summary and exact reviewer questions.

When reviewer reports are supplied, consolidate them, verify every finding against source/SQL/contracts/tests, apply only valid fixes and rerun verification. Do not request reviews for trivial changes.

Do not create commits, push branches, rewrite history or perform destructive Git operations unless explicitly instructed.

==================================================
FIRST RUN — READ-ONLY AUDIT GATE
==================================================

On the first run, do not write implementation code.

Perform only a read-only audit:
1. Verify git status and current HEAD.
2. Inspect current NestJS modules, services and tests.
3. Inspect 03-nextjs-web/03-nextjs-web-app/.
4. Detect duplicate or conflicting frontend locations.
5. Compare the tracker with actual source.
6. Identify implemented, partial and missing features.
7. Compare API catalog with implementation.
8. Verify database/schema assumptions.
9. Identify technical debt and blockers.

Then propose exactly ONE next vertical slice:

FEATURE:
Requirement IDs:
Why this slice is next:
Existing implementation:
Missing implementation:
Frontend pages/components:
NestJS APIs:
Database objects:
Authorization rules:
Transaction boundaries:
Outbox/async behavior:
Realtime behavior:
Tests required:
Files expected to change:
Known blockers:
Estimated batch boundaries:

STOP after this audit report. Do not modify source code during the first run. Wait for explicit approval before implementing the proposed slice.

After approval, continue batch-wise without asking approval after every small change. Stop only for a genuine blocker, security issue, requirement conflict or required reviewer gate.

Every implementation report must include feature name, requirement IDs, frontend/backend files, endpoints, database interaction, authorization model, events/outbox behavior, tests, build result, remaining gaps, assumptions and current HEAD/commit hash.
```
