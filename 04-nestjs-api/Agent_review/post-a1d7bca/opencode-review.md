# Independent Code Review — Commit `a1d7bca`

**Agent:** opencode
**Date:** 2026-08-29
**Scope:** `scripts/identity-company-integration-smoke.js` (only file changed; 11 insertions, 7 deletions)
**Purpose of commit:** "harden company smoke FK assertions" — addresses prior review findings F1/F2/F3 on `07c8438`.
**Verification method:** Read-only. Read full script (103 lines). Verified baseline SQL:
- `02-database/migrations/baseline/03_users_auth.sql` — `users` columns `first_name` (L88), `last_name` (L90), `role public.user_role` (L118); role enum values `candidate/employer/hr/admin` (L230–234).
- `02-database/migrations/baseline/04_companies.sql` — `companies.slug/email/owner_id` (L47/L68/L80), `company_members.branch_id/department_id/team_id/is_active/joined_at` (L238–258), `departments.head_member_id` (L187), `teams.lead_member_id` (L212), and the `company_members_branch_tenant_fk` definition (L301–303).
No build/test execution (PowerShell policy blocks `npm`); static/code-level review only.

---

## Verdict

**APPROVED**

All three critical findings from the `07c8438` review are resolved, and the remaining focus areas (rollback, production guard, schema alignment, PII, false-positive risk) are correct. No new blockers introduced. Two non-blocking observations (O1, O4) are carried forward for awareness.

---

## Prior-Finding Resolution (vs. `07c8438` review)

| Prior ID | Issue | Status in `a1d7bca` |
|----------|-------|---------------------|
| F1 | Cross-company FK test reused an already-a-member user (`owner`), so the duplicate-member unique constraint — not the FK — caused rejection; test passed even if the FK were removed. | **FIXED.** Now uses a distinct `outsider` user (L20–23) that is **not** a member of the freshly created `companyId`, so `unique_member_per_company` cannot fire and the **only** constraint in play is `company_members_branch_tenant_fk` (L85). |
| F2 | Catch-all logged PASS for any non-sentinel error → false positive on non-FK failures. | **FIXED.** Now asserts the exact condition `error.code === '23503' && error.constraint === 'company_members_branch_tenant_fk'` (L88); any other error is re-thrown, so the test fails loudly instead of passing falsely. |
| F3 | `c.owner_id` selected but never asserted. | **FIXED.** Added `String(row.owner_id) !== String(owner.rows[0].id)` to the hierarchy invariant (L69). |
| F4 | Only branch cross-tenant FK exercised. | **Not in scope of this commit** — still only branch FK asserted (see O4). |
| F5 | DB-level only, no NestJS app-layer auth coverage. | **Unchanged** — still a DB-integrity smoke test (acceptable by design; see prior report). |

---

## Focus-Area Verification

### 1. Fresh non-member user for cross-company FK test ✅
`outsider` is selected from `users` excluding `owner` and `member` (L20), or created as a brand-new `candidate` if none exists (L21–23). Because `companyId` is created only after this lookup (L30) and `outsider` is neither `owner` nor `member`, `outsider` is guaranteed not to be a `company_members` row of `companyId`. The cross-company insert `(companyId, outsider.id, otherBranch.id)` (L85) therefore fails **only** on the cross-tenant branch FK — exactly the constraint under test.

### 2. Exact error code 23503 and constraint assertion ✅
```js
if (error.code !== '23503' || error.constraint !== 'company_members_branch_tenant_fk') throw error;
console.log('PASS: cross-company branch assignment rejected by company_members_branch_tenant_fk');
```
Precise and non-ambiguous. `pg` populates `code` (SQLSTATE) and `constraint` for FK violations, and the constraint name matches `04_companies.sql:301`. False-positive risk eliminated.

### 3. owner_id linkage assertion ✅
Hierarchy query now asserts `row.owner_id === owner.rows[0].id` (L69).

### 4. Rollback and production guard ✅
- **Production guard:** L5 skips unless `RUN_IDENTITY_COMPANY_INTEGRATION === 'true'`; L9 throws if `NODE_ENV === 'production'`. Both guards present and correctly ordered (explicit opt-in required; never runs in production).
- **Rollback coverage:** `BEGIN` (L16) → `SAVEPOINT cross_company_fk` (L76) → `ROLLBACK TO SAVEPOINT` (L91) → final `ROLLBACK` (L96); outer `catch` also rolls back (L99); SKIP path rolls back (L26). **No `COMMIT` anywhere** — so every insert/update is discarded. Even an abnormal crash aborts the uncommitted transaction at the server.

### 5. users / company / member / hierarchy SQL schema alignment ✅
All referenced columns exist in baseline SQL:
- `users`: `id, role, status, deleted_at, first_name, last_name, email` — present (L88/90/118; enum includes `employer`/`candidate` per L230–234).
- `companies`: `name, slug, owner_id, email, id` (L47/68/80).
- `company_members`: `company_id, user_id, branch_id, department_id, team_id, is_active, joined_at` (L238–258).
- `company_branches`: `company_id, name, city, country, id`; `departments`: `company_id, name, head_member_id, id`; `teams`: `department_id, name, lead_member_id, id`.
- FK `company_members_branch_tenant_fk FOREIGN KEY (branch_id, company_id) REFERENCES company_branches(id, company_id)` (L301–303) — matches the test's rejection premise.

### 6. False-positive risk ✅
Resolved by the exact `23503` + `constraint` assertion (L88). A network error, missing column, or permission failure now throws rather than printing PASS.

### 7. No persistent data or PII ✅
- No `COMMIT`; all writes rolled back (L96/L99/L26).
- All synthetic emails use the reserved `.invalid` TLD (RFC 2606): `smoke-…@example.invalid`, `other-…@example.invalid`, `identity-smoke-…@example.invalid` (L22/L33/L80).
- Real user rows are only read for their `id` (L18–20); no real email/PII is printed.
- `DATABASE_URL` is read from env; no credentials hardcoded. `require('dotenv').config()` is a standard local-loading convenience.

---

## Non-Blocking Observations (carried forward)

- **O1 (info):** The test now relies on **pre-existing** active `employer` + `candidate` fixtures (it only self-provisions the `outsider`). If a CI/test DB lacks such users, the script **SKIPs** (L24–28) and never exercises the path. Ensure fixtures exist, or self-provision owner/member as well, so the smoke test actually runs in CI.
- **O2 (info):** SSL is configured `rejectUnauthorized: false` by default (L13) — a test convenience; acceptable for a Dev/Test-only script, but worth a comment so it is not copied into production code.
- **O3 (info):** Real user IDs are used as `company` owner and `targetMember`; the writes are within the always-rolled-back transaction, so safe, but the dependency on real rows means a future bug that accidentally `COMMIT`s would mutate real users. The never-`COMMIT` invariant is the key safeguard — keep it.
- **O4 (coverage):** Only `company_members_branch_tenant_fk` cross-tenant rejection is asserted. The analogous `company_members_department_tenant_fk` (L304) and `company_members_team_department_fk` (L307) are not exercised. Acceptable for a smoke test; optional future extension.

---

## Conclusion

Commit `a1d7bca` correctly hardens the smoke test: the cross-company FK assertion now uses a genuine non-member user and asserts the exact `23503`/`company_members_branch_tenant_fk` violation, the `owner_id` linkage is asserted, and rollback + production guards remain intact. Schema usage aligns with baseline SQL, and there is no persistent data or PII exposure. **APPROVED.**
