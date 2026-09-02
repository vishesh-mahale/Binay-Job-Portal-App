# Batch 4A Post-Fix Consolidated Review

**Review basis:** current repository, approved Batch 4A plan, FreeBuf review, and OpenCode review.

## Architecture decision

The approved boundary is retained without exception:

`Next.js browser -> NestJS API -> Supabase Auth`

The browser does not call Supabase directly and never receives a service-role key. The recovery token is held in memory, sent to the NestJS reset proxy, and forwarded by NestJS only to Supabase Auth's native `PUT /auth/v1/user` endpoint. No custom token generation or verification is introduced.

## Findings reconciliation

### Valid finding: reset-password UI test coverage (MEDIUM)

The repository contains the `/reset-password` page and parser tests, but the current frontend suite does not render the page component itself. This is a legitimate test-coverage gap because form submission, loading, success, and API-error UI behavior are not directly covered.

**Recommended action:** add component tests for the existing `ResetPasswordPage` only, then rerun frontend typecheck, tests, and build.

### Not a valid defect: ChangePasswordPage UI tests

No `ChangePasswordPage` exists in the approved Batch 4A scope. Batch 4A requires the authenticated NestJS `POST /api/v1/auth/change-password` endpoint and its API/client coverage; it does not require creating a frontend change-password page. Therefore this reviewer request must not cause a new page or a direct Supabase client flow to be invented.

If a change-password UI is desired later, it should be planned as a separate frontend slice with the same proxy architecture.

## Already resolved security checks

- CRITICAL-01 frontend service-role exposure: resolved; source and `.next` scans report no `service_role` or hardcoded Supabase fallback.
- Frontend direct Supabase access: absent.
- Recovery flow: NestJS proxy only.
- Hash scrubbing and memory-only token handling: retained.
- Fail-closed password-change trigger and JWT cutoff enforcement: retained.
- Key rotation and real inbox evidence: accepted as externally supplied evidence; Dashboard state should still be rechecked before production deployment.

## Verdict

**Security architecture: PASS.**

**Batch 4A final signoff:** pending only the valid `ResetPasswordPage` component-test coverage, unless the team explicitly records that UI coverage as deferred. MEDIUM-02 is rejected as out-of-scope, not a required implementation.
