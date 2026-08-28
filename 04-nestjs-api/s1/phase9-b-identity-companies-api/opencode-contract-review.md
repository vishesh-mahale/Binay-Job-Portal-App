# Phase 09-B — Identity & Company API Contract Freeze Review

Status: `BLOCKED`

Reviewer: opencode (Independent Senior API Architect and Multi-Tenant Security Reviewer)
Audit target: `04-nestjs-api/PHASE-09-B-API-CONTRACT-FREEZE.md`
Date: 2026-08-26

---

## Review methodology

Every contract row was verified against the frozen API catalog (`PHASE-06-API-CATALOG.md` §3A/§3B),
approved architecture (`PHASE-07-ARCHITECTURE.md`), implementation plan (`PHASE-08-IMPLEMENTATION-PLAN.md`),
final requirements (`PHASE-05-FINAL-REQUIREMENTS.md`), SQL baseline (`03_users_auth.sql`, `04_companies.sql`,
`17_rls.sql`), Decision-01 access model, Decision-06 error vocabulary, and the approved scope
(`PHASE-09-B-IDENTITY-COMPANIES-SCOPE.md`). Previous agent reports were not trusted; every
finding is verified against source.

---

## Contract row verification

### AUTH-BOOTSTRAP — BLOCKED

**Worksheet:** path TBD, method TBD, actor "verified active user", idempotency "existing user identity"
**Catalog API-AUTH-001:** path TBD ("auth signup/callback boundary must be confirmed with Supabase Auth"), method TBD, actor "unauthenticated signup user / authenticated callback"

| Attribute | Worksheet | Catalog API-AUTH-001 | Match |
|---|---|---|---|
| Actor | verified active user | unauthenticated signup user / authenticated callback | **CONFLICT** |
| Permission | verified active user | provider verification and server-controlled account status | DIFFERENT |
| Request DTO | TBD | provider payload; never trust client role/status | DIFFERENT |
| Response DTO | TBD | safe public user/account summary; no privileged fields or secrets | DIFFERENT |
| Transaction | not stated | user-row bootstrap and audit state must be atomic where NestJS owns the command | MISSING |
| Outbox | not stated | TBD by approved auth event contract; no event invented here | MISSING |
| Idempotency | existing user identity | provider subject/global user identity uniqueness; repeat callback must be safe | DIFFERENT |
| Errors | not stated | VALIDATION_ERROR, UNAUTHORIZED, IDEMPOTENCY_CONFLICT, RATE_LIMITED, INTERNAL_ERROR | MISSING |

**Finding CONTRACT-01 — BLOCKER**

| | |
|---|---|
| Severity | **BLOCKER** |
| Section | AUTH-BOOTSTRAP contract row |
| Source | `PHASE-06-API-CATALOG.md:200` vs `PHASE-09-B-API-CONTRACT-FREEZE.md:18` |
| Evidence | Catalog defines API-AUTH-001 actor as "unauthenticated signup user / authenticated callback." Worksheet defines AUTH-BOOTSTRAP actor as "verified active user." These are fundamentally different authentication states. |
| Impact | If the endpoint requires a verified active user, it cannot serve the signup/callback flow that the catalog authorizes. If the endpoint serves the signup/callback flow, the worksheet actor is wrong. This determines whether NestJS handles the initial user row creation boundary or only post-login profile reads. The `handle_new_user()` trigger creates the user row after `auth.users` insert (`03_users_auth.sql:199-266`); if NestJS also creates the user row, duplicate key conflicts or race conditions may occur. |
| Recommended fix | Split into two clearly separated contracts: (1) **AUTH-SIGNUP-CALLBACK** — unauthenticated/authenticated callback boundary for Supabase Auth signup/verification, actor "unauthenticated signup user / authenticated callback," handling the trigger-created user row read (not create); (2) **AUTH-PROFILE-READ** — authenticated user profile read using verified request context, actor "verified active user." Alternatively, if the worksheet intentionally excludes the signup/callback flow (leaving it to Supabase Auth + trigger), explicitly state: "AUTH-BOOTSTRAP covers only post-login profile read; Supabase Auth signup/callback is handled by the auth provider + `handle_new_user()` trigger, not by this NestJS endpoint." |

**Finding CONTRACT-02 — MEDIUM**

| | |
|---|---|
| Severity | **MEDIUM** |
| Section | AUTH-BOOTSTRAP contract row — outbox disposition |
| Source | `PHASE-06-API-CATALOG.md:207`: "Outbox/consumer: TBD by approved auth event contract; no event invented here" |
| Evidence | Catalog explicitly marks the outbox event as TBD. The worksheet's non-negotiable rules state "unapproved event emit नहीं होगा" but the AUTH-BOOTSTRAP row does not address outbox disposition. |
| Impact | If NestJS emits an auth-related outbox event during bootstrap without an approved contract, it violates the non-negotiable rules. The contract must explicitly state "no outbox event unless an approved auth event contract exists" to prevent invented events. |
| Recommended fix | Add to AUTH-BOOTSTRAP: "Outbox: none unless an approved auth event contract exists; no event invented." |

---

### AUTH-SESSION — PASS WITH MINOR FIXES

**Worksheet:** path TBD, method TBD, actor "authenticated user", idempotency "session identity"
**Catalog API-AUTH-002:** path TBD, actor "authenticated user"

| Attribute | Worksheet | Catalog API-AUTH-002 | Match |
|---|---|---|---|
| Actor | authenticated user | authenticated user | ✓ |
| Permission | authenticated user | own session/security records; admin-only operations remain separate | ✓ |
| Request DTO | TBD | authenticated JWT and operation-specific DTO; no client user_id trust | ✓ |
| Response DTO | TBD | safe session/security status | ✓ |
| Transaction | not stated | each state-changing security command is atomic with its audit record | MISSING |
| Outbox | not stated | none unless an approved auth event contract exists | MISSING |
| Idempotency | session identity | logout/revoke operations safe on retry | ✓ |
| Errors | not stated | UNAUTHORIZED, FORBIDDEN, NOT_FOUND, RATE_LIMITED, INTERNAL_ERROR | MISSING |

**Finding CONTRACT-03 — LOW**

| | |
|---|---|
| Severity | **LOW** |
| Section | AUTH-SESSION contract row — transaction and outbox disposition |
| Source | `PHASE-06-API-CATALOG.md:226-227` |
| Evidence | Catalog states "each state-changing security command is atomic with its audit record" and "none unless an approved auth event contract exists." The worksheet row does not explicitly state these. |
| Impact | Implementation may not correctly atomicize security commands with audit records, or may emit unauthorized events. |
| Recommended fix | Add to AUTH-SESSION: "Transaction: each state-changing security command atomic with its audit record. Outbox: none unless an approved auth event contract exists." |

**Finding CONTRACT-04 — LOW**

| | |
|---|---|
| Severity | **LOW** |
| Section | AUTH-SESSION contract row — reads boundary |
| Source | `PHASE-06-API-CATALOG.md:224`: "Reads: public.users, user_sessions, user_security_log, login_history" |
| Evidence | The catalog explicitly lists the tables read by AUTH-SESSION. The worksheet does not map reads to tables. |
| Impact | Without explicit table mapping, implementation may read tables outside the authorized boundary or miss required reads. |
| Recommended fix | Add table reads to AUTH-SESSION: "Reads: users, user_sessions, user_security_log, login_history." |

---

### COMPANY-COMMAND — PASS WITH MINOR FIXES

**Worksheet:** path TBD, method TBD, actor "owner/admin", idempotency "company identity/domain key"
**Catalog API-COMPANY-001:** path TBD ("company CRUD resource"), actor "employer/owner/admin according to policy"

| Attribute | Worksheet | Catalog API-COMPANY-001 | Match |
|---|---|---|---|
| Actor | owner/admin | employer/owner/admin according to policy | ✓ |
| Permission | owner/admin | company ownership/membership and company-management permission | ✓ |
| Request DTO | TBD | server-derived owner/tenant; slug/name/business fields validated against SQL | ✓ |
| Response DTO | TBD | safe company profile and lifecycle state | ✓ |
| Transaction | not stated | business row + history/audit/outbox atomic where event is approved | MISSING |
| Outbox | not stated | TBD; no event invented | MISSING |
| Idempotency | company identity/domain key | client command retry must not duplicate company identity | ✓ |
| Errors | not stated | VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, NOT_FOUND, RATE_LIMITED | MISSING |

**Finding CONTRACT-05 — LOW**

| | |
|---|---|
| Severity | **LOW** |
| Section | COMPANY-COMMAND contract row — CRUD operations and transaction/outbox |
| Source | `PHASE-06-API-CATALOG.md:261`: "Method/path: TBD — company CRUD resource" |
| Evidence | The catalog says "CRUD resource" but the worksheet does not explicitly state which CRUD operations (create, read, update, soft-delete) are included. Transaction and outbox disposition are also not stated. |
| Impact | Ambiguity in scope — does COMPANY-COMMAND cover all four CRUD operations or a subset? |
| Recommended fix | Add to COMPANY-COMMAND: "Operations: create, read, update, soft-delete lifecycle. Transaction: business row + history/audit/outbox atomic where event is approved. Outbox: TBD; no event invented." |

---

### ORG-ADMIN — PASS WITH MINOR FIXES

**Worksheet:** path TBD, method TBD, actor "company owner/admin", idempotency "domain key"
**Catalog API-COMPANY-002:** path TBD ("nested company administration resources"), actor "company owner/admin with management permission"

| Attribute | Worksheet | Catalog API-COMPANY-002 | Match |
|---|---|---|---|
| Actor | company owner/admin | company owner/admin with management permission | ✓ |
| Permission | company owner/admin | same-company ownership and relationship permissions | ✓ |
| Request DTO | TBD | company_id from authorized context; parent relationships validated | ✓ |
| Response DTO | TBD | branch/department/team resource with active/retained state | ✓ |
| Transaction | not stated | relationship changes and safety checks atomic; no hard-delete shortcut | MISSING |
| Outbox | not stated | TBD according to existing contracts only | MISSING |
| Idempotency | domain key | safe retry for create/update/deactivate commands | ✓ |
| Errors | not stated | VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, NOT_FOUND, RATE_LIMITED | MISSING |

**Finding CONTRACT-06 — LOW**

| | |
|---|---|
| Severity | **LOW** |
| Section | ORG-ADMIN contract row — sub-resources and transaction/outbox |
| Source | `PHASE-06-API-CATALOG.md:281`: "Method/path: TBD — nested company administration resources" |
| Evidence | The catalog describes "nested company administration resources" (branches, departments, teams). The worksheet does not clarify whether ORG-ADMIN covers create, update, deactivate, or all three for each sub-resource. Transaction and outbox are also not stated. |
| Impact | Implementation ambiguity — three separate sub-resources (branches, departments, teams) each with create/update/deactivate operations. |
| Recommended fix | Add to ORG-ADMIN: "Sub-resources: branches, departments, teams. Operations: create, update, deactivate for each. Transaction: relationship changes and safety checks atomic; no hard-delete shortcut. Outbox: TBD according to existing contracts only." |

---

### MEMBERSHIP-COMMAND — BLOCKED

**Worksheet:** path TBD, method TBD, actor "owner/admin or invited user as applicable", idempotency "membership unique key"
**Catalog API-COMPANY-003:** path TBD ("membership commands"), actor "company owner/admin"

| Attribute | Worksheet | Catalog API-COMPANY-003 | Match |
|---|---|---|---|
| Actor | owner/admin or invited user as applicable | company owner/admin | **PARTIAL CONFLICT** |
| Permission | owner/admin or invited user as applicable | same-company membership-management permission | DIFFERENT |
| Request DTO | TBD | target user/email and company derived/validated server-side; role/status guarded | ✓ |
| Response DTO | TBD | membership summary without secrets | ✓ |
| Transaction | not stated | invite/activate/deactivate/reassign relationships atomic | MISSING |
| Outbox | not stated | TBD; invitation event only after approved contract is mapped | MISSING |
| Idempotency | membership unique key | repeated invite/deactivate commands are safe and deterministic | ✓ |
| Errors | not stated | VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, NOT_FOUND, RATE_LIMITED | MISSING |

**Finding CONTRACT-07 — BLOCKER**

| | |
|---|---|
| Severity | **BLOCKER** |
| Section | MEMBERSHIP-COMMAND contract row — actor ambiguity |
| Source | `PHASE-06-API-CATALOG.md:302` vs `PHASE-09-B-API-CONTRACT-FREEZE.md:22` |
| Evidence | Catalog defines API-COMPANY-003 actor as "company owner/admin." The catalog acceptance rule states "active owner/lead/manager relationships cannot be deactivated without reassignment" — implying only owner/admin can deactivate. The worksheet says "owner/admin or invited user as applicable." The "as applicable" qualifier introduces ambiguity: which specific membership operations can the invited user perform? |
| Impact | If the invited user can accept their own invite, this creates a second actor class for a subset of operations. The catalog does not explicitly authorize the invited user as an actor for any membership operation. Without explicit catalog authorization, adding the invited user as an actor may constitute inventing a business rule. |
| Recommended fix | Either: (1) Explicitly state which operations the invited user can perform and cite the catalog/requirement that authorizes it (e.g., "invited user can accept own invite where catalog authorizes"). Or (2) Align with the catalog: "Actor: company owner/admin for all membership commands; invited user accept-flow is a separate contract with explicit catalog authorization." If the invited user accept-flow is not in the current catalog, it should be added as a separate entry or explicitly excluded. |

**Finding CONTRACT-08 — MEDIUM**

| | |
|---|---|
| Severity | **MEDIUM** |
| Section | MEMBERSHIP-COMMAND contract row — sub-flow decomposition |
| Source | `PHASE-06-API-CATALOG.md:301`: "Method/path: TBD — membership commands" |
| Evidence | The worksheet lists 5 sub-flows in the capability column: invite/add, accept, deactivate, leave, rejoin. The catalog says "membership commands." These are distinct operations with different actors, request DTOs, and response DTOs. The worksheet does not decompose them into separate API endpoints. |
| Impact | A single contract entry covering 5 distinct operations cannot produce a frozen path/method/DTO specification. Each sub-flow needs its own path, method, request DTO, and response DTO. |
| Recommended fix | Decompose MEMBERSHIP-COMMAND into separate contract entries: (1) MEMBERSHIP-INVITE — owner/admin invites user, (2) MEMBERSHIP-ACCEPT — invited user accepts, (3) MEMBERSHIP-DEACTIVATE — owner/admin deactivates member, (4) MEMBERSHIP-LEAVE — member leaves voluntarily, (5) MEMBERSHIP-REJOIN — owner/admin re-invites former member. Each with its own path, method, actor, and DTO. |

**Finding CONTRACT-09 — MEDIUM**

| | |
|---|---|
| Severity | **MEDIUM** |
| Section | MEMBERSHIP-COMMAND — employee_code and work_email uniqueness |
| Source | `04_companies.sql:291-292`: `UNIQUE (company_id, employee_code)`, `UNIQUE (company_id, work_email)` |
| Evidence | SQL has two unique constraints: `unique_company_employee_code` and `unique_company_work_email`. The worksheet's "membership unique key" idempotency covers the `(company_id, user_id)` uniqueness but does not address employee_code and work_email uniqueness. The scope document (`PHASE-09-B-IDENTITY-COMPANIES-SCOPE.md:49`) states "Work email, employee code और membership uniqueness database constraints के साथ consistent रहें" but the contract worksheet does not map these constraints to request DTO validation. |
| Impact | Without explicit DTO validation for employee_code and work_email uniqueness, the database will reject inserts with duplicate values, but the error may not map to the approved Decision-06 vocabulary (it would surface as a raw database error, not a clean VALIDATION_ERROR). |
| Recommended fix | Add to MEMBERSHIP-COMMAND (or its decomposed sub-entries): "Request DTO must validate employee_code and work_email uniqueness within company using existing SQL unique constraints. Duplicate employee_code or work_email returns VALIDATION_ERROR with clear message." |

**Finding CONTRACT-10 — MEDIUM**

| | |
|---|---|
| Severity | **MEDIUM** |
| Section | MEMBERSHIP-COMMAND — rejoin `joined_at` behavior |
| Source | `04_companies.sql:258,277-279`: `joined_at TIMESTAMPTZ`, `is_active = FALSE OR joined_at IS NOT NULL` |
| Evidence | The worksheet's non-negotiable rules state "rejoin existing membership row को reactivate करेगा." This is consistent with the SQL unique constraint `unique_member_per_company`. However, the contract does not specify what happens to `joined_at` during rejoin. Options: (a) overwrite `joined_at` with rejoin timestamp — loses original join date; (b) preserve original `joined_at` — no visible indicator of rejoin; (c) add a separate `rejoined_at` column — requires schema change (not in SQL 01–18). |
| Impact | Without explicit `joined_at` behavior, implementation may inconsistently handle rejoin timestamps. Overwriting loses audit history; preserving creates ambiguity about membership continuity. The scope document says "Rejoin reactivates the existing membership row" but does not address timestamp semantics. |
| Recommended fix | Explicitly state the `joined_at` policy in the contract: "Rejoin reactivates the existing membership row. `joined_at` is updated to the reactivation timestamp. The original join date is preserved in `created_at` and the leave/rejoin cycle is tracked through `left_at` and `invited_at`." Or, if the original `joined_at` should be preserved, state: "`joined_at` retains the original join timestamp; the rejoin event is audited through `invited_at` and `left_at`." |

---

## Non-negotiable rules verification

| Rule | Source | Status |
|---|---|---|
| Ownership/company ID/actor identity server-side derived | Decision-01, Phase 07 §5 | ✓ |
| Error responses in Decision-06 envelope | Decision-06 | ✓ |
| Expected revision/idempotency mandatory where catalog demands | Phase 06 §1 | ✓ |
| Business row + audit/history + approved outbox in one transaction | Phase 07 §6 | ✓ |
| No direct browser-to-Supabase business writes | Decision-01 | ✓ |
| No secrets/token hashes/sensitive audit in response | Phase 06 §1 | ✓ |
| Rejoin reactivates existing membership row | SQL unique constraint | ✓ |
| Owner transfer/deactivation guards mandatory | Scope §Security acceptance criteria 4–5 | ✓ |

All non-negotiable rules are consistent with source documents.

---

## Cross-company isolation verification

| Contract | Isolation mechanism | Source | Status |
|---|---|---|---|
| AUTH-BOOTSTRAP | User reads own profile via JWT `sub` claim | Decision-01 | ✓ |
| AUTH-SESSION | User reads own session/security via JWT | Decision-01 | ✓ |
| COMPANY-COMMAND | company_id derived from JWT/membership, never client-supplied | Phase 06 §3B | ✓ |
| ORG-ADMIN | company_id derived from authorized context | Phase 06 §3B | ✓ |
| MEMBERSHIP-COMMAND | target company derived server-side; same-company membership enforced | Phase 06 §3B | ✓ |

Cross-company isolation is correctly addressed in all contract entries.

---

## PII and secret protection verification

| Contract | PII handling | Source | Status |
|---|---|---|---|
| AUTH-BOOTSTRAP | "safe public user/account summary; no privileged fields or secrets" | Catalog API-AUTH-001 | ✓ |
| AUTH-SESSION | "safe session/security status" | Catalog API-AUTH-002 | ✓ |
| COMPANY-COMMAND | "safe company profile and lifecycle state" | Catalog API-COMPANY-001 | ✓ |
| ORG-ADMIN | "branch/department/team resource with active/retained state" | Catalog API-COMPANY-002 | ✓ |
| MEMBERSHIP-COMMAND | "membership summary without secrets" | Catalog API-COMPANY-003 | ✓ |

All contract entries correctly reference safe DTO responses without secrets/PII.

---

## RLS/UserContextClient/SystemClient boundary verification

| Contract | Client boundary | Source | Status |
|---|---|---|---|
| AUTH-BOOTSTRAP | SystemClient (user row bootstrap is a write) | Decision-01, Phase 07 §5 | ✓ |
| AUTH-SESSION | SystemClient (session/security writes) | Catalog API-AUTH-002 | ✓ |
| COMPANY-COMMAND | SystemClient (company writes) | Decision-01, Phase 07 §5 | ✓ |
| ORG-ADMIN | SystemClient (org structure writes) | Decision-01, Phase 07 §5 | ✓ |
| MEMBERSHIP-COMMAND | SystemClient (membership writes) | Decision-01, Phase 07 §5 | ✓ |

UserContextClient is not applicable for any contract entry because all five contracts involve writes or trusted reads. This is consistent with Decision-01: "UserContextClient only for approved user-context reads with RLS; SystemClient for all business writes."

For user profile reads (if AUTH-BOOTSTRAP includes a profile read sub-flow), UserContextClient + RLS would apply per the `users_own_read` policy (`17_rls.sql:178`).

---

## Missing capabilities check

| Capability | In scope? | In contract? | Status |
|---|---|---|---|
| User profile read (post-login) | Yes (scope use case 1) | Partially in AUTH-BOOTSTRAP | NEEDS_CLARIFICATION |
| Account status/role check | Yes (scope use case 2) | Implicit in AuthGuard | OK (not a standalone endpoint) |
| Company create | Yes (scope use case 3) | In COMPANY-COMMAND | ✓ |
| Company read | Yes (scope use case 3) | In COMPANY-COMMAND | ✓ |
| Company update | Yes (scope use case 3) | In COMPANY-COMMAND | ✓ |
| Company soft-delete | Yes (scope use case 3) | In COMPANY-COMMAND | NEEDS_CLARIFICATION |
| Branch create/update/deactivate | Yes (scope use case 4) | In ORG-ADMIN | ✓ |
| Department create/update/deactivate | Yes (scope use case 4) | In ORG-ADMIN | ✓ |
| Team create/update/deactivate | Yes (scope use case 4) | In ORG-ADMIN | ✓ |
| Membership invite | Yes (scope use case 5) | In MEMBERSHIP-COMMAND | ✓ |
| Membership accept | Yes (scope use case 5) | In MEMBERSHIP-COMMAND | ✓ |
| Membership deactivate | Yes (scope use case 5) | In MEMBERSHIP-COMMAND | ✓ |
| Membership leave | Yes (scope use case 5) | In MEMBERSHIP-COMMAND | ✓ |
| Membership rejoin | Yes (scope use case 5) | In MEMBERSHIP-COMMAND | ✓ |
| Session management | Phase 08-B scope | In AUTH-SESSION | ✓ |
| Login history audit | Phase 08-B scope | Implicit in AUTH-SESSION | NEEDS_CLARIFICATION |

---

## ISSUE LOG

| Issue ID | Severity | Contract | Finding | Impact | Fix |
|---|---|---|---|---|---|
| CONTRACT-01 | **BLOCKER** | AUTH-BOOTSTRAP | Actor mismatch: catalog says "unauthenticated signup user / authenticated callback"; worksheet says "verified active user" | Determines whether NestJS handles signup/callback boundary or only post-login reads | Split into two contracts or explicitly state scope boundary |
| CONTRACT-07 | **BLOCKER** | MEMBERSHIP-COMMAND | Actor ambiguity: "owner/admin or invited user as applicable" — catalog only authorizes "company owner/admin" | May invent unauthorized actor for membership operations | Align with catalog or cite authorization source |
| CONTRACT-02 | **MEDIUM** | AUTH-BOOTSTRAP | Outbox disposition not stated; catalog says "TBD by approved auth event contract" | Risk of unauthorized event emission | Add explicit outbox: none unless approved contract exists |
| CONTRACT-08 | **MEDIUM** | MEMBERSHIP-COMMAND | 5 sub-flows not decomposed into separate API endpoints | Single contract cannot produce frozen path/method/DTO | Decompose into 5 separate contract entries |
| CONTRACT-09 | **MEDIUM** | MEMBERSHIP-COMMAND | employee_code and work_email uniqueness not mapped to DTO validation | Database rejects produce raw errors, not approved VALIDATION_ERROR | Add DTO validation for SQL unique constraints |
| CONTRACT-10 | **MEDIUM** | MEMBERSHIP-COMMAND | Rejoin `joined_at` behavior not specified | Inconsistent timestamp handling across implementations | Explicitly state joined_at policy |
| CONTRACT-03 | **LOW** | AUTH-SESSION | Transaction and outbox disposition not stated | Implementation may not correctly atomicize security commands | Add transaction/outbox rules |
| CONTRACT-04 | **LOW** | AUTH-SESSION | Table reads not mapped | May read outside authorized boundary | Add table read list |
| CONTRACT-05 | **LOW** | COMPANY-COMMAND | CRUD operations not enumerated; transaction/outbox missing | Scope ambiguity | Add explicit operations and transaction rules |
| CONTRACT-06 | **LOW** | ORG-ADMIN | Sub-resources and operations not decomposed; transaction/outbox missing | Implementation ambiguity | Add sub-resource decomposition and transaction rules |

---

## Verification summary

| Contract | Verdict | Blockers |
|---|---|---|
| AUTH-BOOTSTRAP | **BLOCKED** | Actor mismatch with catalog (CONTRACT-01) |
| AUTH-SESSION | PASS WITH MINOR FIXES | — |
| COMPANY-COMMAND | PASS WITH MINOR FIXES | — |
| ORG-ADMIN | PASS WITH MINOR FIXES | — |
| MEMBERSHIP-COMMAND | **BLOCKED** | Actor ambiguity (CONTRACT-07), sub-flow decomposition (CONTRACT-08) |

---

## FINAL VERDICT

### **BLOCKED**

Two contract entries have BLOCKER findings that prevent freeze approval:

**1. AUTH-BOOTSTRAP (CONTRACT-01):** The actor definition conflicts with the API catalog.
The catalog (`PHASE-06-API-CATALOG.md:200`) defines API-AUTH-001 actor as
"unauthenticated signup user / authenticated callback." The worksheet defines
AUTH-BOOTSTRAP actor as "verified active user." This is not a naming difference;
it determines whether the endpoint handles the Supabase Auth signup/callback
boundary (unauthenticated/authenticated) or only post-login profile reads
(verified active). The correct treatment must be explicitly decided and documented
before the contract can be frozen.

**2. MEMBERSHIP-COMMAND (CONTRACT-07, CONTRACT-08):** The actor definition introduces
an "invited user" actor class not authorized by the API catalog, and five distinct
sub-flows (invite, accept, deactivate, leave, rejoin) are packed into a single
contract entry without path/method/DTO decomposition. Each sub-flow has a different
actor, different request DTO, and different response DTO. A single contract entry
cannot produce a frozen API specification.

**4 MEDIUM findings** (CONTRACT-02, CONTRACT-08, CONTRACT-09, CONTRACT-10) require
resolution before or during implementation but do not independently block the
contract freeze.

**4 LOW findings** (CONTRACT-03, CONTRACT-04, CONTRACT-05, CONTRACT-06) are
documentation completeness issues that should be addressed for implementation clarity.

**Recommended path to unblock:**
1. Decide and document whether AUTH-BOOTSTRAP covers signup/callback or post-login profile read (or both as separate contracts)
2. Decompose MEMBERSHIP-COMMAND into 5 separate contract entries with explicit actors
3. Resolve the 4 MEDIUM findings
4. Address the 4 LOW findings
5. Re-run this review after corrections
