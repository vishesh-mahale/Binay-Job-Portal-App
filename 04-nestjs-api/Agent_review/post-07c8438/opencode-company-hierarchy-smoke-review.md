# Independent Code Review — Commit `07c8438`

**Agent:** opencode
**Date:** 2026-08-29
**Scope:** `scripts/identity-company-integration-smoke.js` (only file added by commit; 99 insertions)
**Verification method:** Read-only. Read full script (lines 1–99). Verified baseline SQL constraints in `02-database/migrations/baseline/04_companies.sql` (L294–313) and `03_users_auth.sql` (`users.role/status/deleted_at`). No build/test execution (PowerShell policy blocks `npm`); review is static/code-level only.

---

## Verdict

**APPROVED WITH REQUIRED FIXES**

The script is safe to ship as a non-production, opt-in, fully-rolled-back utility (no PII, no secrets, no persistent side effects). However, its headline assertion — that the cross-company branch FK (`company_members_branch_tenant_fk`) rejects cross-tenant assignment — is currently **unproven** because the test is constructed in a way that lets a different constraint cause the same rejection. **F1 must be fixed before this script can be trusted.**

---

## Findings

| ID | Severity | Location | Summary |
|----|----------|----------|---------|
| F1 | Required Fix (High) | L31–33, L81 | Cross-company FK test is unsound; uses an already-a-member user, so a duplicate-member unique violation — not the FK — causes the rejection. Test passes even if the FK were removed. |
| F2 | Minor (robustness) | L83–86 | Catch-all treats any non-sentinel error as PASS → false positive on non-FK failures. |
| F3 | Minor (completeness) | L54, L65–68 | `c.owner_id` is selected but never asserted. |
| F4 | Observation (coverage) | L72–87 | Only branch cross-tenant FK exercised; department/team cross-tenant FKs not asserted. |
| F5 | Observation (scope) | whole file | DB-level only; does not exercise NestJS app-layer authorization. |

---

## Detail

### F1 — Cross-company FK assertion is unsound (Required Fix)

At L31–33 the script inserts `owner` as a `company_members` row for `companyId` (`ownerMember`). Then at L81 it attempts to insert **the same `owner.rows[0].id`** into `company_members` again for `companyId`, but with `otherBranch` (which belongs to `otherCompany`):

```js
INSERT INTO public.company_members (company_id, user_id, branch_id, is_active, joined_at)
VALUES ($1, $2, $3, true, NOW())   // companyId, owner.id, otherBranch.id
```

Because `owner` is already a member of `companyId`, this row violates `unique_member_per_company UNIQUE (company_id, user_id)` (`04_companies.sql:297`) **before** the branch FK is even considered. PostgreSQL will reject the insert on the unique constraint.

The inner `catch` (L83–86) logs `PASS` for **any** error whose message does not contain the sentinel string `'cross-company branch assignment'`. A unique-violation message does not contain that string, so the script prints `PASS: cross-company branch assignment rejected by FK` — **even though the FK was not what rejected the row.**

Consequence: if `company_members_branch_tenant_fk` (`04_companies.sql:301–303`) were dropped, this test would **still pass**, because the duplicate-member unique constraint alone blocks the insert. The test therefore cannot detect a missing/regressed cross-company FK. It provides false confidence.

**Fix:** use a *fresh, non-member* user for the cross-company attempt so the only constraint in play is the FK. Example: insert a third user (not added to `company_members` for `companyId`), then attempt `(companyId, thirdUserId, otherBranch.id)`. With the FK present the insert is rejected (PASS); with the FK absent the insert succeeds → L82 throws `unexpectedly succeeded` → script fails. That makes the test meaningful.

### F2 — Catch-all false-positive risk (Minor)

L83–86: any error not containing the sentinel string is logged as PASS. A non-FK failure (network drop, permission denied, missing column) would also print PASS. Tighten to assert the specific FK violation, e.g. `error.code === '23503'` or `error.message.includes('company_members_branch_tenant_fk')`.

### F3 — Unasserted `owner_id` (Minor)

The hierarchy query selects `c.owner_id` (L54) but the invariant block (L65–68) never checks it. Add `String(row.owner_id) !== String(owner.rows[0].id)` to fully confirm ownership linkage.

### F4 — Cross-tenant coverage gap (Observation)

The script exercises only `company_members_branch_tenant_fk`. The analogous `company_members_department_tenant_fk` (L304–306) and `company_members_team_department_fk` (L307–309) are not asserted. Acceptable for a smoke test, but the gap should be acknowledged.

### F5 — Scope vs. script name (Observation)

The script uses a raw `pg` `Client` and touches the DB directly; it verifies DB integrity (FKs, hierarchy, ownership `UPDATE`) but does **not** exercise NestJS application authorization (guards/policies). If "identity-company integration" was expected to cover app-layer access control, this script does not. Not a defect for a DB smoke test, but the intent should be clarified.

---

## Positive Confirmations

- **Safety guards correct:** `NODE_ENV === 'production'` block (L5–9) **and** opt-in `RUN_IDENTITY_COMPANY_INTEGRATION` (L10–13). Cannot run without explicit consent and never in production.
- **No persistent side effects:** `BEGIN` (L25) → `SAVEPOINT cross_company_fk` (L72) → `ROLLBACK TO SAVEPOINT` (L87) → final `ROLLBACK` (L92); outer `catch` also rolls back (L95). No test rows retained on success or failure.
- **No PII / no secrets:** all emails use the reserved `.invalid` TLD (RFC 2606); `DATABASE_URL` read from env, nothing hardcoded.
- **Hierarchy invariants correct** (L53–70): branch & department `company_id` equal `companyId`; member's `department_id` equals team's `department_id`; team `lead_member_id` and department `head_member_id` equal target member.
- **Ownership-transfer assertion correct** (L89–90): `UPDATE ... SET owner_id=$1 WHERE id=$2 AND owner_id=$3 RETURNING owner_id` correctly verified.
- **FK definition is correct** (`04_companies.sql:301–303`): `FOREIGN KEY (branch_id, company_id) REFERENCES company_branches(id, company_id) ON DELETE RESTRICT` — so once F1 is fixed, the test will genuinely validate cross-company rejection.

---

## Required Action Before Relying on This Script

1. **F1:** Use a non-member user for the cross-company insert (see fix above) so the test actually proves the FK.
2. *Recommended:* address F2/F3 to remove false-positive risk and tighten assertions.

Non-blocking observations F4/F5 can be tracked separately.
