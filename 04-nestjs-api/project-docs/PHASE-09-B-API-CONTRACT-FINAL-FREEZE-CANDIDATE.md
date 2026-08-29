# Phase 09-B — Identity & Company API Contract Freeze Candidate

Status: `FROZEN — PHASE 09-B IMPLEMENTATION AUTHORIZED`

This document is the clean implementation reference for the approved current-scope decisions. Historical worksheets may contain older `TBD` labels; they do not override this candidate document.

## Approved boundaries

- NestJS owns AuthProvider signup/login/verification; `handle_new_user()` creates `public.users`.
- Browser calls NestJS only; no direct browser-to-Supabase business access.
- `UserContextClient` is limited to approved personal RLS reads (`/auth/me`).
- Company, organization and membership operations use `SystemClient` plus server-side same-company authorization.
- One primary owner per company; owner transfer is explicit and atomic.
- Registered-user membership accept only; external invitation artifacts are future scope.
- Rejoin reactivates the existing membership row after owner/admin approval.
- Normal logout clears the HttpOnly cookie and current presence row; routine Auth token revoke is not required.
- Auth tokens: Supabase Auth issues the access JWT and refresh token; Next.js does not mint either token.
- NestJS sets both as Secure/HttpOnly cookies. `binay_access_token` uses `Path=/`; `binay_refresh_token`
  uses `Path=/api/v1/auth/refresh`, so the refresh token is sent only to the refresh endpoint. Normal
  requests verify the access JWT; refresh token is used only to obtain a new token pair. Exact cookie
  `Domain` remains deployment-specific and is tracked as pending in
  [`AUTH-COOKIE-CONTRACT-TEMPORARY.md`](AUTH-COOKIE-CONTRACT-TEMPORARY.md).

## Endpoint and DTO catalog

| Endpoint | Method | Request DTO | Response DTO |
|---|---|---|---|
| `/api/v1/auth/me` | GET | none | `AuthMeResponseDto` |
| `/api/v1/auth/sessions` | GET | none | `PresenceSessionListDto` |
| `/api/v1/auth/sessions/revoke` | POST | `RevokePresenceSessionDto` | `RevokePresenceSessionResponseDto` |
| `/api/v1/companies` | POST | `CreateCompanyDto` | `CompanySummaryDto` |
| `/api/v1/companies/:companyId` | GET | none | `CompanySummaryDto` |
| `/api/v1/companies/:companyId` | PATCH | `UpdateCompanyDto` | `CompanySummaryDto` |
| `/api/v1/companies/:companyId/branches` | POST | `CreateBranchDto` | `BranchDto` |
| `/api/v1/companies/:companyId/branches/:branchId` | PATCH | `UpdateBranchDto` | `BranchDto` |
| `/api/v1/companies/:companyId/departments` | POST | `CreateDepartmentDto` | `DepartmentDto` |
| `/api/v1/companies/:companyId/departments/:departmentId` | PATCH | `UpdateDepartmentDto` | `DepartmentDto` |
| `/api/v1/companies/:companyId/teams` | POST | `CreateTeamDto` | `TeamDto` |
| `/api/v1/companies/:companyId/teams/:teamId` | PATCH | `UpdateTeamDto` | `TeamDto` |
| `/api/v1/companies/:companyId/members` | POST | `AddCompanyMemberDto` | `MembershipSummaryDto` |
| `/api/v1/companies/:companyId/membership/accept` | POST | none | `MembershipSummaryDto` |
| `/api/v1/companies/:companyId/members/:memberId/deactivate` | POST | none (no baseline reason column) | `MembershipSummaryDto` |
| `/api/v1/companies/:companyId/membership/leave` | POST | none | `MembershipSummaryDto` |
| `/api/v1/companies/:companyId/membership/rejoin` | POST | none; requester is JWT user | `MembershipSummaryDto` |
| `/api/v1/companies/:companyId/members/:memberId/approve-rejoin` | POST | none; target member is route-derived | `MembershipSummaryDto` |
| `/api/v1/companies/:companyId/ownership-transfer` | POST | `TransferOwnershipDto` | `CompanySummaryDto` |

## Non-negotiable implementation rules

- `owner_id`, `company_id` and actor identity are server-derived.
- `session_id` maps to SQL `user_sessions.id`.
- `head_member_id`, `lead_member_id` and `manager_member_id` map to `company_members` IDs.
- No unapproved event, table, queue or external invitation artifact may be introduced.
- Business row plus required audit/history is atomic; external calls are post-commit.
- Sensitive fields, secrets, tokens, verification document paths and deletion internals stay out of ordinary responses.

## Freeze gate

Freeze evidence: Phase 06 identity/company entries, exact SQL-backed field lists, approved error vocabulary and high-risk acceptance criteria were independently reviewed and reconciled on 2026-08-27.

## Acceptance criteria for high-risk commands

- Membership accept changes only the authenticated user's existing inactive membership row; cross-user and cross-company attempts fail.
- Rejoin is two-step: the previously associated user creates a pending request; owner/admin approval reactivates that same row.
- Membership deactivate/leave cannot remove the sole owner or orphan required head/lead/manager relationships; request has no reason field because the baseline has no such column.
- Ownership transfer accepts only an eligible active member, leaves exactly one `companies.owner_id`, and commits ownership plus required audit/history atomically.
- Session revoke affects only the authenticated user's selected `user_sessions.id` presence row.
