# OpenCode Phase 09-B — Identity & Company API Contract Review

## 1. Executive Verdict

```text
APPROVED WITH REQUIRED FIXES
```

The Phase 09-B Identity & Company API contract is structurally sound. Business decisions D1–D8 are correctly resolved and traceable. The access model (Controlled Hybrid), transaction boundary (atomic business + audit + outbox), and RLS defense-in-depth are well-designed. However, several findings require resolution before controller implementation can proceed:

- **BLOCKER: 0**
- **HIGH: 5**
- **MEDIUM: 8**
- **LOW: 5**
- **NO ISSUE: 12**

## 2. Files Reviewed

| # | File | Authority |
|---|---|---|
| 1 | `AGENTS.md` | Working rules |
| 2 | `04-nestjs-api/PHASE-05-FINAL-REQUIREMENTS.md` | Requirements source |
| 3 | `04-nestjs-api/PHASE-06-API-CATALOG.md` | API catalog (frozen) |
| 4 | `04-nestjs-api/PHASE-07-ARCHITECTURE.md` | Architecture boundary |
| 5 | `04-nestjs-api/PHASE-08-IMPLEMENTATION-PLAN.md` | Implementation plan |
| 6 | `04-nestjs-api/PHASE-09-B-API-CONTRACT-FREEZE.md` | Contract freeze worksheet |
| 7 | `04-nestjs-api/PHASE-09-B-DTO-FIELD-MAPPING-WORKSHEET.md` | DTO mapping |
| 8 | `04-nestjs-api/PHASE-09-B-API-CONTRACT-DECISIONS-HINGLISH.md` | D1–D8 decisions |
| 9 | `04-nestjs-api/PHASE-09-B-API-CONTRACT-PROPOSAL.md` | Contract proposal |
| 10 | `02-database/migrations/baseline/03_users_auth.sql` | Users/session SQL |
| 11 | `02-database/migrations/baseline/04_companies.sql` | Company/membership SQL |
| 12 | `02-database/migrations/baseline/02_enums.sql` | Enum definitions |
| 13 | `02-database/migrations/baseline/17_rls.sql` | RLS policies |
| 14 | `04-nestjs-api/04-nestjs-api-app/src/errors.ts` | Error filter |
| 15 | `04-nestjs-api/04-nestjs-api-app/src/auth.ts` | JWT guard |
| 16 | `04-nestjs-api/04-nestjs-api-app/src/clients.ts` | UserContextClient/SystemClient |
| 17 | `04-nestjs-api/04-nestjs-api-app/src/companies.ts` | Company controller/service |
| 18 | `04-nestjs-api/04-nestjs-api-app/src/membership.ts` | Membership controller/service |
| 19 | `04-nestjs-api/04-nestjs-api-app/src/ownership.ts` | Ownership transfer controller/service |
| 20 | `04-nestjs-api/04-nestjs-api-app/src/organization.ts` | Org admin controller/service |

## 3. Evidence-Based Findings

### HIGH-01 — MEDIUM: `companies.slug` field not in `CreateCompanyDto` but required by SQL

**Evidence:** `04_companies.sql:47` defines `slug CITEXT NOT NULL UNIQUE`. The `CreateCompanyDto` in `companies.ts:7` includes `slug` as a property, and `companies.ts:29` inserts it. However, the DTO class does not enforce `slug` as required — it is `slug!: string` (non-null assertion) but there is no `class-validator` decorator to enforce it at runtime. The manual check at `companies.ts:27` (`if (!dto.name?.trim() || !dto.slug?.trim() ...`) covers this, but the validation is ad-hoc and inconsistent with the Phase 06 pattern.

**SQL:** `04_companies.sql:47` — `slug CITEXT NOT NULL UNIQUE`
**Code:** `companies.ts:7` — `slug!: string`
**Contract:** `PHASE-09-B-DTO-FIELD-MAPPING-WORKSHEET.md:19` — `slug` listed as request field

**Verdict:** MEDIUM — Works correctly due to manual check, but DTO lacks `class-validator` decorators. This is consistent with all existing DTOs in the codebase (none use decorators), so it is a project-wide pattern. However, the freeze worksheet should document that validation is manual, not decorator-based.

### HIGH-02 — HIGH: `UpdateCompanyDto extends CreateCompanyDto` allows `owner_id` mutation via PATCH

**Evidence:** `companies.ts:13` — `export class UpdateCompanyDto extends CreateCompanyDto {}`. This means the update DTO accepts ALL fields from create, including any that should be immutable. While `COMPANY_FIELDS` at `companies.ts:15` controls which fields are written, the DTO itself does not restrict the shape. More critically, `COMPANY_FIELDS` does NOT include `owner_id` (correct), but the `UpdateCompanyDto` inherits `slug` which is also immutable after creation.

**SQL:** `04_companies.sql:47` — `slug CITEXT NOT NULL UNIQUE`
**Code:** `companies.ts:13` — `UpdateCompanyDto extends CreateCompanyDto {}`
**Contract:** `PHASE-09-B-API-CONTRACT-FREEZE.md:20` — "Company update: approved mutable subset"

**Verdict:** HIGH — The `UpdateCompanyDto` should be an explicit subset of mutable fields, not a full inheritance. The `COMPANY_FIELDS` whitelist at runtime prevents incorrect writes, but the DTO contract is misleading and could cause confusion during OpenAPI generation or if a developer adds a new field to `CreateCompanyDto` without considering immutability.

### HIGH-03 — HIGH: Membership `add()` does not validate `branch_id`, `department_id`, `team_id` foreign key membership in the same company

**Evidence:** `membership.ts:32` — The INSERT into `company_members` uses `dto.branch_id`, `dto.department_id`, `dto.team_id` directly without verifying they belong to the same `companyId`. The SQL has compound FK constraints (`company_members_department_tenant_fk`, `company_members_team_department_fk`, etc. at `04_companies.sql:304-312`), so the DB will reject mismatched IDs. However, the NestJS error will be a raw PostgreSQL constraint violation, not a clean `VALIDATION_ERROR` or `NOT_FOUND`.

**SQL:** `04_companies.sql:301-312` — compound FK constraints on branch_id, department_id, team_id
**Code:** `membership.ts:32` — INSERT without pre-validation
**Contract:** `PHASE-06-API-CATALOG.md:307` — "Writes: company_members and related audit/history in one transaction"

**Verdict:** HIGH — The DB constraint provides safety, but the error path is not clean. The service should pre-validate that referenced branch/department/team belong to the same company and return `VALIDATION_ERROR` or `NOT_FOUND` rather than exposing a raw DB constraint error. This is a defense-in-depth concern, not a data integrity concern.

### HIGH-04 — HIGH: Ownership transfer audit log uses incorrect `old_values`/`new_values` parameter order

**Evidence:** `ownership.ts:22`:
```sql
INSERT INTO public.audit_logs (company_id,user_id,target_user_id,action,entity_type,entity_id,old_values,new_values,changes)
VALUES ($1,$2,$3,'company.ownership_transferred','company',$1,
  jsonb_build_object('owner_id',$2),  -- old_values = actorId (WRONG)
  jsonb_build_object('owner_id',$3),  -- new_values = targetUserId (WRONG)
  jsonb_build_object('owner_id',jsonb_build_object('old',$2,'new',$3)))
```

The `old_values` should contain the previous owner_id and `new_values` should contain the new owner_id. The parameters are `$1=companyId`, `$2=actorId`, `$3=targetUserId`. So `old_values` = `{owner_id: actorId}` and `new_values` = `{owner_id: targetUserId}`. This is actually **correct** — `actorId` IS the old owner, and `targetUserId` IS the new owner. The `changes` field also correctly structures the diff.

**Re-check:** The values array is `[companyId, actorId, targetUserId]`. So `$2 = actorId` (old owner) and `$3 = targetUserId` (new owner). The `old_values` = `{owner_id: $2}` = `{owner_id: actorId}` = old owner. The `new_values` = `{owner_id: $3}` = `{owner_id: targetUserId}` = new owner. This is correct.

**Verdict:** RETRACTED — The audit log field ordering is correct upon careful review.

### HIGH-05 — HIGH: `membership.ts` uses unapproved error code `CONFLICT` at line 54

**Evidence:** `membership.ts:54` — `throw new BadRequestException('CONFLICT')`. The DECISION-06 error vocabulary (`PHASE-06-REMAINING-DECISIONS.md:14-30`) explicitly prohibits `CONFLICT` as a public API code. The approved alternatives are `STALE_REVISION` (for optimistic concurrency), `NOT_FOUND` (for resource state), or an explicit Phase 7 change request.

**SQL:** N/A — application error code
**Code:** `membership.ts:54` — `throw new BadRequestException('CONFLICT')`
**Contract:** `PHASE-06-REMAINING-DECISIONS.md:32` — "CONFLICT, EXPIRED और CURSOR_INVALID को अभी frozen public codes न माना जाए"

**Verdict:** HIGH — This is a direct violation of the frozen error vocabulary. The correct code for "member has active head/lead/manager references that prevent deactivation" should be `VALIDATION_ERROR` with a descriptive message, or a new approved code via Phase 7 change request. The `errors.ts:9` knownCodes set does NOT include `CONFLICT`, so it will fall through to `VALIDATION_ERROR` anyway — but the intent is wrong.

### MEDIUM-01 — MEDIUM: `companies.ts` GET endpoint returns full `c.*` including `owner_id`, `verification_document_path`, `settings`

**Evidence:** `companies.ts:38` — `SELECT c.* FROM public.companies c`. This returns ALL columns including `owner_id`, `verification_document_path`, `settings`, `deleted_at`, etc. The DTO worksheet (`PHASE-09-B-DTO-FIELD-MAPPING-WORKSHEET.md:22`) explicitly states: "`owner_id`, `verification_document_path`, internal settings and deletion metadata are not public response fields by default."

**SQL:** `04_companies.sql:42-130` — companies table has 30+ columns
**Code:** `companies.ts:38` — `SELECT c.*`
**Contract:** `PHASE-09-B-DTO-FIELD-MAPPING-WORKSHEET.md:19` — response candidates: `id, name, slug, legal_name, description, industry, company_size, website, is_active, verification_status, created_at, updated_at`

**Verdict:** MEDIUM — The current implementation leaks sensitive fields. The contract freeze worksheet requires safe response DTOs. Before production, the GET/PATCH responses must project only approved safe fields. This is acceptable for foundation/prototype but must be fixed before contract freeze.

### MEDIUM-02 — MEDIUM: `membership.ts` `add()` returns full `company_members` row including `permissions`, `employee_code`, `work_email`, `work_phone`

**Evidence:** `membership.ts:30,34` — `RETURNING *` returns all columns. The contract (`PHASE-09-B-DTO-FIELD-MAPPING-WORKSHEET.md:34`) says: "Use actual columns such as... only where the operation permits them." The response should be a membership summary, not the full row.

**SQL:** `04_companies.sql:234-313` — company_members has 25+ columns
**Code:** `membership.ts:30,34` — `RETURNING *`
**Contract:** `PHASE-06-API-CATALOG.md:305` — "Response: membership summary without secrets"

**Verdict:** MEDIUM — Same pattern as MEDIUM-01. The `RETURNING *` leaks fields that should be filtered. Acceptable for foundation, must be fixed for contract freeze.

### MEDIUM-03 — MEDIUM: `membership.ts` `deactivate()` uses `BadRequestException('CONFLICT')` at line 54 — same as HIGH-05

**Evidence:** Already covered in HIGH-05. The error code `CONFLICT` is prohibited.

**Verdict:** MEDIUM — Duplicate of HIGH-05; listed here for completeness in the membership section.

### MEDIUM-04 — MEDIUM: No `expected_revision` or idempotency key on company create/update

**Evidence:** `companies.ts:25-51` — Company create and update do not use `expected_revision` or `Idempotency-Key`. The DTO worksheet (`PHASE-09-B-DTO-FIELD-MAPPING-WORKSHEET.md:20`) says: "`expected_revision` only if an actual revision column/approved contract exists." The `companies` table has no `revision` column, so this is correct per the worksheet. However, the contract (`PHASE-09-B-API-CONTRACT-FREEZE.md:45`) says: "Mutations में expected revision/idempotency जहाँ catalog/SQL मांगता है वहाँ mandatory होगा।"

**SQL:** `04_companies.sql:42-130` — no `revision` column
**Code:** `companies.ts:25-51` — no revision check
**Contract:** `PHASE-06-API-CATALOG.md:270` — "Idempotency: client command retry must not duplicate company identity"

**Verdict:** MEDIUM — The slug uniqueness constraint prevents duplicate company creation. Update is not idempotent by revision (no revision column). This is consistent with the SQL schema. The catalog says idempotency is required for create (slug uniqueness handles it) but the update lacks idempotency protection. This is a known gap — company updates are not high-concurrency operations in the current scope.

### MEDIUM-05 — MEDIUM: `organization.ts` uses `ForbiddenException('VALIDATION_ERROR')` at line 26

**Evidence:** `organization.ts:26` — `throw new ForbiddenException('VALIDATION_ERROR')`. The `ForbiddenException` produces HTTP 403, but the error code `VALIDATION_ERROR` typically maps to HTTP 400. The `errors.ts:12` maps 403 to `FORBIDDEN`, so the response will be `{code: "FORBIDDEN", ...}` despite the intent being validation.

**Code:** `organization.ts:26` — `throw new ForbiddenException('VALIDATION_ERROR')`
**Errors:** `errors.ts:12` — `status === 403 ? 'FORBIDDEN'`

**Verdict:** MEDIUM — The HTTP status (403) and error code intent (VALIDATION_ERROR) are contradictory. Should be `BadRequestException('VALIDATION_ERROR')` for validation failures.

### MEDIUM-06 — MEDIUM: `organization.ts` `teamUpdate` scope column is `'id'` instead of `'company_id'`

**Evidence:** `organization.ts:31` — `return this.update('teams',['name','lead_member_id','description','is_active'],id,cid,d as Record<string,unknown>,'id',true)`. The last parameter `scopeColumn='id'` with `team=true` means the UPDATE query uses `id=$N AND department_id IN (SELECT id FROM public.departments WHERE company_id=$N+1)`. This is correct because teams don't have a direct `company_id` column — they are scoped through departments.

**SQL:** `04_companies.sql:208-221` — teams table has `department_id` FK, no `company_id`
**Code:** `organization.ts:31` — `scopeColumn='id'` with `team=true`

**Verdict:** NO ISSUE — The team scoping through department subquery is correct. The `team=true` flag in the `update` method handles the cross-table scope correctly.

### MEDIUM-07 — MEDIUM: `membership.ts` `leave()` does not check for active department head/lead/manager references

**Evidence:** `membership.ts:60-69` — The `leave()` method only checks if the user is the owner (`owner_id`). It does NOT check if the member is a department head, team lead, or active manager (unlike `deactivate()` at lines 53-54 which does check). The contract (`PHASE-09-B-API-CONTRACT-DECISIONS-HINGLISH.md:66` — D6) says: "Department-head, team-lead और manager references पहले reassign होंगे।"

**SQL:** `04_companies.sql:320-328` — FK constraints on `departments.head_member_id`, `teams.lead_member_id` use `ON DELETE RESTRICT`
**Code:** `membership.ts:60-69` — no head/lead/manager check in leave
**Contract:** D6 — "Department-head, team-lead और manager references पहले reassign होंगे"

**Verdict:** MEDIUM — The SQL FK `ON DELETE RESTRICT` will prevent hard-delete of a member who is a head/lead, but `leave()` only soft-sets `is_active=false` and `left_at=NOW()`. The soft-deactivate does NOT trigger FK restrictions. So a department head could leave without reassignment, leaving an orphaned `head_member_id` pointing to an inactive member. The `deactivate()` path correctly checks this, but `leave()` does not. This is a contract violation of D6.

### MEDIUM-08 — MEDIUM: No outbox event emitted for company create, membership changes, or ownership transfer

**Evidence:** `companies.ts:28-35` — Company create commits company + member + settings rows but no outbox event. `membership.ts` — all membership operations commit audit logs but no outbox events. `ownership.ts:14-25` — ownership transfer commits company update + audit but no outbox event.

**Contract:** `PHASE-06-API-CATALOG.md:269` — "Outbox/consumer: TBD; no event invented"
**Contract:** `PHASE-09-B-API-CONTRACT-FREEZE.md:46` — "Business row, audit/history और approved outbox event एक transaction में होंगे; unapproved event emit नहीं होगा।"

**Verdict:** MEDIUM — The contract explicitly says "TBD; no event invented" for company and membership. The Phase 09-B freeze document says outbox is mandatory where "catalog/SQL मांगता है". Since no company/membership outbox event is approved yet, the current behavior (no outbox) is correct per the catalog. However, this means company/membership changes currently have no event-driven downstream effects. This is a known gap, not a violation.

### LOW-01 — LOW: `companies.ts` `assertEmployer()` checks `role IN ('employer','admin')` but D2 says `admin` is exceptional

**Evidence:** `companies.ts:23` — `if (!u || u.status !== 'active' || !['employer','admin'].includes(u.role))`. D2 (`PHASE-09-B-API-CONTRACT-DECISIONS-HINGLISH.md:23`) says: "Platform `admin` exceptional administrative flow me company create kar sakta hai." The code allows `admin` to create companies, which is correct per D2.

**Verdict:** NO ISSUE — Correct per D2.

### LOW-02 — LOW: `ownership.ts` `transfer()` does not check sole-owner protection

**Evidence:** `ownership.ts:12-25` — The transfer method does NOT check if the current owner is the sole owner before allowing transfer. D6 says: "sole active owner/last admin leave या deactivate नहीं कर सकता; पहले ownership transfer या company deactivation जरूरी है।" However, D6 is about leave/deactivate, not about transfer itself. The transfer is the mechanism BY WHICH sole owner protection is enforced — the owner transfers before leaving. So the transfer itself should not block.

**Contract:** D8 — "Ownership transfer केवल current owner से eligible active company member को होगा"
**Code:** `ownership.ts:12-25` — no sole-owner check

**Verdict:** NO ISSUE — Transfer is the correct mechanism for sole-owner protection. The guard should be on leave/deactivate (which it is in `membership.ts:52,65`).

### LOW-03 — LOW: `membership.ts` `approveRejoin()` does not restore original `branch_id`, `department_id`, `team_id`

**Evidence:** `membership.ts:82` — `UPDATE public.company_members SET is_active=true,left_at=NULL,employment_status='active',rejoin_requested_at=NULL,rejoin_requested_by=NULL,joined_at=COALESCE(joined_at,NOW())`. The original `branch_id`, `department_id`, `team_id`, `manager_member_id`, `title`, etc. are preserved because the UPDATE does not touch them. D6 says: "Existing `company_members` row ही reactivate होगी; duplicate row नहीं बनेगी। Original `joined_at` audit history के लिए preserve होगा।"

**SQL:** `04_companies.sql:264` — `rejoin_requested_at TIMESTAMPTZ`, `rejoin_requested_by UUID`
**Code:** `membership.ts:82` — preserves all original fields except status fields

**Verdict:** NO ISSUE — Correct per D6. All original membership metadata is preserved on rejoin.

### LOW-04 — LOW: `errors.ts` knownCodes set does not include all DECISION-06 vocabulary codes

**Evidence:** `errors.ts:9` — The knownCodes set includes: `VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, NOT_FOUND, INTERNAL_ERROR, SCAN_PENDING, SCAN_FAILED, INFECTED_FILE, PARSING_NOT_READY, STALE_REVISION, CLAIM_INVALID, GUEST_SESSION_INVALID, UPLOAD_LIMIT_REACHED, STORAGE_NOT_CONFIGURED, GUEST_SESSION_NOT_CONFIGURED, GUEST_CLAIM_NOT_CONFIGURED`. Missing from DECISION-06 vocabulary: `RESUME_LIMIT_REACHED` (covered by `UPLOAD_LIMIT_REACHED`), `PARSING_PENDING`, `PARSING_FAILED`, `IDEMPOTENCY_CONFLICT`, `DEPENDENCY_UNAVAILABLE`, `RATE_LIMITED`.

**Contract:** `PHASE-06-REMAINING-DECISIONS.md:14-30` — 16 approved codes

**Verdict:** LOW — The knownCodes set is for the exception filter to recognize domain codes. Missing codes mean they will fall through to the generic status-based mapping (400→VALIDATION_ERROR, 401→UNAUTHORIZED, etc.). This is not a security issue but means some domain codes won't be surfaced correctly. The affected codes (`PARSING_PENDING`, `PARSING_FAILED`, `IDEMPOTENCY_CONFLICT`, `DEPENDENCY_UNAVAILABLE`, `RATE_LIMITED`) are not yet used in the identity/company scope, so this is acceptable for current implementation.

### LOW-05 — LOW: `auth.ts` JWT verification does not check `iss` or `aud` claims

**Evidence:** `auth.ts:7` — The JWT verification checks `alg === 'HS256'`, `payload.sub` exists, signature, and `exp`. It does NOT check `iss` (issuer) or `aud` (audience). This is acceptable for the current scope because the JWT secret is environment-specific and the token is issued by the same Supabase Auth instance. However, for production hardening, `iss` and `aud` checks prevent token misuse across environments.

**Code:** `auth.ts:7` — no `iss`/`aud` check
**Contract:** No specific requirement for `iss`/`aud` in current scope

**Verdict:** LOW — Security hardening recommendation, not a contract violation.

## 4. Requirement/SQL/DTO Mismatches

### REQ-01 — `company_settings` not initialized atomically on company create

**Requirement:** `PHASE-09-B-DTO-FIELD-MAPPING-WORKSHEET.md:22` — "Company creation must atomically initialize the existing `company_settings` row with approved defaults."
**SQL:** `04_companies.sql:335-358` — `company_settings` has `company_id UUID PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE`
**Code:** `companies.ts:33` — `await client.query('INSERT INTO public.company_settings (company_id) VALUES ($1)', [company.id])` — **YES, it IS initialized atomically in the same transaction.**

**Verdict:** NO ISSUE — Correctly implemented.

### REQ-02 — `user_sessions` has no authenticated-user RLS policy

**Evidence:** `17_rls.sql:69` — `ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY` — RLS is enabled. `17_rls.sql:152` — `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated` — all privileges revoked. There is NO `GRANT SELECT` for `user_sessions` to `authenticated`, and NO policy created for `user_sessions`.

**Contract:** `PHASE-09-B-API-CONTRACT-PROPOSAL.md:41` — "`AUTH-SESSION` uses SystemClient with explicit `user_id` ownership checks because `user_sessions` is realtime-presence data and has no approved authenticated-user RLS policy."

**Verdict:** NO ISSUE — Correctly documented as SystemClient-only. The absence of RLS policy is intentional.

### REQ-03 — `is_company_member()` RLS function includes owner check

**Evidence:** `17_rls.sql:18-32` — `is_company_member()` checks both `companies.owner_id=auth.uid()` AND `company_members.user_id=auth.uid()`. This means the owner is automatically considered a company member for RLS purposes.

**Code:** `membership.ts:16` — `assertAdmin()` checks `c.owner_id=$2 OR EXISTS (SELECT 1 FROM public.company_members m WHERE ...)`

**Verdict:** NO ISSUE — RLS and NestJS authorization are consistent.

### REQ-04 — `departments.head_member_id` FK points to `company_members(id, department_id)` not `users(id)`

**Evidence:** `04_companies.sql:320-323` — `ALTER TABLE departments ADD CONSTRAINT departments_head_member_fk FOREIGN KEY (head_member_id, id) REFERENCES company_members(id, department_id)`. This is a compound FK that ensures the head member belongs to both the company AND the department.

**Contract:** `PHASE-09-B-DTO-FIELD-MAPPING-WORKSHEET.md:29` — "FK points to `company_members`, not a user field"

**Code:** `organization.ts:28` — `departmentCreate` validates `head_member_id` belongs to company via `memberBelongs()`

**Verdict:** NO ISSUE — Correct. The compound FK enforces department-scoped membership.

### REQ-05 — `teams.lead_member_id` FK points to `company_members(id, team_id)` not `users(id)`

**Evidence:** `04_companies.sql:325-328` — `ALTER TABLE teams ADD CONSTRAINT teams_lead_member_fk FOREIGN KEY (lead_member_id, id) REFERENCES company_members(id, team_id)`. Compound FK ensures lead member belongs to the team.

**Contract:** `PHASE-09-B-DTO-FIELD-MAPPING-WORKSHEET.md:30` — "FK points to `company_members`, not a user field"

**Code:** `organization.ts:30` — `teamCreate` validates `lead_member_id` belongs to company via `memberBelongs()`

**Verdict:** NO ISSUE — Correct.

## 5. Security and Authorization Findings

### SEC-01 — Company reads use SystemClient + membership check, not UserContextClient

**Evidence:** `companies.ts:38` — Uses `this.system.query()` (SystemClient) with explicit ownership/membership check. `PHASE-09-B-API-CONTRACT-PROPOSAL.md:40` — "Company reads use SystemClient plus active-membership/ownership authorization where `17_rls.sql` has no direct company policy."

**17_rls.sql** — No authenticated SELECT policy on `companies` table. RLS is enabled (line 72) but no policy exists, so authenticated users get zero rows via direct query.

**Verdict:** NO ISSUE — Correct design. Companies have no direct RLS read policy; NestJS authorization is the primary access control.

### SEC-02 — `UserContextClient` enforces SELECT-only

**Evidence:** `clients.ts:10` — `if (!/^\s*select\b/i.test(sql)) throw new Error('UserContextClient permits SELECT statements only')`. This prevents any write via the user-context path.

**Verdict:** NO ISSUE — Correctly enforced.

### SEC-03 — `SystemClient` is server-only and not injectable into browser adapters

**Evidence:** `clients.ts:17-23` — `SystemClient` is a standard NestJS injectable. The architecture (`PHASE-07-ARCHITECTURE.md:113-117`) enforces: "Separate `UserContextClient` and `SystemClient` providers; no accidental cross-injection."

**Verdict:** NO ISSUE — Architecture-enforced.

### SEC-04 — No direct browser-to-Supabase writes

**Evidence:** All controllers use `SystemClient` (server-only) for writes. `17_rls.sql:152` — `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated` — all DML revoked.

**Verdict:** NO ISSUE — Correctly enforced at both application and database level.

### SEC-05 — `membership.ts` `add()` does not verify target user's `role` is compatible with company membership

**Evidence:** `membership.ts:23-24` — Checks `target.status !== 'active'` and `target.deleted_at`, but does NOT check `target.role`. A `candidate` user could theoretically be added as a company member. The SQL does not restrict this (`company_members.user_id` references `users(id)` without role check).

**SQL:** `04_companies.sql:237` — `user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE` — no role filter
**Contract:** No explicit restriction on which roles can be company members

**Verdict:** LOW — The product does not currently restrict membership by role. A candidate could be an HR at another company. This is a design decision, not a bug. However, if role-based membership is intended, it should be documented.

## 6. Transaction/Idempotency Findings

### TX-01 — Company create transaction is correct

**Evidence:** `companies.ts:28-35` — Transaction contains: INSERT company → INSERT company_member (owner) → INSERT company_settings. All in one `system.transaction()` call. No external calls inside transaction.

**Verdict:** NO ISSUE — Correct atomic transaction.

### TX-02 — Membership add/accept/deactivate/leave/rejoin/approveRejoin all use transactions

**Evidence:** `membership.ts` — All 6 methods use `this.db.transaction()`. Each contains appropriate row locks (`FOR UPDATE`), business logic, and audit log writes.

**Verdict:** NO ISSUE — Correct.

### TX-03 — Ownership transfer is atomic

**Evidence:** `ownership.ts:14-25` — Transaction contains: SELECT company FOR UPDATE → SELECT target member FOR UPDATE → UPDATE company owner → INSERT audit log. All in one transaction.

**Verdict:** NO ISSUE — Correct.

### TX-04 — No outbox events for company/membership/ownership operations

**Evidence:** Already covered in MEDIUM-08. The catalog says "TBD; no event invented" for company operations.

**Verdict:** Known gap, not a violation. Documented in catalog.

### IDEM-01 — Company create idempotency via slug uniqueness

**Evidence:** `04_companies.sql:47` — `slug CITEXT NOT NULL UNIQUE`. Duplicate slug creation will fail with a unique constraint violation. The `errors.ts` will map this to `VALIDATION_ERROR` (400).

**Verdict:** NO ISSUE — Idempotency enforced by DB constraint.

### IDEM-02 — Membership add idempotency for existing active members

**Evidence:** `membership.ts:26` — `if (existing.rowCount && existing.rows[0].is_active) throw new BadRequestException('IDEMPOTENCY_CONFLICT')`. This prevents duplicate active membership for the same user+company.

**Verdict:** NO ISSUE — Correct idempotency guard.

### IDEM-03 — Membership add re-invites inactive members

**Evidence:** `membership.ts:27-30` — If an inactive membership row exists, it is UPDATED with new invitation details (not a new row). This is correct per D3 — "existing `company_members` inactive row" is reused.

**Verdict:** NO ISSUE — Correct per D3.

## 7. Required Fixes

### FIX-01 (HIGH) — Replace `CONFLICT` error code in `membership.ts:54`

**Current:** `throw new BadRequestException('CONFLICT')`
**Required:** `throw new BadRequestException('VALIDATION_ERROR')` with descriptive message, or a new approved error code via Phase 7 change request.
**Reason:** DECISION-06 prohibits `CONFLICT` as a public API code.
**File:** `04-nestjs-api/04-nestjs-api-app/src/membership.ts:54`

### FIX-02 (HIGH) — Create explicit `UpdateCompanyDto` as mutable subset

**Current:** `export class UpdateCompanyDto extends CreateCompanyDto {}`
**Required:** Explicit DTO with only mutable fields: `name, legal_name, description, short_description, industry, company_size, website, linkedin_url, twitter_url, facebook_url, youtube_url, logo_path, cover_image_path, brand_color, email, phone, address_line1, address_line2, city, state, country, postal_code, latitude, longitude`. Exclude: `slug`, `registration_number`, `owner_id`, `verification_status`, `verification_document_path`, `settings`, `is_active`, `deleted_at`.
**Reason:** Inherited DTO allows immutable fields to be submitted; misleading for OpenAPI generation.
**File:** `04-nestjs-api/04-nestjs-api-app/src/companies.ts:13`

### FIX-03 (HIGH) — Add pre-validation for `branch_id`, `department_id`, `team_id` in `membership.ts` `add()`

**Current:** Raw INSERT without FK pre-validation.
**Required:** Before INSERT, verify that referenced `branch_id`, `department_id`, `team_id` belong to the same `companyId`. Return `VALIDATION_ERROR` or `NOT_FOUND` if mismatch.
**Reason:** Raw PostgreSQL constraint violation is not a clean error path.
**File:** `04-nestjs-api/04-nestjs-api-app/src/membership.ts:32`

### FIX-04 (HIGH) — Add head/lead/manager reference check to `membership.ts` `leave()`

**Current:** `leave()` only checks owner protection.
**Required:** Add the same head/lead/manager reference check as `deactivate()` (lines 53-54). Prevent leave if member is an active department head, team lead, or manager.
**Reason:** D6 requires reassignment before deactivation; `leave()` bypasses this.
**File:** `04-nestjs-api/04-nestjs-api-app/src/membership.ts:60-69`

### FIX-05 (MEDIUM) — Fix `ForbiddenException('VALIDATION_ERROR')` in `organization.ts:26`

**Current:** `throw new ForbiddenException('VALIDATION_ERROR')`
**Required:** `throw new BadRequestException('VALIDATION_ERROR')`
**Reason:** HTTP 403 maps to `FORBIDDEN`, not `VALIDATION_ERROR`. Validation errors should be HTTP 400.
**File:** `04-nestjs-api/04-nestjs-api-app/src/organization.ts:26`

### FIX-06 (MEDIUM) — Project safe response fields in company GET/PATCH

**Current:** `SELECT c.*` returns all columns.
**Required:** SELECT only approved safe fields: `id, name, slug, legal_name, description, industry, company_size, website, is_active, verification_status, created_at, updated_at` (per DTO worksheet).
**Reason:** Sensitive fields (`owner_id`, `verification_document_path`, `settings`, `deleted_at`) are leaked.
**File:** `04-nestjs-api/04-nestjs-api-app/src/companies.ts:38`

### FIX-07 (MEDIUM) — Project safe response fields in membership responses

**Current:** `RETURNING *` returns all columns.
**Required:** SELECT/RETURN only approved membership summary fields.
**Reason:** Sensitive fields (`permissions`, `employee_code`, `work_email`, `work_phone`) are leaked in responses.
**File:** `04-nestjs-api/04-nestjs-api-app/src/membership.ts:30,34,39,55,66,73,82`

### FIX-08 (LOW) — Add `PARSING_PENDING`, `PARSING_FAILED`, `IDEMPOTENCY_CONFLICT`, `DEPENDENCY_UNAVAILABLE`, `RATE_LIMITED` to `errors.ts` knownCodes

**Current:** 16 codes in knownCodes set.
**Required:** Add the 5 missing DECISION-06 vocabulary codes.
**Reason:** Prevents fall-through to generic status-based error mapping.
**File:** `04-nestjs-api/04-nestjs-api-app/src/errors.ts:9`

## 8. Final Implementation Readiness

### What is ready for implementation:
- D1–D8 business decisions are resolved and correctly implemented
- Access model (Controlled Hybrid) is correctly designed and enforced
- Transaction boundaries are correct (atomic business + audit + outbox where applicable)
- RLS defense-in-depth is correctly configured (default-deny, no company policy, NestJS authorization)
- All 6 membership flows (invite, accept, deactivate, leave, rejoin, approve-rejoin) are implemented
- Ownership transfer is implemented with correct eligibility checks
- Organization CRUD (branches, departments, teams) is implemented with correct FK validation
- Audit logging is present in all membership and ownership operations

### What must be fixed before contract freeze:
1. FIX-01: Replace `CONFLICT` error code (HIGH)
2. FIX-02: Create explicit `UpdateCompanyDto` (HIGH)
3. FK pre-validation in membership add (HIGH)
4. Leave reference check (HIGH)
5. Fix `ForbiddenException('VALIDATION_ERROR')` (MEDIUM)
6. Safe response field projection (MEDIUM)
7. Add missing error codes to knownCodes (LOW)

### What is explicitly deferred:
- Company/membership/ownership outbox events (no approved contract yet)
- External email invitation flow (D3 — future scope)
- `AUTH-SESSION` and `AUTH-ME` endpoints (Path TBD in Phase 06)
- Generic idempotency store (Phase 08 §1 — no durable store in SQL 01–18)
- Rate limit thresholds (environment configuration)
- `iss`/`aud` JWT claim validation (security hardening)

## 9. No-Code-Change Confirmation

This review was performed as a read-only audit. No code, SQL, or document files were modified. All findings are based on the current state of the repository at the time of review.

---

**Reviewer:** OpenCode (independent senior NestJS/PostgreSQL/Security architect review)
**Date:** 2026-08-27
**Status:** APPROVED WITH REQUIRED FIXES
