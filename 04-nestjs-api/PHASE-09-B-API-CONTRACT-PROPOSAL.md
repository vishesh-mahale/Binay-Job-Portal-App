# Phase 09-B — Identity & Company API Contract Proposal

Status: `PROPOSAL — BUSINESS DECISIONS RESOLVED; DTO/ERROR REVIEW PENDING`

यह document catalog/requirements में मौजूद capabilities को implementable REST shape में बदलने का proposal है। Source files exact paths/DTOs freeze नहीं करतीं, इसलिए नीचे की recommendations independent review और final approval के बाद ही authoritative होंगी।

## Proposed endpoints

| ID | Capability | Proposed method/path | Actor | Status |
|---|---|---|---|---|
| AUTH-BOOTSTRAP | NestJS auth signup/login/verification boundary; trigger-created account is returned through the profile read | No separate bootstrap endpoint; use auth flow + `GET /api/v1/auth/me` | Supabase Auth flow / authenticated user | DECIDED — no duplicate user-row write |
| AUTH-ME | Current user/account summary via approved user-context RLS read | `GET /api/v1/auth/me` | authenticated active user | PROPOSED |
| AUTH-SESSION | NestJS-tracked realtime presence/session operations (not Supabase Auth token revocation) | `GET /api/v1/auth/sessions`, `POST /api/v1/auth/sessions/revoke` | authenticated user | PROPOSED — semantics pending |
| COMPANY-CREATE | Create company | `POST /api/v1/companies` | active employer (or approved platform admin) | DECIDED ACTOR — path/DTO still proposed |
| COMPANY-READ | Read own authorized company | `GET /api/v1/companies/:companyId` | authorized member/owner/admin | PROPOSED |
| COMPANY-UPDATE | Update company profile/lifecycle | `PATCH /api/v1/companies/:companyId` | owner/admin policy | PROPOSED |
| ORG-BRANCH | Branch create/update/deactivate | `POST/PATCH /api/v1/companies/:companyId/branches/:branchId?` | owner/admin | PROPOSED |
| ORG-DEPARTMENT | Department create/update/deactivate | `POST/PATCH /api/v1/companies/:companyId/departments/:departmentId?` | owner/admin | PROPOSED |
| ORG-TEAM | Team create/update/deactivate | `POST/PATCH /api/v1/companies/:companyId/teams/:teamId?` | owner/admin | PROPOSED |
| MEMBERSHIP-INVITE | Invite/add member | `POST /api/v1/companies/:companyId/members` | owner/admin | PROPOSED |
| MEMBERSHIP-ACCEPT | Accept invitation; no invitation artifact exists in baseline | TBD | TBD | NEEDS SOURCE/DECISION |
| MEMBERSHIP-DEACTIVATE | Deactivate member | `POST /api/v1/companies/:companyId/members/:memberId/deactivate` | owner/admin | PROPOSED |
| MEMBERSHIP-LEAVE | Leave company, subject to owner/last-admin protection | `POST /api/v1/companies/:companyId/membership/leave` | active member | PROPOSED |
| MEMBERSHIP-REJOIN | Request/reactivate existing membership row | `POST /api/v1/companies/:companyId/membership/rejoin` | previously associated user requests; owner/admin approves | PROPOSED — approval semantics applied |
| OWNERSHIP-TRANSFER | Transfer the single primary company owner | `POST /api/v1/companies/:companyId/ownership-transfer` | current company owner; target must satisfy approved eligibility | PROPOSED — exact DTO/audit contract pending |

The `?` notation means create and update may become separate frozen rows; it is not a runtime path.

Company create/update must account for the existing one-to-one `company_settings` row. Create initializes approved defaults; settings update fields require explicit permission mapping.

## DTO rules

- Client never supplies authoritative `user_id`, actor role or trusted `company_id`; server derives/validates them.
- Create/update DTOs contain only fields present in SQL and approved requirements.
- Unknown fields are rejected by the global `ValidationPipe`.
- Responses use the stable envelope and exclude secrets, token hashes and sensitive audit metadata.
- Endpoint-specific error codes remain exactly those listed in the Phase 06 catalog; no new error code is introduced.
- Mutations include idempotency/expected revision only where the catalog or SQL requires them; no generic store is invented.
- Every mutation commits the business row and required audit/history atomically; external calls remain post-commit.
- Company reads use SystemClient plus active-membership/ownership authorization where `17_rls.sql` has no direct company policy; UserContextClient is limited to approved personal/catalog RLS reads.
- `AUTH-ME` uses UserContextClient + the approved `users_own_read` RLS policy. `AUTH-SESSION` uses SystemClient with explicit `user_id` ownership checks because `user_sessions` is realtime-presence data and has no approved authenticated-user RLS policy.
- Company, organization and membership rows use SystemClient plus same-company authorization; no new RLS policy is invented in this proposal.
- Company update must exclude verification/privilege fields unless a separate approved admin capability is added.
- Duplicate slug/member/organization conflicts use the Phase 06 validation/conflict vocabulary; no new error code is invented here.

## Historical decision checklist (resolved 2026-08-27)

The checklist below records the questions that were open when this proposal was drafted. D1–D8 are now resolved in `PHASE-09-B-API-CONTRACT-DECISIONS-HINGLISH.md`; it is retained only for traceability and must not be treated as an open decision list.

2. Confirm exact owner/admin eligibility policy; baseline does not define a universal “eligible user” rule.
3. Confirm invitation model and accept actor. Baseline only supports existing-user membership rows (`company_members.user_id NOT NULL`); it has no invitation token/table. Default source-faithful option is self-accept on an existing inactive membership row. An external-email invitation requires an approved forward migration and contracts review. Until decided, MEMBERSHIP-ACCEPT remains unimplemented.
4. Confirm whether branch/department/team use separate nested resources or one organization command endpoint.
5. Confirm session revoke granularity (one session vs all sessions).
6. Confirm sole-owner/last-admin leave or deactivation protection, rejoin actor, and whether rejoin preserves or changes the original `joined_at`.
7. Confirm whether AUTH-SESSION revoke means presence-row deactivation only, or also a separate Supabase Auth token/session operation outside the DB transaction.

At drafting time these questions blocked a public contract. They are now resolved for the current scope by D1–D8; only the DTO/error/path review remains before the contract can be marked frozen.

## Current decision override (2026-08-27)

D1-D8 are now resolved for the current scope. The checklist above is historical context only. Current implementation must follow the approved decision ledger and the canonical freeze-candidate document; this proposal remains non-authoritative until the final DTO/error/path review passes.
