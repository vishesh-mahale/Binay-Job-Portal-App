# Freebuf Review — Commit ced9ffe

## 1. Commit verification

| Check | Evidence | Result |
|-------|----------|--------|
| `git status --short` | Clean (only untracked review folders) | ✅ Clean |
| `git rev-parse HEAD` | `ced9ffe9c24030674d81f442a812504fed6ee588` | ✅ Matches expected |
| Commit message | `feat(nestjs-api): add company job approval settings API` | ✅ Accurate |
| `npm run build` | Exit 0, zero errors | ✅ PASS |
| `npm test -- --runInBand` | 31 suites, 147 tests — ALL PASS (53s) | ✅ PASS |

**Diff:** 6 files changed, 101 insertions, 5 deletions — 1 new module + 1 new test file + documentation updates.

---

## 2. Executive verdict

**APPROVED**

This is a clean, minimal, correct implementation of the contract finalized in the previous review (`job-approval-settings-decision`). All 10 verification points pass. Zero invented tables, columns, events, routes, or permissions. The implementation follows existing codebase patterns exactly.

---

## 3. Evidence-based findings

| ID | Severity | Area | Finding | Exact evidence | Required action |
|----|----------|------|---------|----------------|-----------------|
| **F-1** | 🟢 LOW | `company-settings.ts:18` | `custom_config` returned in GET response. This JSONB field defaults to `'{}'::JSONB` (`04_companies.sql:349`) and could theoretically contain anything. Currently safe because no code writes to it, but future use should be documented. | `SETTINGS_FIELDS` includes `custom_config`; `04_companies.sql:349`: `custom_config JSONB DEFAULT '{}'::JSONB` | No immediate action. The API catalog explicitly includes it in the response. Document any future write rules. |
| **F-2** | 🟢 LOW | `company-settings.spec.ts` | No explicit test for admin actor path (only owner tested). The `FORBIDDEN` test covers non-owner/non-admin but doesn't distinguish between "not admin" and "not owner." | `company-settings.spec.ts:15-19`: mock returns `rowCount: 0` — doesn't exercise the admin `EXISTS` subquery path | Add one test where `auth` mock returns `rowCount: 1` but the user is admin (not owner) to verify the admin path. |
| **F-3** | 🟢 LOW | `company-settings.spec.ts` | No test for GET endpoint behavior. Only PATCH is tested. | No GET test in `company-settings.spec.ts` | Add one test for GET returning the full settings row for an active member. |

---

## 4. Correctly implemented items

### 4.1 Routes match the contract exactly

| Route | Contract | Implementation |
|-------|----------|----------------|
| `GET /api/v1/companies/:companyId/settings` | API-COMPANY-004: `GET\|PATCH` | `company-settings.ts:40` — `@Get()` |
| `PATCH /api/v1/companies/:companyId/settings` | API-COMPANY-004: `GET\|PATCH` | `company-settings.ts:41` — `@Patch()` |

### 4.2 Authorization — owner/admin for mutation, member for read

**GET authorization** (`company-settings.ts:21`):
```sql
WHERE s.company_id=$1 AND EXISTS (
  SELECT 1 FROM public.companies c
  WHERE c.id=s.company_id AND c.deleted_at IS NULL
    AND (c.owner_id=$2
      OR EXISTS (SELECT 1 FROM public.company_members m
                 WHERE m.company_id=c.id AND m.user_id=$2 AND m.is_active=true AND m.left_at IS NULL)
      OR EXISTS (SELECT 1 FROM public.users u
                 WHERE u.id=$2 AND u.role='admin' AND u.status='active' AND u.deleted_at IS NULL))
)
```
✅ Owner, active member, or platform admin can read.

**PATCH authorization** (`company-settings.ts:30`):
```sql
SELECT 1 FROM public.companies c
WHERE c.id=$1 AND c.deleted_at IS NULL
  AND (c.owner_id=$2
    OR EXISTS (SELECT 1 FROM public.users u
               WHERE u.id=$2 AND u.role='admin' AND u.status='active' AND u.deleted_at IS NULL))
```
✅ Owner or platform admin only. Active employer/HR member correctly denied.

### 4.3 Cross-company isolation

All queries are scoped by `companyId` parameter from the URL. The `company_settings` table has a FK `REFERENCES companies(id) ON DELETE CASCADE` (`04_companies.sql:336`), so accessing a non-existent company returns zero rows → `404 NOT_FOUND`.

✅ No cross-company access possible.

### 4.4 Boolean validation — double-guarded

| Layer | Evidence |
|-------|----------|
| DTO decorator | `@IsDefined() @IsBoolean() job_approval_required!: boolean` — class-validator rejects non-boolean at ValidationPipe |
| Runtime check | `if (typeof dto?.job_approval_required !== 'boolean') throw BadRequestException('VALIDATION_ERROR')` — defensive guard |

✅ Both layers prevent non-boolean values from reaching SQL.

### 4.5 Atomic update + audit_logs

```typescript
return this.db.transaction(async (client) => {
  // 1. Auth check
  const auth = await client.query(`SELECT 1 FROM public.companies c WHERE ...`);
  // 2. Row lock
  const before = await client.query(`SELECT ... FROM company_settings WHERE company_id=$1 FOR UPDATE`);
  // 3. Idempotency short-circuit
  if (previous === dto.job_approval_required) return before.rows[0];
  // 4. Update
  const updated = await client.query(`UPDATE company_settings SET ...`);
  // 5. Audit
  await client.query(`INSERT INTO audit_logs ...`);
  return updated.rows[0];
});
```

✅ All 5 steps in one transaction. `FOR UPDATE` prevents concurrent modification. Audit captures `old_values`, `new_values`, and `changes` with correct JSONB shape matching `ownership.ts:22` and `jobs.ts:121` patterns.

### 4.6 Same-value idempotency

`company-settings.ts:34`: `if (previous === dto.job_approval_required) return before.rows[0];`

✅ Setting the same value twice: (1) reads current, (2) detects equality, (3) returns early without UPDATE or audit. Test verifies `client.query` called exactly 2 times (auth + read, no update/audit).

### 4.7 Documentation consistency

| Document | Update | Accuracy |
|----------|--------|----------|
| `DECISION-07:58-62` | Updated: approved route, owner/admin mutation, active member read, audit, Primary-HR exclusion | ✅ Matches implementation |
| `IMPLEMENTATION-TRACKER:87` | Marked `[x]` with accurate description | ✅ Correct |
| `PHASE-06-API-CATALOG:323-340` | New `API-COMPANY-004` entry added in §3B | ✅ Matches implementation |

### 4.8 No secret/internal field leakage

`SETTINGS_FIELDS`: `company_id, job_approval_required, auto_shortlist_enabled, ai_matching_enabled, notify_on_new_application, notify_on_shortlist, notify_on_interview_booked, custom_config, created_at, updated_at`

✅ All fields are business configuration. No `owner_id`, `email`, `phone`, `address_*`, tokens, credentials, or internal IDs exposed.

### 4.9 App module wiring

`app.module.ts`: `CompanySettingsController` added to controllers array; `CompanySettingsService` added to providers array. Both correctly imported from `./company-settings`.

✅ Correct DI wiring. No circular dependencies.

### 4.10 SQL column alignment

Every column in `SETTINGS_FIELDS` exists in `04_companies.sql:335-353`:

| Field | SQL line | Type | Default |
|-------|----------|------|---------|
| `company_id` | 336 | `UUID PRIMARY KEY` | FK |
| `job_approval_required` | 339 | `BOOLEAN NOT NULL` | `false` |
| `auto_shortlist_enabled` | 340 | `BOOLEAN NOT NULL` | `false` |
| `ai_matching_enabled` | 341 | `BOOLEAN NOT NULL` | `true` |
| `notify_on_new_application` | 344 | `BOOLEAN NOT NULL` | `true` |
| `notify_on_shortlist` | 345 | `BOOLEAN NOT NULL` | `true` |
| `notify_on_interview_booked` | 346 | `BOOLEAN NOT NULL` | `true` |
| `custom_config` | 349 | `JSONB` | `'{}'::JSONB` |
| `created_at` | 351 | `TIMESTAMPTZ NOT NULL` | `NOW()` |
| `updated_at` | 352 | `TIMESTAMPTZ NOT NULL` | `NOW()` |

✅ Zero invented columns.

---

## 5. Remaining rollout/API gaps

| Gap | Status |
|-----|--------|
| Production backfill for existing company rows | ⚠️ Still pending — `IMPLEMENTATION-TRACKER:88` correctly tracks this |
| Primary-HR/delegated-member mutation | Correctly excluded — Decision-07:60 says "not enabled without a separate approved permission contract" |
| Other settings fields (auto_shortlist, ai_matching, notify_*) | Read-only in v1. No mutation contract yet. Correct. |

---

## 6. Test results

```
PASS src/company-settings.spec.ts
  √ owner updates approval setting atomically and audits effective change (12 ms)
  √ non-owner/non-admin cannot update settings (1 ms)
  √ same value is idempotent and does not write audit (1 ms)

Test Suites: 1 passed, 1 total
Tests:       3 passed, 3 total
```

**Full suite:** 31 suites, 147 tests — ALL PASS (53s)

### Test quality assessment

| Test | What it verifies | Quality |
|------|-----------------|---------|
| Owner update + audit | Auth check → read → update → audit INSERT with `company.settings_updated` | ✅ Good — 4 mock calls verified |
| Non-owner/admin FORBIDDEN | Auth check returns `rowCount: 0` → ForbiddenException thrown | ✅ Good — catches early |
| Same-value idempotency | Auth check → read → equality detected → returns early (2 queries only) | ✅ Good — proves no UPDATE/audit |

---

## 7. Final recommendation

**APPROVED**

This implementation is exactly what was contracted in the previous review:

- ✅ `GET/PATCH /api/v1/companies/:companyId/settings` — correct routes
- ✅ Owner/platform-admin authorization for mutation — correct actors
- ✅ Active member read access — correct permission boundary
- ✅ Cross-company isolation — all queries scoped by companyId
- ✅ Boolean validation — double-guarded (decorator + runtime)
- ✅ Atomic update + audit_logs — transaction with FOR UPDATE lock
- ✅ Same-value idempotency — short-circuit without write
- ✅ API catalog, Decision-07, tracker all consistent
- ✅ No secret/internal field leakage
- ✅ 147/147 tests pass, build clean

**No blockers. No required fixes.** Three LOW follow-ups (admin-path test, GET test, `custom_config` documentation) are non-blocking and can be addressed in the next hardening pass.

The production backfill gate (`IMPLEMENTATION-TRACKER:88`) remains correctly tracked as a separate deployment decision.
