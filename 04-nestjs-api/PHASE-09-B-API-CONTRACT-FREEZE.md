# Phase 09-B — Identity & Company API Contract Freeze Worksheet

Status: `CONTRACT FREEZE PENDING — BUSINESS DECISIONS RESOLVED; DTO/ERROR REVIEW REQUIRED`

यह worksheet API catalog के `TBD` paths/DTOs को बिना अनुमान के freeze करने के लिए है। Database और architecture approved हैं; endpoint naming, request/response shape और exact command semantics इस gate में तय होंगे।

## Source boundaries

- API candidates केवल `PHASE-06-API-CATALOG.md` §3A–§3B से लिए जाएंगे।
- Business rules `PHASE-05-FINAL-REQUIREMENTS.md` और SQL 03/04 से verify होंगे।
- Access behavior Decision-01; error envelope Decision-06.
- कोई नया endpoint केवल explicit requirement/traceability reference के साथ जोड़ा जाएगा।

## Contract entries requiring decision

| Contract ID | Catalog capability | Path | Method | Actor/permission | Request DTO | Response DTO | Idempotency | Status |
|---|---|---|---|---|---|---|---|---|
| AUTH-BOOTSTRAP | auth signup/login/verification boundary; profile summary | No separate bootstrap endpoint; `GET /api/v1/auth/me` | GET | authenticated user after NestJS AuthProvider flow | TBD | safe account summary | existing user identity | DECIDED — DTO review pending |
| AUTH-SESSION | realtime presence operations | `GET /api/v1/auth/sessions`, `POST /api/v1/auth/sessions/revoke` | GET/POST | authenticated user; own session only | TBD | presence/session result | session identity | DECIDED — DTO review pending |
| COMPANY-COMMAND | company CRUD/lifecycle | `POST /api/v1/companies`, `GET/PATCH /api/v1/companies/:companyId` | POST/GET/PATCH | employer owner or platform admin; same-company authorization | TBD | company + approved settings summary | company identity/domain key | DECIDED — DTO review pending |
| ORG-ADMIN | branch/department/team administration | separate nested branch/department/team resources | POST/PATCH | company owner/admin | TBD | organization resource | domain key | DECIDED — DTO review pending |
| MEMBERSHIP-COMMAND | invite/add/deactivate/leave/rejoin; accept existing-user row only | nested membership commands | POST | owner/admin for management; member for own leave; owner/admin approval for rejoin | DTOs mapped in worksheet | membership summary | membership unique key | PROPOSED — D3/D6 resolved; final error review pending |

### Membership decomposition required before freeze

The combined membership row must be decomposed into these implementation commands. Actor/path/DTO remain unresolved where the catalog does not provide evidence; no actor is invented.

| Contract ID | Capability | Actor evidence | Method/path | DTO | Status |
|---|---|---|---|---|---|
| MEMBERSHIP-INVITE | invite/add existing registered user | API-COMPANY-003 owner/admin | `POST /api/v1/companies/:companyId/members` | `AddCompanyMemberDto` | DECIDED FLOW — DTO review pending |
| MEMBERSHIP-ACCEPT | accept existing registered-user membership | invited registered user, own `user_id = auth.uid()` | `POST /api/v1/companies/:companyId/membership/accept` | None | PROPOSED — D3 resolved |
| MEMBERSHIP-DEACTIVATE | deactivate member | API-COMPANY-003 owner/admin | `POST /api/v1/companies/:companyId/members/:memberId/deactivate` | None; no baseline reason field | PROPOSED — D6 resolved |
| MEMBERSHIP-LEAVE | self leave with owner/relationship guards | active member, own membership | `POST /api/v1/companies/:companyId/membership/leave` | None | DECIDED FLOW — DTO review pending |
| MEMBERSHIP-REJOIN | reactivate existing row after approval | previously associated user requests; owner/admin approves | `POST /api/v1/companies/:companyId/membership/rejoin` | TBD | DECIDED FLOW — DTO/catalog review pending |

| OWNERSHIP-TRANSFER | transfer single primary owner | current owner; target eligibility and membership validated server-side | `POST /api/v1/companies/:companyId/ownership-transfer` | `TransferOwnershipDto` | PROPOSED — D8 resolved; final acceptance/error review pending |

Owner/admin derivation is resolved for this scope: `companies.owner_id` identifies the single owner; active employer/admin permissions are enforced by NestJS same-company authorization. Membership role/permissions remain SQL-backed fields only; no client-supplied role is trusted.

## Non-negotiable contract rules

- Ownership, company ID and actor identity server-side derive/validate होंगे; client supplied tenant IDs trusted नहीं होंगे।
- Error responses Decision-06 envelope में होंगे।
- Company-table direct RLS policy absent होने पर company reads NestJS authorization + trusted path से होंगे; UserContextClient केवल explicitly approved personal/catalog RLS reads के लिए होगा।
- Mutations में expected revision/idempotency जहाँ catalog/SQL मांगता है वहाँ mandatory होगा।
- Business row, audit/history और approved outbox event एक transaction में होंगे; unapproved event emit नहीं होगा।
- Direct browser-to-Supabase business writes नहीं होंगे।
- Response में secrets, token hashes या sensitive audit metadata नहीं आएगा।
- `rejoin` existing membership row को reactivate करेगा।
- Owner transfer/deactivation और relationship reassignment guards mandatory होंगे।

## Freeze exit criteria

```text
Every row has approved method/path
Request/response DTO fields mapped to SQL columns
Actor/permission matrix approved
Error and idempotency behavior approved
Transaction/audit/outbox disposition explicit
Independent agent review PASS
```

Until all rows are resolved, Phase 09-B controllers and route decorators remain unauthorized.

Current decision update: D1–D8 business decisions are resolved for the current scope. Contract remains pending until exact SQL-backed DTO fields, error mappings and final path review pass.

Membership status override: D3/D6 approve registered-user accept, owner/admin-managed invite/deactivate, active-member leave with guards, and owner/admin-approved rejoin. Any older `NEEDS_DECISION` labels in the worksheet are historical placeholders and must not be used to authorize unsupported behavior.
