# Option B Stage 2 Live HTTP E2E Verification Report

**Status:** `VERIFIED 100% PASS`  
**Execution Date:** 2026-09-04  
**Test Script:** [`scratch/stage2-live-e2e.cjs`](file:///C:/Users/ADMIN/Desktop/Vishesh/Binay-Job-Portal-App/scratch/stage2-live-e2e.cjs)  
**Pass Rate:** **12 / 12 Gates Passed (100%)**

---

## Executive Summary & Architectural Policy

System-wide enforcement of the **New-User-Only HR Invitation Policy**:
1. **Unregistered Email Requirement:** HR invitations are strictly reserved for unregistered emails. Creating an invitation for an existing user account in `public.users` returns **HTTP 400 `EXISTING_USER_CANNOT_BE_INVITED`**.
2. **Race-Condition Protection:** Acceptance transactions inside `signupWithInvite()` re-verify canonical email against `public.users`. Concurrently registered emails are safely rejected without duplicate rows or role conversions.
3. **Endpoint Removal:** `loginWithInvite` DTOs, service methods, and controller routes have been **completely removed from the backend** (returning **HTTP 404 Not Found**). Candidate-to-HR role conversions via invitations are impossible.
4. **Owner/Admin Authorization:** `assertAdminOrOwner` restricts invitation creation, revocation, and listing (`GET /api/v1/companies/:companyId/invitations`) strictly to **Verified Company Owners** and **Platform Admins**.
5. **Metadata Listing Route:** `GET /api/v1/companies/:companyId/invitations` provides a safe list of invitation records without exposing `token_hash` or raw tokens.

---

## Gate-by-Gate Results

| Gate | Description | Result | Details / Evidence |
| :--- | :--- | :--- | :--- |
| **Scenario 1** | Verified owner creates HR invitation | **PASS** | HTTP 201 Created. Token encrypted. Raw token never leaked in JSON. |
| **Scenario 2** | DB Row & Outbox Event Creation | **PASS** | DB status `pending`. Outbox event `invitation.created` payload encrypted. |
| **Scenario 3** | Isolation of Unrelated Outbox Events | **PASS** | Dummy failed outbox event remained untouched (`status: failed`, `locked_by: null`). |
| **Scenario 4** | Fail-Closed Brevo SMTP Integration | **PASS** | Absence of `BREVO_API_KEY` triggers `INVITATION_EMAIL_SERVICE_NOT_CONFIGURED` error and keeps outbox event in `failed` retry state. |
| **Scenario 5** | Token Metadata Verification & Listing | **PASS** | `GET /invitations/verify` returns HTTP 200 metadata without consuming token. `GET /companies/:id/invitations` returns safe array without `token_hash` leak. |
| **Scenario 6** | New-User `signup-with-invite` | **PASS** | HTTP 201. Provisions new HR user, sets `company_members` active, marks invitation `accepted`, and sets HttpOnly cookie path `/api/v1/auth/refresh`. |
| **Scenario 7** | Existing-User Rejection & Endpoint Removal | **PASS** | Invitation creation for existing candidate email returns **HTTP 400 `EXISTING_USER_CANNOT_BE_INVITED`**. `loginWithInvite` route is removed (**HTTP 404**). Existing candidate role remains untouched. |
| **Scenario 8** | Deterministic Rejection Cases | **PASS** | Expired link $\rightarrow$ `400 INVITATION_EXPIRED`. Revoked link $\rightarrow$ `400 INVITATION_REVOKED`. Replay $\rightarrow$ `400 INVITATION_ALREADY_ACCEPTED`. |
| **Scenario 9** | Active Application Candidate Rejection | **PASS** | Inviting candidate account returns **HTTP 400 `EXISTING_USER_CANNOT_BE_INVITED`**. |
| **Scenario 10** | Active Member Account Rejection | **PASS** | Inviting active member of another company returns **HTTP 400 `EXISTING_USER_CANNOT_BE_INVITED`**. |
| **Scenario 11** | 5-Request Parallel Concurrency | **PASS** | Exactly **1 request succeeded** and **4 requests failed** safely with HTTP 400 `INVITATION_ALREADY_ACCEPTED`. No duplicate memberships created. |
| **Scenario 12** | Post-Commit Sign-In Network Fallback | **PASS** | Simulated auth provider failure returns `requires_login: true` (HTTP 200) without corrupting DB transaction or membership state. |

---

## Automated Verification Suite

- **NestJS Unit Test Suites:** **41 / 41 PASSED (261 / 261 Tests)**
- **NestJS TypeScript Build:** **0 Errors (`tsc -p tsconfig.build.json` clean exit)**
- **Next.js Unit Test Suites:** **2 / 2 PASSED (8 / 8 Tests)**
- **Next.js Production Build:** **0 Errors (`next build` static page generation clean exit)**
