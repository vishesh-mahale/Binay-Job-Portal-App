# Phase 09-B — DTO Class Catalog (Proposal)

Status: `PROPOSED — FINAL CONTRACT REVIEW REQUIRED`

Class names नीचे implementation naming proposal हैं; fields केवल `PHASE-09-B-DTO-FIELD-MAPPING-WORKSHEET.md` और SQL baseline से लिए जाएँगे।

| Capability | Proposed request DTO | Proposed response DTO | Status |
|---|---|---|---|
| Current user profile | none | `AuthMeResponseDto` | Proposed |
| Presence sessions list | none | `PresenceSessionDto` / `PresenceSessionListDto` | Proposed |
| Revoke one presence session | `RevokePresenceSessionDto` (`session_id` maps to `user_sessions.id`) | `RevokePresenceSessionResponseDto` | Proposed |
| Company create | `CreateCompanyDto` | `CompanySummaryDto` | Proposed |
| Company read/update | `UpdateCompanyDto` | `CompanySummaryDto` | Proposed |
| Branch create/update | `CreateBranchDto` / `UpdateBranchDto` | `BranchDto` | Proposed |
| Department create/update | `CreateDepartmentDto` / `UpdateDepartmentDto` | `DepartmentDto` | Proposed |
| Team create/update | `CreateTeamDto` / `UpdateTeamDto` | `TeamDto` | Proposed |
| Membership invite/add | `AddCompanyMemberDto` | `MembershipSummaryDto` | Proposed |
| Membership accept | none | `MembershipSummaryDto` | Proposed — D3 resolved |
| Membership deactivate | none (no baseline reason column) | `MembershipSummaryDto` | Proposed — D6 resolved |
| Membership leave | none | `MembershipSummaryDto` | Proposed |
| Membership rejoin | none | `MembershipSummaryDto` | Proposed |
| Ownership transfer | `TransferOwnershipDto` | `CompanySummaryDto` | Proposed — D8 resolved |

## Non-negotiable mapping rules

- `session_id` is an API field name only; repository query uses `user_sessions.id`.
- `head_member_id`, `lead_member_id` and `manager_member_id` remain member IDs.
- `owner_id` is derived from verified JWT and is never accepted in a create DTO.
- DTOs cannot expose passwords, lock/deletion internals, verification document paths, tokens or secrets.
- No DTO may introduce `ip_address`, `last_activity_at`, `head_user_id`, `lead_user_id`, `user_type` or an unverified revision column.
- Final field lists, error codes, idempotency and acceptance criteria require independent review before freeze.
