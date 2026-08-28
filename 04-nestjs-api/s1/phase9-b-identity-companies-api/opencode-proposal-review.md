# Phase 09-B — Identity & Company API Contract Proposal Review

Status: `CONDITIONAL PASS`

Reviewer: opencode (Independent Senior API Architect and Multi-Tenant Security Reviewer)
Audit target: `04-nestjs-api/PHASE-09-B-API-CONTRACT-PROPOSAL.md`
Date: 2026-08-26

---

## Review methodology

Every proposed endpoint was verified against the frozen API catalog (`PHASE-06-API-CATALOG.md` §3A/§3B),
approved architecture (`PHASE-07-ARCHITECTURE.md`), implementation plan (`PHASE-08-IMPLEMENTATION-PLAN.md`),
final requirements (`PHASE-05-FINAL-REQUIREMENTS.md`), SQL baseline (`03_users_auth.sql`, `04_companies.sql`,
`17_rls.sql`), Decision-01 access model, Decision-06 error vocabulary, and the approved scope
(`PHASE-09-B-IDENTITY-COMPANIES-SCOPE.md`). Previous agent reports were not trusted; every
finding is verified against source.

---

## Endpoint-by-endpoint verification

### 1. AUTH-BOOTSTRAP — `POST /api/v1/auth/bootstrap`

**Proposal:** actor "Supabase-verified signup/callback caller"
**Catalog API-AUTH-001:** actor "unauthenticated signup user / authenticated callback", path TBD

| Attribute | Proposal | Catalog | Match |
|---|---|---|---|
| Method | POST | TBD | PROPOSED |
| Path | `/api/v1/auth/bootstrap` | TBD | PROPOSED |
| Actor | Supabase-verified signup/callback caller | unauthenticated signup user / authenticated callback | ✓ CLOSER |
| Permission | not stated | provider verification and server-controlled account status | NEEDS_EXPLICIT |
| Transaction | not stated | user-row bootstrap and audit state must be atomic where NestJS owns the command | NEEDS_EXPLICIT |
| Outbox | not stated | TBD by approved auth event contract; no event invented here | NEEDS_EXPLICIT |

**Finding PROP-01 — MEDIUM**

| | |
|---|---|
| Severity | **MEDIUM** |
| Section | AUTH-BOOTSTRAP |
| Source | `PHASE-09-B-IDENTITY-COMPANIES-SCOPE.md:47`: "Supabase Auth signup के बाद `handle_new_user()` trigger `public.users` row बनाता है; NestJS duplicate user row नहीं बनाएगा।" |
| Evidence | The scope explicitly states NestJS does not create the user row; the trigger handles it. The proposal's AUTH-BOOTSTRAP endpoint does not clarify whether it reads the trigger-created row, verifies callback completeness, or returns the safe account summary. The catalog says "Writes: public.users, security/audit records as approved" — but the scope says NestJS does not create user rows. |
| Impact | Without clarifying the exact ownership boundary, implementation may incorrectly attempt to INSERT into users (duplicating the trigger) or may not correctly read the trigger-created row. |
| Recommended fix | Add to AUTH-BOOTSTRAP: "NestJS reads the trigger-created user row; it does not create it. Endpoint verifies Supabase callback completeness and returns safe account summary from the existing row." |

**Finding PROP-02 — LOW**

| | |
|---|---|
| Severity | **LOW** |
| Section | AUTH-BOOTSTRAP — outbox disposition |
| Source | `PHASE-06-API-CATALOG.md:207`: "Outbox/consumer: TBD by approved auth event contract; no event invented here" |
| Evidence | The proposal does not address outbox for AUTH-BOOTSTRAP. |
| Impact | Implementation may emit an unauthorized auth event. |
| Recommended fix | Add: "Outbox: none unless an approved auth event contract exists." |

---

### 2. AUTH-ME — `GET /api/v1/auth/me`

**Proposal:** actor "authenticated active user"
**Catalog:** No explicit API-AUTH-* entry for current-user/profile read

**Finding PROP-03 — MEDIUM**

| | |
|---|---|
| Severity | **MEDIUM** |
| Section | AUTH-ME |
| Source | `PHASE-06-API-CATALOG.md` §3A — no dedicated entry for current-user profile read |
| Evidence | The catalog has API-AUTH-001 (bootstrap), API-AUTH-002 (session/security), API-AUTH-003 (protected-request authorization). None explicitly defines a `GET /auth/me` endpoint. The scope (`PHASE-09-B-IDENTITY-COMPANIES-SCOPE.md:19`) says "Authenticated user bootstrap/profile read using verified request context" — the "profile read" part could map to AUTH-ME. The RLS `users_own_read` policy (`17_rls.sql:178`) allows `authenticated` to read their own `users` row. |
| Impact | AUTH-ME is a reasonable and safe addition (own-row read via RLS), but it lacks an explicit catalog entry. If the proposal adds it without catalog authorization, it may constitute scope creep. |
| Recommended fix | Either: (1) Add a catalog entry for AUTH-ME (current-user profile read) and reference it, or (2) Explicitly state: "AUTH-ME is a user-context read using UserContextClient + RLS `users_own_read` policy; it is a safe read-only endpoint derived from the scope's 'profile read' use case and does not require a separate catalog entry." |

---

### 3. AUTH-SESSION — `GET /api/v1/auth/sessions`, `POST /api/v1/auth/sessions/revoke`

**Proposal:** actor "authenticated user"
**Catalog API-AUTH-002:** actor "authenticated user", path TBD

| Attribute | Proposal | Catalog | Match |
|---|---|---|---|
| Methods | GET, POST | TBD | PROPOSED |
| Paths | `/auth/sessions`, `/auth/sessions/revoke` | TBD | PROPOSED |
| Actor | authenticated user | authenticated user | ✓ |
| Permission | own session/security records | own session/security records | ✓ |

**Finding PROP-04 — LOW**

| | |
|---|---|
| Severity | **LOW** |
| Section | AUTH-SESSION — session revoke granularity |
| Source | `04_companies.sql:335-348`: `user_sessions` table with `id`, `user_id`, `socket_id` |
| Evidence | The proposal lists `POST /auth/sessions/revoke` but does not specify whether it revokes one session (by session ID) or all sessions for the user. The catalog says "logout/revoke operations safe on retry" but does not specify granularity. The proposal's Decision #5 acknowledges this: "Confirm session revoke granularity (one session vs all sessions)." |
| Impact | Implementation may support only one granularity, requiring a change later. |
| Recommended fix | Mark as NEEDS_DECISION (already acknowledged in proposal Decision #5). During freeze, specify: revoke-all as default with optional session ID parameter for single-session revoke. |

---

### 4. COMPANY-CREATE — `POST /api/v1/companies`

**Proposal:** actor "eligible authenticated user"
**Catalog API-COMPANY-001:** actor "employer/owner/admin according to policy"

**Finding PROP-05 — MEDIUM**

| | |
|---|---|
| Severity | **MEDIUM** |
| Section | COMPANY-CREATE — actor eligibility |
| Source | `PHASE-06-API-CATALOG.md:262`: "Actor: employer/owner/admin according to policy" |
| Evidence | The proposal says "eligible authenticated user" but the catalog says "employer/owner/admin according to policy." The proposal's Decision #2 acknowledges this: "Confirm exact owner/admin eligibility policy; baseline does not define a universal 'eligible user' rule." The SQL has no eligibility check beyond the user being authenticated and active. |
| Impact | Without a defined eligibility policy, any authenticated user could create a company, or the eligibility rules may be more restrictive. This must be decided before freeze. |
| Recommended fix | Mark as NEEDS_DECISION (already acknowledged in proposal Decision #2). During freeze, define: "Any authenticated active user may create a company and becomes the owner" OR "Only users with specific role/claim may create companies." |

---

### 5. COMPANY-READ — `GET /api/v1/companies/:companyId`

**Proposal:** actor "authorized member/owner/admin"
**Catalog API-COMPANY-001:** actor "employer/owner/admin according to policy"

**Finding PROP-06 — MEDIUM**

| | |
|---|---|
| Severity | **MEDIUM** |
| Section | COMPANY-READ — authorization check |
| Source | `PHASE-06-API-CATALOG.md:274`: "Acceptance: user cannot access another company" |
| Evidence | The proposal says "authorized member/owner/admin" but does not specify the authorization check. The catalog requires "company ownership/membership and company-management permission." The SQL has `is_company_member()` function (`17_rls.sql:18-32`) that checks owner or active membership. But the catalog also says company reads "may use SystemClient + NestJS authorization" since there is no authenticated RLS SELECT policy on `companies`. |
| Impact | Without explicit authorization check, cross-company read isolation may not be enforced. |
| Recommended fix | Add to COMPANY-READ: "Authorization: NestJS verifies company membership via `is_company_member()` or ownership check before returning company data. Cross-company access returns FORBIDDEN." |

---

### 6. COMPANY-UPDATE — `PATCH /api/v1/companies/:companyId`

**Proposal:** actor "owner/admin policy"
**Catalog API-COMPANY-001:** actor "employer/owner/admin according to policy"

**Finding PROP-07 — LOW**

| | |
|---|---|
| Severity | **LOW** |
| Section | COMPANY-UPDATE — owner/status change protection |
| Source | `PHASE-06-API-CATALOG.md:274`: "Acceptance: unsafe owner/status changes fail closed" |
| Evidence | The proposal does not explicitly state owner/status change protection. The scope (`PHASE-09-B-IDENTITY-COMPANIES-SCOPE.md:44-45`) requires: "Company का sole active owner deactivate/remove नहीं हो सकता" and "Company owner के user account को deactivate/suspend/delete करने से पहले ownership transfer guard लागू होगा." |
| Impact | Implementation may allow unsafe owner/status changes. |
| Recommended fix | Add to COMPANY-UPDATE: "Owner transfer and status changes follow approved guards; sole active owner cannot be deactivated without prior transfer." |

---

### 7. ORG-BRANCH/DEPARTMENT/TEAM — `POST/PATCH /api/v1/companies/:companyId/{resource}s/:resourceId?`

**Proposal:** single path with optional ID for create/update
**Catalog API-COMPANY-002:** "nested company administration resources"

| Attribute | Proposal | Catalog | Match |
|---|---|---|---|
| Paths | `/companies/:companyId/branches/:branchId?` etc. | TBD | PROPOSED |
| Actor | owner/admin | company owner/admin with management permission | ✓ |
| Methods | POST (create), PATCH (update) | TBD | PROPOSED |

**Finding PROP-08 — LOW**

| | |
|---|---|
| Severity | **LOW** |
| Section | ORG-BRANCH/DEPARTMENT/TEAM — deactivation |
| Source | `PHASE-06-API-CATALOG.md:294`: "Acceptance: deactivation cannot orphan required manager/lead relationships" |
| Evidence | The proposal groups create/update under POST/PATCH but does not address deactivation. The catalog explicitly requires deactivation support and states it "cannot orphan required manager/lead relationships." |
| Impact | Deactivation is a required operation per the catalog. Without an explicit endpoint or method, implementation may not support it. |
| Recommended fix | Add explicit deactivation method/path: `POST /api/v1/companies/:companyId/branches/:branchId/deactivate` (or use PATCH with `{ "is_active": false }`). State: "Deactivation verifies no orphaned head/lead/manager references before setting is_active=false." |

---

### 8. MEMBERSHIP-INVITE — `POST /api/v1/companies/:companyId/members`

**Proposal:** actor "owner/admin"
**Catalog API-COMPANY-003:** actor "company owner/admin"

| Attribute | Proposal | Catalog | Match |
|---|---|---|---|
| Method | POST | TBD | PROPOSED |
| Path | `/companies/:companyId/members` | TBD | PROPOSED |
| Actor | owner/admin | company owner/admin | ✓ |

**Finding PROP-09 — MEDIUM**

| | |
|---|---|
| Severity | **MEDIUM** |
| Section | MEMBERSHIP-INVITE — request DTO and employee_code/work_email uniqueness |
| Source | `04_companies.sql:291-292`: `UNIQUE (company_id, employee_code)`, `UNIQUE (company_id, work_email)` |
| Evidence | The SQL has two unique constraints: `unique_company_employee_code` and `unique_company_work_email`. The proposal does not address how these constraints are enforced in the request DTO. The scope (`PHASE-09-B-IDENTITY-COMPANIES-SCOPE.md:49`) requires: "Work email, employee code और membership uniqueness database constraints के साथ consistent रहें." |
| Impact | Without DTO validation, database constraint violations will surface as raw errors instead of approved Decision-06 VALIDATION_ERROR. |
| Recommended fix | Add to MEMBERSHIP-INVITE: "Request DTO validates employee_code and work_email uniqueness within company. Duplicate values return VALIDATION_ERROR." |

---

### 9. MEMBERSHIP-ACCEPT — `POST /api/v1/membership-invitations/:invitationId/accept`

**Proposal:** actor "invitation-authorized user", status "NEEDS SOURCE/DECISION"
**Catalog API-COMPANY-003:** no explicit accept-flow endpoint

**Finding PROP-10 — BLOCKER**

| | |
|---|---|
| Severity | **BLOCKER** |
| Section | MEMBERSHIP-ACCEPT |
| Source | `04_companies.sql:234-306`: `company_members` table has `invited_at`, `invited_by` but no invitation token/id column; no separate invitations table |
| Evidence | The proposal creates `POST /api/v1/membership-invitations/:invitationId/accept` which implies: (1) a separate invitations table or token mechanism, (2) an `invitationId` path parameter, (3) an accept endpoint that changes membership state. None of these exist in the SQL baseline. The catalog (`PHASE-06-API-CATALOG.md:309`) says "invitation event only after approved contract is mapped" — this refers to outbox events, not API contracts. The proposal correctly marks this as "NEEDS SOURCE/DECISION." |
| Impact | The endpoint is based on infrastructure that does not exist in the baseline SQL. Implementing it without a decision would invent an invitation token mechanism. |
| Recommended fix | This is correctly flagged as NEEDS SOURCE/DECISION. Before freeze, decide: (1) Create an `invitations` table with token/expiry in a new migration, OR (2) Use the existing `company_members` row lifecycle (invite creates inactive row; accept sets `is_active=true`) without a separate invitation token, OR (3) Defer to a later phase. The proposal must not implement this endpoint until the decision is made. |

---

### 10. MEMBERSHIP-DEACTIVATE — `POST /api/v1/companies/:companyId/members/:memberId/deactivate`

**Proposal:** actor "owner/admin"
**Catalog API-COMPANY-003:** actor "company owner/admin"

| Attribute | Proposal | Catalog | Match |
|---|---|---|---|
| Method | POST | TBD | PROPOSED |
| Path | `/companies/:companyId/members/:memberId/deactivate` | TBD | PROPOSED |
| Actor | owner/admin | company owner/admin | ✓ |

**Finding PROP-11 — MEDIUM**

| | |
|---|---|
| Severity | **MEDIUM** |
| Section | MEMBERSHIP-DEACTIVATE — relationship reassignment guard |
| Source | `PHASE-06-API-CATALOG.md:314`: "Acceptance: active owner/lead/manager relationships cannot be deactivated without reassignment"; `04_companies.sql:313-321`: RESTRICT FK on head/lead/manager |
| Evidence | The proposal does not explicitly state the reassignment guard. The catalog and SQL both require that department-head, team-lead, and manager references be resolved before deactivation. The scope (`PHASE-09-B-IDENTITY-COMPANIES-SCOPE.md:46`) also requires this. |
| Impact | Implementation may attempt deactivation without checking for active head/lead/manager references, causing FK violation errors instead of graceful reassignment prompts. |
| Recommended fix | Add to MEMBERSHIP-DEACTIVATE: "Deactivation verifies no active department-head, team-lead, or manager references. If unresolved references exist, returns VALIDATION_ERROR with list of conflicts. Reassignment must complete before deactivation." |

---

### 11. MEMBERSHIP-LEAVE — `POST /api/v1/companies/:companyId/membership/leave`

**Proposal:** actor "active member"

**Finding PROP-12 — MEDIUM**

| | |
|---|---|
| Severity | **MEDIUM** |
| Section | MEMBERSHIP-LEAVE — self-service leave and relationship guard |
| Source | `04_companies.sql:313-321`: RESTRICT FK on head/lead/manager; `04_companies.sql:80`: `owner_id ON DELETE RESTRICT` |
| Evidence | The proposal allows an active member to leave voluntarily. However, the SQL RESTRICT FKs on department-head, team-lead, and manager mean that a member with active relationships cannot be removed. The scope (`PHASE-09-B-IDENTITY-COMPANIES-SCOPE.md:46`) requires reassignment before deactivation. Additionally, the company owner cannot leave without transferring ownership first (scope line 44-45). The proposal does not address these guards for self-service leave. |
| Impact | A member with active head/lead/manager references may attempt to leave, causing FK violations. The company owner may attempt to leave without transferring ownership. |
| Recommended fix | Add to MEMBERSHIP-LEAVE: "Self-service leave enforces the same relationship reassignment guards as admin deactivation. Company owner cannot leave without prior ownership transfer. If unresolved references exist, returns VALIDATION_ERROR." |

---

### 12. MEMBERSHIP-REJOIN — `POST /api/v1/companies/:companyId/membership/rejoin`

**Proposal:** actor "previously associated user"
**SQL:** `unique_member_per_company UNIQUE (company_id, user_id)` — reactivation is the only option

**Finding PROP-13 — MEDIUM**

| | |
|---|---|
| Severity | **MEDIUM** |
| Section | MEMBERSHIP-REJOIN — `joined_at` behavior |
| Source | `04_companies.sql:258,277-279`: `joined_at TIMESTAMPTZ`, `is_active = FALSE OR joined_at IS NOT NULL` |
| Evidence | The proposal correctly identifies that rejoin reactivates the existing membership row (consistent with the unique constraint). However, it does not specify what happens to `joined_at`. Options: (a) overwrite with rejoin timestamp — loses original join date; (b) preserve original — no visible indicator of rejoin; (c) add `rejoined_at` — requires schema change (not in SQL 01–18). |
| Impact | Inconsistent timestamp handling across implementations. |
| Recommended fix | Explicitly state the `joined_at` policy: "Rejoin updates `is_active=true`, clears `left_at`, and updates `joined_at` to the reactivation timestamp. The original join date is preserved in `created_at`. The leave/rejoin cycle is tracked through `left_at` and `invited_at`." |

---

### 13. Cross-cutting: error envelope

**Proposal:** "Responses use the stable envelope and exclude secrets, token hashes and sensitive audit metadata."
**Decision-06:** 16 approved error codes.

**Finding PROP-14 — LOW**

| | |
|---|---|
| Severity | **LOW** |
| Section | DTO rules — error envelope |
| Source | `DECISION-06-API-ERROR-VOCABULARY-HINGLISH.md` |
| Evidence | The proposal references the stable envelope but does not map specific error codes to each endpoint. The catalog defines per-endpoint error lists (e.g., AUTH-BOOTSTRAP: VALIDATION_ERROR, UNAUTHORIZED, IDEMPOTENCY_CONFLICT, RATE_LIMITED, INTERNAL_ERROR). |
| Impact | Implementation may use incorrect error codes for specific failure modes. |
| Recommended fix | Add per-endpoint error code mapping during freeze, aligned with the catalog's error lists. |

---

### 14. Cross-cutting: outbox event disposition

**Proposal:** "Mutations include idempotency/expected revision only where the catalog or SQL requires them; no generic store is invented."
**Scope:** "Outbox event केवल approved versioned contract और registered route होने पर producer किया जाएगा"

**Finding PROP-15 — LOW**

| | |
|---|---|
| Severity | **LOW** |
| Section | DTO rules — outbox |
| Source | `PHASE-09-B-IDENTITY-COMPANIES-SCOPE.md:34` |
| Evidence | The proposal does not explicitly state the outbox rule for each endpoint. The scope requires outbox events only with approved contracts. |
| Impact | Implementation may emit unauthorized events. |
| Recommended fix | Add to DTO rules: "Outbox events are emitted only when an approved versioned contract and registered dispatcher route exist. No event is invented or emitted without explicit authorization." |

---

### 15. Cross-cutting: transaction behavior

**Proposal:** No explicit transaction behavior stated.
**Catalog:** "invite/activate/deactivate/reassign relationships atomic" (API-COMPANY-003)

**Finding PROP-16 — LOW**

| | |
|---|---|
| Severity | **LOW** |
| Section | Missing transaction specification |
| Source | `PHASE-06-API-CATALOG.md:308` |
| Evidence | The proposal does not specify transaction boundaries for any endpoint. The catalog requires atomic transactions for membership operations. |
| Impact | Implementation may not correctly atomicize business rows with audit/history. |
| Recommended fix | Add to DTO rules: "Every mutating endpoint commits business row + required audit/history in one atomic transaction. External calls remain outside the transaction." |

---

## Scope creep check

| Check | Status |
|---|---|
| Jobs, candidates, applications, referrals, interviews, messages, notifications excluded | ✓ |
| New subscription/provider behavior excluded | ✓ |
| New SQL tables/events/queue names excluded | ✓ |
| Direct browser-to-Supabase writes excluded | ✓ |
| No invented API paths without catalog/requirement source | ✓ (MEMBERSHIP-ACCEPT is correctly flagged) |
| No invented actors without catalog authorization | ✓ (all actors align or are flagged) |

**No scope creep detected.** The proposal stays within Phase 09-B boundaries and correctly flags areas where decisions are needed.

---

## ISSUE LOG

| Issue ID | Severity | Endpoint | Finding | Impact | Resolution |
|---|---|---|---|---|---|
| PROP-10 | **BLOCKER** | MEMBERSHIP-ACCEPT | Invitation source/table does not exist in SQL baseline | Endpoint based on non-existent infrastructure | NEEDS_DECISION (correctly flagged) |
| PROP-01 | **MEDIUM** | AUTH-BOOTSTRAP | User row creation ownership not clarified | Risk of duplicate user row creation | Clarify: NestJS reads trigger-created row |
| PROP-03 | **MEDIUM** | AUTH-ME | No explicit catalog entry for current-user profile read | Potential scope creep | Add catalog entry or derive from scope |
| PROP-05 | **MEDIUM** | COMPANY-CREATE | "Eligible authenticated user" not defined | Undefined eligibility policy | NEEDS_DECISION (correctly flagged) |
| PROP-06 | **MEDIUM** | COMPANY-READ | Authorization check not explicit | Cross-company read isolation gap | Add membership/ownership verification |
| PROP-09 | **MEDIUM** | MEMBERSHIP-INVITE | employee_code/work_email uniqueness not in DTO | Raw DB errors instead of VALIDATION_ERROR | Add DTO validation |
| PROP-11 | **MEDIUM** | MEMBERSHIP-DEACTIVATE | Relationship reassignment guard not stated | FK violations on active head/lead/manager | Add reassignment guard |
| PROP-12 | **MEDIUM** | MEMBERSHIP-LEAVE | Self-service leave guards not stated | Owner can leave without transfer; FK violations | Add same guards as admin deactivate |
| PROP-13 | **MEDIUM** | MEMBERSHIP-REJOIN | `joined_at` behavior not specified | Inconsistent timestamp handling | Specify joined_at policy |
| PROP-02 | **LOW** | AUTH-BOOTSTRAP | Outbox not addressed | Risk of unauthorized event | Add: none unless approved contract |
| PROP-04 | **LOW** | AUTH-SESSION | Revoke granularity undecided | Implementation may support only one | NEEDS_DECISION (correctly flagged) |
| PROP-07 | **LOW** | COMPANY-UPDATE | Owner/status change protection not stated | Unsafe changes may be allowed | Add owner transfer guard |
| PROP-08 | **LOW** | ORG-BRANCH/DEPT/TEAM | Deactivation endpoint not explicit | Missing required operation | Add deactivation method/path |
| PROP-14 | **LOW** | All | Per-endpoint error codes not mapped | Incorrect error codes | Map during freeze |
| PROP-15 | **LOW** | All | Outbox rule not in DTO rules | Unauthorized events | Add outbox rule |
| PROP-16 | **LOW** | All | Transaction behavior not stated | Non-atomic operations | Add transaction rule |

---

## Verification summary

| Category | Endpoints | Status |
|---|---|---|
| Auth bootstrap/profile | AUTH-BOOTSTRAP, AUTH-ME | MEDIUM (ownership, catalog authorization) |
| Session/security | AUTH-SESSION | LOW (granularity) |
| Company CRUD | COMPANY-CREATE, COMPANY-READ, COMPANY-UPDATE | MEDIUM (eligibility, authorization) |
| Org administration | ORG-BRANCH, ORG-DEPARTMENT, ORG-TEAM | LOW (deactivation) |
| Membership | MEMBERSHIP-INVITE, MEMBERSHIP-ACCEPT, MEMBERSHIP-DEACTIVATE, MEMBERSHIP-LEAVE, MEMBERSHIP-REJOIN | BLOCKER + MEDIUM (invitation source, guards, timestamps) |
| Cross-cutting | Error envelope, outbox, transactions | LOW (documentation) |

---

## FINAL VERDICT

### **CONDITIONAL PASS**

The proposal is well-structured, correctly maps to the approved scope, and does not
invent unsupported behavior. All 14 proposed endpoints align with or are derived from
the frozen API catalog. The proposal correctly marks areas requiring decisions as
NEEDS_DECISION or NEEDS SOURCE/DECISION.

**1 BLOCKER (correctly flagged by proposal):**
- MEMBERSHIP-ACCEPT requires an invitation token/table mechanism that does not exist
  in the SQL baseline. This is correctly identified as "NEEDS SOURCE/DECISION."
  The proposal must not implement this endpoint until the invitation infrastructure
  decision is made.

**8 MEDIUM findings:**
- AUTH-BOOTSTRAP user row ownership (PROP-01)
- AUTH-ME catalog authorization (PROP-03)
- COMPANY-CREATE eligibility (PROP-05)
- COMPANY-READ authorization check (PROP-06)
- MEMBERSHIP-INVITE DTO validation (PROP-09)
- MEMBERSHIP-DEACTIVATE reassignment guard (PROP-11)
- MEMBERSHIP-LEAVE self-service guards (PROP-12)
- MEMBERSHIP-REJOIN `joined_at` behavior (PROP-13)

**7 LOW findings:**
Documentation and cross-cutting concerns that should be addressed during freeze.

**Conditions for freeze approval:**
1. Resolve the MEMBERSHIP-ACCEPT invitation infrastructure decision
2. Add explicit authorization checks to COMPANY-READ and COMPANY-CREATE
3. Add relationship reassignment guards to MEMBERSHIP-DEACTIVATE and MEMBERSHIP-LEAVE
4. Specify `joined_at` behavior for MEMBERSHIP-REJOIN
5. Clarify AUTH-BOOTSTRAP user row ownership boundary
6. Add per-endpoint error code mapping
7. Add transaction and outbox rules to DTO section

**The proposal is safe to proceed to the decision/freeze phase after these conditions are addressed.**
