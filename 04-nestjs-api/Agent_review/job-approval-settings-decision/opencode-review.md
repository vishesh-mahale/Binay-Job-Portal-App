# opencode Review — Company Job-Approval Settings API Contract (Decision)

**Repository:** `C:\Users\ADMIN\OneDrive\Desktop\Vishesh\Binay-Job-Portal-App`
**Date:** 2026-08-29
**Mode:** Read-only contract decision. No source, SQL, or configuration was modified.
**Authority order used:** `AGENTS.md` → approved ADRs/requirements → `04_companies.sql` → `DECISION-07-JOBS-SEARCH-FINAL.md` → current NestJS code.

---

## 0. Evidence base (cited, no behavior invented)

| Fact | Citation |
|---|---|
| Company-scoped controller pattern `api/v1/companies/:companyId` + `@UseGuards(AuthGuard)` | `src/organization.ts:35`, `src/membership.ts:99`, `src/ownership.ts:28`, `src/saved-candidates.ts:65` |
| `req.user.sub` is the actor user id; `AuthGuard` enforces active/non-deleted/non-locked | `src/auth.ts:8,20-40`, `src/jobs.ts:214-215` |
| Company-management "admin" authorization = `owner_id` OR active member with `is_primary_hr=true` OR `permissions->>'manage_company'=true` | `src/organization.ts:17-20` |
| Company `update()` is **owner-only**; plain members are rejected | `src/companies.ts:49-52` |
| Company `get()` readable by owner OR any active member | `src/companies.ts:44-48` |
| `company_settings` columns (1:1 with companies) | `02-database/migrations/baseline/04_companies.sql:335-352` |
| `job_approval_required BOOLEAN NOT NULL DEFAULT false` | `04_companies.sql:339` |
| `company_settings.updated_at` maintained by trigger | `04_companies.sql:355-358` |
| Member grant columns `is_primary_hr`, `permissions` (JSONB) | `04_companies.sql:247,250` |
| Users `role` enum includes `admin`; `assertEmployer` treats `admin` as employer-equivalent | `03_users_auth.sql:230-234`, `src/companies.ts:27-31` |
| DECISION-07: direct publish by default; owner/admin may change; applies to **future** submissions only | `DECISION-07-JOBS-SEARCH-FINAL.md:42-56` |
| DECISION-07: platform-admin exceptional access is **company-scoped/audited**, not a global bypass | `DECISION-07:37` |
| DECISION-07: mutation endpoint/DTO is a **separate API-catalog gate; no route invented** until approved | `DECISION-07:58-61` |
| Publish reads `cs.job_approval_required` only for a `draft` at publish time | `src/jobs.ts:109-117` |
| `audit_logs` schema + action format `^[a-z0-9]+([._-][a-z0-9]+)*$` | `13_analytics.sql:173-230` (esp. 213-216) |
| Audit insert pattern (company_id, user_id, action, entity_type, entity_id, old/new/changes) | `src/ownership.ts:22` |
| RLS enabled on `company_settings` | `17_rls.sql:77` |
| Optimistic-concurrency precedent (`expected_profile_revision`, `FOR UPDATE`, `STALE_REVISION`) | `src/candidate.ts:128-156` |
| No existing settings endpoint exists (only insert at create + read in publish) | `src/companies.ts:40`, `src/jobs.ts:113` |

---

## 1. Exact company-scoped route

Proposed (subject to the API-catalog ratification already recorded in `DECISION-07:58-61` and `IMPLEMENTATION-TRACKER-HINGLISH.md:87` — this contract does **not** unilaterally invent a shipped route):

```
GET    /api/v1/companies/:companyId/settings
PATCH  /api/v1/companies/:companyId/settings
```

Rationale: follows the established sub-resource convention under `api/v1/companies/:companyId` (`organization.ts:35`, `jobs.ts:207`), keeps the resource company-scoped by path, and reuses `@UseGuards(AuthGuard)`. The `:companyId` path param is the tenancy boundary; all queries join on `c.id = :companyId AND c.deleted_at IS NULL`.

## 2. HTTP method, request and response DTO

**GET** → `CompanySettingsResponseDto` (read-only projection of `company_settings`, `04_companies.sql:335-352`):
```jsonc
{
  "company_id": "uuid",
  "job_approval_required": false,
  "auto_shortlist_enabled": false,
  "ai_matching_enabled": true,
  "notify_on_new_application": true,
  "notify_on_shortlist": true,
  "notify_on_interview_booked": true,
  "custom_config": {},
  "created_at": "timestamptz",
  "updated_at": "timestamptz"
}
```
**PATCH** → `UpdateCompanySettingsDto` (v1 freezes the single focused field; other columns are intentionally out of this contract's blast radius and tracked separately):
```jsonc
{ "job_approval_required": true }   // boolean, required, non-null
```
- Invalid body (missing / non-boolean / null) → `400 VALIDATION_ERROR` (pattern: `companies.ts:34,55`).
- Response on success → `CompanySettingsResponseDto` (full current state, including new `updated_at`).
- `updated_at` from the response is the client's version token for concurrency (see §8).

## 3. Who may change it

Decision, derived from the established authorization predicate in `organization.ts:17-20` plus `DECISION-07:37`:

| Actor | May change? | Evidence |
|---|---|---|
| **Company owner** (`companies.owner_id = actor`) | ✅ Yes (primary) | `organization.ts:18`, `companies.ts:51-52` |
| **Platform admin** (`users.role = 'admin'`, active, non-deleted) | ✅ Yes — company-scoped & audited exceptional access | `DECISION-07:37`; `role` enum `03_users_auth.sql:230-234`; `assertEmployer` treats `admin` as employer-equivalent `companies.ts:30` |
| **Employer/HR member with management authority** (active member where `is_primary_hr=true` OR `permissions->>'manage_company'=true`) | ✅ Yes | `organization.ts:18` (`admin()` predicate) |
| **Plain employer/HR member** (active, but no `is_primary_hr` and no `manage_company` permission) | ❌ No | `organization.ts:17-20` restricts management to the predicate above; `companies.update` is owner-only `companies.ts:49-52` |

Authorization SQL to implement (mirrors `organization.ts:17-20`, extended with the platform-admin branch from `DECISION-07:37`):
```sql
SELECT 1 FROM public.companies c
WHERE c.id = $companyId AND c.deleted_at IS NULL
  AND (
    c.owner_id = $actor
    OR EXISTS (SELECT 1 FROM public.company_members m
               WHERE m.company_id = c.id AND m.user_id = $actor
                 AND m.is_active = true
                 AND (m.is_primary_hr = true
                      OR COALESCE((m.permissions->>'manage_company')::boolean, false) = true))
    OR EXISTS (SELECT 1 FROM public.users u
               WHERE u.id = $actor AND u.role = 'admin'
                 AND u.status = 'active' AND u.deleted_at IS NULL)
  )
```
On no-match → `403 FORBIDDEN` (pattern `organization.ts:19`, `ownership.ts:21`).

## 4. Cross-company denial

- The `:companyId` path param is the only tenancy axis; the authorization query and the `UPDATE`/`SELECT` are always scoped to that `company_id` (same pattern as `organization.ts` update where `where` includes `company_id=$scope`). A user of company A can never read/write company B's settings.
- A non-matching actor (including a different company's owner) gets `403 FORBIDDEN`, never cross-company data.
- Defense-in-depth: `company_settings` already has RLS enabled (`17_rls.sql:77`).
- No global/admin "all companies" settings endpoint is defined — avoids a global bypass, consistent with `DECISION-07:37`.

## 5. Audit log requirements

Write an `audit_logs` row (`13_analytics.sql:173-230`) on every **effective** settings change (see idempotency in §8), per the existing pattern `ownership.ts:22`:

| Field | Value |
|---|---|
| `company_id` | the `:companyId` |
| `user_id` | actor (`req.user.sub`) |
| `target_user_id` | `NULL` (no affected user) |
| `action` | `company_settings.updated` (lowercase dotted; satisfies `action_format` CHECK `13_analytics.sql:213-216`; mirrors `company.updated`, `company.ownership_transferred`) |
| `entity_type` | `company_settings` |
| `entity_id` | `company_id` |
| `old_values` | `jsonb_build_object('job_approval_required', <before>)` |
| `new_values` | `jsonb_build_object('job_approval_required', <after>)` |
| `changes` | `jsonb_build_object('job_approval_required', jsonb_build_object('old',<before>,'new',<after>))` |
| `request_id` / `trace_id` | populate from request context if available (columns exist `13_analytics.sql:184-185`) |
| `ip_address` / `user_agent` | populate from request for compliance (columns `13_analytics.sql:196-197`) |

Audit is mandatory and immutable (`audit_logs_immutable` trigger `13_analytics.sql:384`); it must be written inside the same transaction as the `UPDATE`.

## 6. Change applies only to future publish submissions

Confirmed by design and matching `DECISION-07:55-56`:
- `publish()` evaluates `cs.job_approval_required` **only when a job is in `draft`** and being published (`jobs.ts:109-117`). Changing the setting does **not** backfill or alter any existing job row.
- Therefore the new value affects only subsequent `publish()` calls on drafts. Jobs already `published`/`pending_approval`/`closed`/`archived` are untouched. No historical rewrite is performed on settings change.

## 7. Existing company-row backfill strategy (production)

- The flipped baseline `DEFAULT false` (`04_companies.sql:339`) only affects **new** `company_settings` rows. Every company already has a row inserted at creation (`companies.ts:40 INSERT ... (company_id)`), which captured the default in effect at that time. Existing deployed rows keep their stored explicit value — changing the baseline does **not** rewrite them (`DECISION-07:59-61`, `IMPLEMENTATION-TRACKER-HINGLISH.md:88`).
- **Required decision (forward-only migration):** add a production migration `ALTER TABLE company_settings ALTER COLUMN job_approval_required SET DEFAULT false;` so newly created companies (post-deploy) get direct-publish-by-default. This is the only schema change needed for *future* rows.
- **Backfill of *existing* rows — recommended conservative approach (do not auto-flip):** leave existing rows at their current explicit value. Rationale: each row already represents a deliberate stored value; a silent mass flip to `false` would change behavior for legacy companies without product sign-off and violates the "existing submitted jobs / current workflow change nahi hoga" guarantee (`DECISION-07:55-56`, tracker `:86`). If product later decides to force direct-publish everywhere, that must be a separate, explicitly-reviewed backfill migration with its own audit, not bundled here.
- This is exactly the gap already tracked as pending (`IMPLEMENTATION-TRACKER-HINGLISH.md:88`); this contract ratifies that it stays a separate, reviewed migration.

## 8. Validation, idempotency, concurrency

- **Validation:** `job_approval_required` is `BOOLEAN NOT NULL`. Reject non-boolean/null with `400 VALIDATION_ERROR` (`companies.ts:34,55` precedent). No further domain rules.
- **Idempotency:** PATCH with the same value the row already has is a no-op. If `new = current`, return the current `CompanySettingsResponseDto` **without** writing an audit row (mirrors `organization.ts:32` returning current when no entries change). This prevents audit noise and makes repeat calls safe.
- **Concurrency (optimistic):** `company_settings` is a single row per company (PK `company_id`), so updates serialize on the row lock. Adopt the codebase's existing optimistic-concurrency pattern (`src/candidate.ts:128-156`): accept an optional `updated_at` precondition (or `If-Match`); if it does not match the current row's `updated_at`, raise `409 STALE_REVISION` (named consistently with `candidate.ts:147`). Optionally `SELECT … FOR UPDATE` inside the transaction. The `updated_at` trigger (`04_companies.sql:355-358`) guarantees the token advances on every write.

## 9. Required unit / integration tests

**Unit** (`*.spec.ts`, mocked `SystemClient`, jest — same style as `jobs.spec.ts`, `organization` not yet spec'd but pattern is established):
1. Owner PATCH `true` → `200`, body reflects `job_approval_required=true`, audit row written (mock audit insert asserted).
2. Owner PATCH `false` → `200`, value `false`.
3. Active member with `is_primary_hr=true` PATCH → `200`.
4. Active member with `permissions->>'manage_company'=true` PATCH → `200`.
5. Platform admin (`role='admin'`) PATCH → `200`.
6. Plain active employer/HR member (no `is_primary_hr`, no `manage_company`) PATCH → `403 FORBIDDEN`.
7. **Cross-company:** company B's owner PATCHes company A's settings → `403` (and no write/audit for A).
8. Non-boolean / missing body → `400 VALIDATION_ERROR`.
9. Idempotent same-value PATCH → `200`, **no** new audit row.
10. Stale `updated_at` precondition → `409 STALE_REVISION`.
11. GET readable by owner and by any active member; GET by non-member → `403`.

**Integration** (real DB, mirroring existing spec suites):
12. Create company (owner) → PATCH `true` → create draft job → `publish` → job `status='pending_approval'`.
13. PATCH `false` → new draft → `publish` → job `status='published'`.
14. Existing `published`/`pending_approval` job remains unchanged after a settings toggle (future-only, §6).
15. `audit_logs` contains one row: `action='company_settings.updated'`, `entity_type='company_settings'`, correct `old/new/changes`.
16. RLS/cross-company denial verified at DB level (row for company A unreadable/writable by company B actor).
17. If a backfill migration is ever approved (§7), a test asserts it sets expected defaults **without** altering rows that should retain explicit values.

---

## Summary contract (implementation checklist)

- [ ] Route: `GET|PATCH /api/v1/companies/:companyId/settings` (ratify in API catalog per `DECISION-07:58-61`).
- [ ] Guard: `@UseGuards(AuthGuard)`; actor = `req.user.sub`.
- [ ] Authz: owner OR `is_primary_hr`/`manage_company` member OR `role='admin'` (SQL §3); else `403`.
- [ ] DTO: request `{ job_approval_required: boolean }`; response full settings projection.
- [ ] Read: owner OR active member. Write: restricted set above.
- [ ] Audit: `company_settings.updated` on effective change (§5), in-transaction.
- [ ] Idempotent no-op when value unchanged; optimistic `updated_at` → `409` on conflict.
- [ ] Future-only effect (no job backfill); existing rows keep explicit value.
- [ ] Production: forward migration `ALTER COLUMN … SET DEFAULT false`; backfill left as separate reviewed decision (tracker `:88`).

**No source/SQL/config was modified during this review.** All decisions are grounded in the cited repository evidence; the single extension beyond current code — allowing `role='admin'` to change settings — is explicitly justified by `DECISION-07:37` and is presented as a contract requirement to be implemented, not as existing behavior.
