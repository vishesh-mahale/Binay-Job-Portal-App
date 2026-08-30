# Freebuf Review — Company Job-Approval Settings API Contract Decision

## 1. Repository evidence checked

| Source | Path | Relevant sections |
|--------|------|-------------------|
| SQL schema | `02-database/migrations/baseline/04_companies.sql:335-358` | `company_settings` table: `job_approval_required BOOLEAN NOT NULL DEFAULT false` |
| NestJS publish | `04-nestjs-api/04-nestjs-api-app/src/jobs.ts:106-119` | `COALESCE(cs.job_approval_required, FALSE)` — reads the column at publish time |
| Company create | `04-nestjs-api/04-nestjs-api-app/src/companies.ts:40` | `INSERT INTO public.company_settings (company_id) VALUES ($1)` — auto-creates row with SQL defaults |
| Company update | `04-nestjs-api/04-nestjs-api-app/src/companies.ts:35-50` | Owner-only PATCH on `companies` table — does NOT touch `company_settings` |
| Decision-07 J3 | `jobs-search-review/DECISION-07-JOBS-SEARCH-FINAL.md:41-62` | Frozen: `false = direct publish`, `true = approval required`; mutation endpoint = TBD |
| Tracker | `IMPLEMENTATION-TRACKER-HINGLISH.md:87-88` | Two pending gates: mutation API + backfill policy |
| API catalog | `PHASE-06-API-CATALOG.md:255-310` | `API-COMPANY-001`: company CRUD is TBD; no settings sub-resource yet |
| Ownership transfer | `src/ownership.ts:22` | Audit pattern: `audit_logs (company_id, user_id, target_user_id, action, entity_type, entity_id, old_values, new_values, changes)` |
| Job audit | `src/jobs.ts:121` | Audit pattern: `audit_logs (company_id, user_id, action, entity_type, entity_id, changes)` |
| Company read | `src/companies.ts:43` | `COMPANY_RESPONSE_FIELDS` does NOT include any `company_settings` fields |

---

## 2. Executive verdict

**APPROVED WITH REQUIRED FIXES**

The contract is straightforward — a single boolean toggle on a 1:1 extension table. The route, DTO, actor, audit, and semantics are fully determinable from existing evidence. Two items require explicit decisions before implementation.

---

## 3. Contract decisions

### Decision 1 — Route and method

| Aspect | Decision | Evidence |
|--------|----------|----------|
| **Route** | `PATCH /api/v1/companies/:companyId/settings` | Company-scoped, sub-resource pattern; consistent with `GET/PATCH /api/v1/companies/:companyId` already in `CompanyController` (`companies.ts:54-56`). Dedicated `/settings` sub-resource avoids polluting the company PATCH DTO with unrelated fields. |
| **Method** | `PATCH` (partial update) | Only `job_approval_required` is in scope. `PATCH` allows sending only the field being changed. |
| **Read** | `GET /api/v1/companies/:companyId/settings` | Returns the full `company_settings` row. Needed for UI to display current approval policy. |

**Rejected alternatives:**
- `PATCH /api/v1/companies/:companyId` (embedding in company update): Rejected because `company_settings` is a separate table with different authorization semantics (owner-only vs. owner-only-for-company-update). Mixing them violates the single-responsibility principle and makes the `CompanyUpdateDto` grow with unrelated fields.
- `PUT /api/v1/companies/:companyId/settings`: Rejected because full replacement is unnecessary for a single boolean toggle.

### Decision 2 — Request/response DTO

**Request DTO:**
```typescript
class UpdateCompanySettingsDto {
  job_approval_required?: boolean;  // Only field in v1 scope
}
```

**Response DTO (GET and PATCH response):**
```typescript
class CompanySettingsResponseDto {
  job_approval_required: boolean;
  auto_shortlist_enabled: boolean;     // Read-only in v1 — present for completeness
  ai_matching_enabled: boolean;        // Read-only in v1
  notify_on_new_application: boolean;  // Read-only in v1
  notify_on_shortlist: boolean;        // Read-only in v1
  notify_on_interview_booked: boolean; // Read-only in v1
  created_at: string;
  updated_at: string;
}
```

**Evidence:** All fields exist in `04_companies.sql:335-353`. The response returns the full row so the UI can display all settings. The PATCH DTO only accepts `job_approval_required` because that is the only field in this contract's scope. Other fields are read-only until their own mutation contracts are approved.

**Rejected alternatives:**
- Exposing only `job_approval_required` in GET: Rejected because the UI needs all settings values for the settings page. Returning the full row is simpler and consistent with `COMPANY_RESPONSE_FIELDS` returning multiple company fields.
- Accepting all settings fields in PATCH: Rejected because each field needs its own validation rules, authorization, and audit semantics. scope creep.

### Decision 3 — Who may change it

| Actor | May change? | Evidence |
|-------|-------------|----------|
| **Company owner** | ✅ YES | `DECISION-07:54`: "The company owner/admin (authorized employer-side actor) may change this setting." Owner is the `companies.owner_id` holder (`04_companies.sql:80`). |
| **Platform admin** | ✅ YES | `DECISION-07 J2`: "Owner/admin controls approval setting." Admin role is `users.role = 'admin'` (`02_enums.sql`). Platform admin has company-scoped access per `AGENTS.md` security rules. |
| **Employer/HR member** | ❌ NO | `DECISION-07 J2`: "Owner/admin controls approval setting." This is a company-level policy toggle, not a job-level operation. Active company members (employer/HR) may publish jobs but cannot change the approval policy itself. The `company_members` `permissions` JSONB column could theoretically grant this in the future, but no such permission key exists yet. |

**Authorization implementation:**
```sql
-- Inside transaction:
-- 1. Verify active user
SELECT role, status FROM public.users
WHERE id = $1 AND status = 'active' AND deleted_at IS NULL;

-- 2. Verify owner OR admin
-- Owner: companies.owner_id = $1
-- Admin: users.role = 'admin'
SELECT c.owner_id FROM public.companies c
WHERE c.id = $2 AND c.deleted_at IS NULL
  AND (c.owner_id = $1
    OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = $1 AND u.role = 'admin'));
```

**Rejected alternatives:**
- Allow employer/HR members with `manage_company` permission: Rejected because no `manage_company` permission key exists in the SQL schema (`company_members.permissions` is JSONB but no approved permission vocabulary defines this key). Adding it would invent a permission.
- Allow primary HR: Rejected because `is_primary_hr` is an employment metadata flag, not an authorization boundary for company policy.

### Decision 4 — Cross-company denial

The route already includes `:companyId` in the path. The authorization query verifies `companies.owner_id = $1 OR admin`. This inherently prevents cross-company access because:

1. The user must be the owner of the specific company OR a platform admin
2. Platform admin access is company-scoped and audited (`AGENTS.md`)
3. No user can be owner of two companies (single-owner model per D8)

**Error behavior:**
- User is not owner/admin of the company → `403 FORBIDDEN`
- Company doesn't exist or is deleted → `404 NOT_FOUND`
- Same error envelope as all other endpoints: `{ success: false, error: { code: 'FORBIDDEN' }, request_id, trace_id, schema_version }`

### Decision 5 — Audit log requirements

Every mutation must write an `audit_logs` row in the same transaction:

```sql
INSERT INTO public.audit_logs (company_id, user_id, action, entity_type, entity_id, old_values, new_values, changes)
VALUES ($1, $2, 'company.settings_updated', 'company_settings', $1,
        jsonb_build_object('job_approval_required', $3),
        jsonb_build_object('job_approval_required', $4),
        jsonb_build_object('job_approval_required', jsonb_build_object('old', $3, 'new', $4)));
```

**Evidence:** This follows the exact pattern from `ownership.ts:22` (`company.ownership_transferred`) and `jobs.ts:121` (`job.published`). The `action` string `company.settings_updated` is new but follows the established `{entity}.{action}` naming convention.

**Fields:**
- `old_values`: previous `job_approval_required` value
- `new_values`: new `job_approval_required` value
- `changes`: `{ job_approval_required: { old: <prev>, new: <next> } }`

**Rejected alternatives:**
- No audit log: Rejected — every company mutation in the codebase writes to `audit_logs`.
- Separate audit table: Rejected — `audit_logs` is the approved generic audit mechanism.

### Decision 6 — Forward-looking semantics

| Question | Decision | Evidence |
|----------|----------|----------|
| Does change apply only to future publish submissions? | **YES** | `DECISION-07:55`: "Already submitted jobs keep their current workflow; the setting applies to future publish submissions." The `publish()` method reads `job_approval_required` at call time (`jobs.ts:109`). A draft job that was created before the toggle will use the new value when `publish()` is called. This is the intended behavior. |
| What about jobs already in `pending_approval`? | **Unaffected** | `approve()` (`jobs.ts:82`) handles `pending_approval → published` without checking `job_approval_required`. Already-submitted jobs continue through their existing workflow. |
| What about `submitForApproval()`? | **Still works** | `submitForApproval()` (`jobs.ts:150`) unconditionally sets `draft → pending_approval` regardless of `job_approval_required`. This is an opt-in override per Decision-07. |

### Decision 7 — Existing company-row backfill strategy

| Scenario | Strategy |
|----------|----------|
| **Pre-prod / fresh database** | `DEFAULT false` applies to all new `company_settings` rows. No migration needed. |
| **Existing deployed database** | `04_companies.sql` default change only affects NEW rows. Existing `company_settings` rows retain whatever value they currently have. |

**Tracker status (already tracked):**
- `IMPLEMENTATION-TRACKER:88`: "Production rollout ke liye forward migration/backfill policy decide karna; baseline default change pre-prod rebuild ke liye hai, existing deployed company rows automatically change nahi hongi."

**Recommended backfill options (for production decision):**

| Option | SQL | Risk |
|--------|-----|------|
| **A: Backfill all to `false`** | `UPDATE company_settings SET job_approval_required = false WHERE job_approval_required = true;` | BREAKING — companies that intentionally enabled approval will lose it |
| **B: No backfill** | None — existing rows keep current value | SAFE — existing behavior preserved; new companies get `false` |
| **C: Backfill only companies without explicit setting** | `UPDATE company_settings SET job_approval_required = false WHERE job_approval_required = true AND company_id NOT IN (SELECT company_id FROM jobs WHERE status = 'pending_approval');` | COMPLEX — risks false positives |

**Recommendation:** Option B (no backfill). The SQL default change is for fresh databases. Existing companies retain their current setting until the owner/admin explicitly toggles it via the new API. This is the safest approach and matches Decision-07's "already submitted jobs keep their current workflow" philosophy.

### Decision 8 — Validation, idempotency, and concurrency

| Aspect | Behavior | Evidence |
|--------|----------|----------|
| **Validation** | Accept only `boolean` value. Reject `null`, `undefined` (no change), non-boolean types. `ValidationPipe` with `whitelist: true` already enforced (`main.ts`). | `main.ts`: `app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }))` |
| **Idempotency** | Setting the same value twice is safe and deterministic. No `Idempotency-Key` needed for a boolean toggle — the result is the same. | Standard idempotent PATCH semantics |
| **Concurrency** | Two concurrent PATCHes for the same company are safe. The last write wins. No optimistic locking needed for a single boolean — the `updated_at` trigger handles audit. `company_settings` has a single row per company (`PRIMARY KEY company_id`), so no row-level contention. | `04_companies.sql:355-358`: `company_settings_updated_at` trigger |
| **No-op** | If the requested value equals the current value, still apply and audit. This keeps the implementation simple and the audit trail honest. | Consistent with `companies.ts:48`: `if (!entries.length) return current` — but for settings, always write. |

---

## 4. Implementation specification

### GET /api/v1/companies/:companyId/settings

```
Actor: Any active company member (owner, admin, employer, HR)
Authorization: Active company membership (same as CompanyService.get)
Response: 200 + CompanySettingsResponseDto
Reads: company_settings (single row by company_id)
Writes: None
```

### PATCH /api/v1/companies/:companyId/settings

```
Actor: Company owner OR platform admin
Authorization: companies.owner_id = userId OR users.role = 'admin'
Request: { job_approval_required: boolean }
Response: 200 + CompanySettingsResponseDto (updated)
Reads: company_settings (current row), companies (owner check), users (admin check)
Writes: company_settings (single UPDATE), audit_logs (INSERT)
Transaction: settings UPDATE + audit INSERT atomic
Audit action: 'company.settings_updated'
```

### Error mapping

| Condition | HTTP | Error code |
|-----------|------|------------|
| Not authenticated | 401 | UNAUTHORIZED |
| Not owner/admin | 403 | FORBIDDEN |
| Company not found/deleted | 404 | NOT_FOUND |
| Invalid body (non-boolean, missing field) | 400 | VALIDATION_ERROR |
| Rate limited | 429 | RATE_LIMITED |

---

## 5. Required unit tests

| # | Test | Verifies |
|---|------|----------|
| 1 | Owner can toggle `job_approval_required` to `true` | Authorization + mutation + audit |
| 2 | Owner can toggle `job_approval_required` to `false` | Reverse toggle |
| 3 | Admin can toggle `job_approval_required` | Admin authorization path |
| 4 | Active employer member is REJECTED with `FORBIDDEN` | Non-owner/admin denied |
| 5 | Active HR member is REJECTED with `FORBIDDEN` | Non-owner/admin denied |
| 6 | Cross-company user is REJECTED with `FORBIDDEN` | Tenant isolation |
| 7 | Deleted/not-found company returns `NOT_FOUND` | Soft-delete guard |
| 8 | Setting `true` causes `publish()` to route to `pending_approval` | Integration with `jobs.ts` COALESCE |
| 9 | Setting `false` causes `publish()` to route to `published` | Integration with `jobs.ts` COALESCE |
| 10 | `submitForApproval()` still works regardless of setting | Opt-in override preserved |
| 11 | Audit log row is created with correct `old_values`/`new_values` | Audit trail |
| 12 | Setting same value twice is idempotent | No-op audit |
| 13 | GET returns full settings row including non-mutated fields | Response completeness |
| 14 | Invalid body (string, null, missing) returns `VALIDATION_ERROR` | Input validation |
| 15 | Non-boolean value rejected by ValidationPipe | Type safety |

---

## 6. What should NOT change

| Item | Reason |
|------|--------|
| `jobs.ts` `publish()` method | Already correctly reads `job_approval_required` at call time. No change needed. |
| `companies.ts` `create()` method | Already auto-creates `company_settings` row with SQL defaults. No change needed. |
| `companies.ts` `get()` method | Company read does not include settings. Settings have their own endpoint. |
| `DECISION-07` J3 | Already frozen and correct. |
| SQL schema | Column already has correct `DEFAULT false`. No migration needed for pre-prod. |
| `submitForApproval()` | Independent opt-in path — not affected by settings toggle. |
| `approve()` / `reject()` | Handle `pending_approval` jobs — not affected by settings toggle. |

---

## 7. Open items before coding

| # | Item | Type | Decision |
|---|------|------|----------|
| 1 | **Backfill policy for production** | OPERATIONS | Recommendation: Option B (no backfill). Existing companies keep current value. User/business approval required. |
| 2 | **Route path approval** | API CATALOG | `PATCH /api/v1/companies/:companyId/settings` must be added to `PHASE-06-API-CATALOG.md` section 3B. Currently TBD per Decision-07:58. |

---

## 8. Final status

**APPROVED WITH REQUIRED FIXES**

The contract is fully determinable from existing evidence. Two items remain:

1. **Backfill decision** — needs user/business approval. Recommendation: no backfill (Option B).
2. **API catalog entry** — `PATCH /api/v1/companies/:companyId/settings` and `GET /api/v1/companies/:companyId/settings` must be added to the catalog before coding begins.

Once these two items are resolved, implementation can proceed. The contract is minimal (one boolean toggle), well-bounded, and consistent with all existing patterns.
