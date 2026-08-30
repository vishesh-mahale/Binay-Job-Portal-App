# FreeBuf Review — Commit 07c8438

## 1. Commit and scope verification

```
✅ git status --short          Clean (only untracked Agent_review/ from prior reviews)
✅ git rev-parse HEAD          07c843808346a05aa8dafeb7b01de3b8aa16c279
```

**Commit:** `test(nestjs-api): add rollback-safe company hierarchy integration smoke`
**Files changed:** 1 — `scripts/identity-company-integration-smoke.js` (+99 lines, new file)

## 2. Verdict

**APPROVED WITH REQUIRED FIXES** — 1 BLOCKER (companies INSERT missing `slug`), 1 HIGH (cross-company error-message check brittle), design otherwise solid.

## 3. Evidence-based findings

| ID | Severity | Area | Finding | Exact evidence | Required action |
|----|----------|------|---------|----------------|-----------------|
| F-1 | 🔴 BLOCKER | `smoke.js` company INSERT | `companies.slug` is `CITEXT NOT NULL UNIQUE` with no default — the INSERT omits `slug`, so it will fail with `null value in column "slug" violates not-null constraint` | `04_companies.sql:40`: `slug CITEXT NOT NULL UNIQUE`; smoke.js: `INSERT INTO public.companies (name, slug, owner_id, email)` — `slug` IS included as `$2` via `integration-smoke-${suffix}` | ✅ **Already correct on closer inspection** — I initially misread; `slug` IS provided as parameter `$2`. See corrected note below. |
| F-1-CORRECTED | ✅ PASS | `smoke.js:21-22` | `slug` IS included: `VALUES ($1, $2, $3, $4)` with params `[name, slug, owner_id, email]` | `integration-smoke-${suffix}` is the slug value | No action — slug is correctly provided |
| F-2 | 🔴 BLOCKER | `smoke.js` second company INSERT | The "Other Smoke" company INSERT **omits `slug`**: `INSERT INTO public.companies (name, slug, owner_id, email) VALUES ($1, $2, $3, $4)` — actually this also includes slug. **Corrected:** both INSERTs include slug. | `other-smoke-${suffix}` is the slug value | No action — slug provided in both INSERTs |
| F-3 | 🟡 HIGH | `smoke.js:48-53` | Cross-company FK test error-message check is **misleading but functionally correct**. The check `if (!String(error.message).includes('cross-company branch assignment'))` will NEVER be true because PostgreSQL FK errors don't contain that string. The success-unexpected branch is unreachable dead code. The test still works correctly (FK error → catch → log PASS), but the success-detection logic is wrong. | `error.message` from PostgreSQL FK violation contains `"violates foreign key constraint"`, never `"cross-company branch assignment"` | Refactor: remove the dead-code success check; simplify to just log PASS in the catch block unconditionally, or check for FK violation message |
| F-4 | 🟡 HIGH | `smoke.js:46` | `SAVEPOINT` is used for cross-company test isolation, then `ROLLBACK TO SAVEPOINT` on success — but the second company is NOT rolled back if the FK test throws (the outer `catch` does `ROLLBACK` which rolls back everything). This is correct behavior but the SAVEPOINT adds complexity without clear benefit over just doing the test inside the outer transaction. | `SAVEPOINT cross_company_fk` / `ROLLBACK TO SAVEPOINT cross_company_fk` | Consider simplifying: remove SAVEPOINT; the outer ROLLBACK already handles cleanup |
| F-5 | ✅ PASS | `smoke.js` users fixture | Queries `public.users WHERE role='employer' AND status='active'` and `WHERE role='candidate'` — both columns exist in `03_users_auth.sql`: `role public.user_role NOT NULL DEFAULT 'candidate'`, `status public.account_status NOT NULL` | `03_users_auth.sql:42-51` | No action |
| F-6 | ✅ PASS | `smoke.js` company INSERT | Columns `name, slug, owner_id, email` — all exist in `04_companies.sql`: `name VARCHAR(255) NOT NULL`, `slug CITEXT NOT NULL UNIQUE`, `owner_id UUID NOT NULL REFERENCES users(id)`, `email CITEXT` | `04_companies.sql:31-43` | No action |
| F-7 | ✅ PASS | `smoke.js` company_members INSERT | Columns `company_id, user_id, is_active, joined_at` — all exist in `04_companies.sql`: `company_id UUID NOT NULL`, `user_id UUID NOT NULL`, `is_active BOOLEAN NOT NULL DEFAULT false`, `joined_at TIMESTAMPTZ` | `04_companies.sql:191-210` | No action |
| F-8 | ✅ PASS | `smoke.js` company_branches INSERT | Columns `company_id, name, city, country` — all exist: `company_id UUID NOT NULL`, `name VARCHAR(255) NOT NULL`, `city VARCHAR(100) NOT NULL`, `country VARCHAR(100) NOT NULL` | `04_companies.sql:99-119` | No action |
| F-9 | ✅ PASS | `smoke.js` departments INSERT | Columns `company_id, name` — both exist: `company_id UUID NOT NULL`, `name VARCHAR(255) NOT NULL` | `04_companies.sql:131-141` | No action |
| F-10 | ✅ PASS | `smoke.js` teams INSERT | Columns `department_id, name` — both exist: `department_id UUID NOT NULL`, `name VARCHAR(255) NOT NULL` | `04_companies.sql:163-170` | No action |
| F-11 | ✅ PASS | `smoke.js` company_members UPDATE | Columns `branch_id, department_id, team_id` — all exist as nullable UUIDs on `company_members` | `04_companies.sql:197-199` | No action |
| F-12 | ✅ PASS | `smoke.js` hierarchy JOIN assertions | JOINs `companies → company_members → company_branches → departments → teams` — all FK relationships valid | Verified against `04_companies.sql` FK definitions | No action |
| F-13 | ✅ PASS | `smoke.js` cross-company FK test | `company_members_branch_tenant_fk` composite FK: `FOREIGN KEY (branch_id, company_id) REFERENCES company_branches(id, company_id)` — inserting branch from `otherCompany` into member of `companyId` will be rejected | `04_companies.sql:225-226` | No action |
| F-14 | ✅ PASS | `smoke.js` ownership transfer | `UPDATE public.companies SET owner_id=$1 WHERE id=$2 AND owner_id=$3` — valid column, correct optimistic check | `companies.owner_id UUID NOT NULL REFERENCES users(id)` | No action |
| F-15 | ✅ PASS | `smoke.js` transaction rollback | `BEGIN` at top, `ROLLBACK` in all 3 paths: success, skip (no fixtures), and error (catch block) | Lines 12, 17, 56, 60 | No action |
| F-16 | ✅ PASS | `smoke.js` production guard | `NODE_ENV === 'production'` → throw | Line 5 | No action |
| F-17 | ✅ PASS | `smoke.js` opt-in flag | `RUN_IDENTITY_COMPANY_INTEGRATION !== 'true'` → SKIPPED (exit 0) | Line 3 | No action |
| F-18 | ✅ PASS | `smoke.js` no data retention | All paths end in `ROLLBACK`; no `COMMIT` anywhere; `finally` calls `client.end()` | Lines 56, 60, 61 | No action |
| F-19 | ✅ PASS | `smoke.js` DATABASE_URL check | Throws if missing | Line 10 | No action |
| F-20 | ✅ PASS | `smoke.js` team lead + dept head assertions | `lead_member_id` and `head_member_id` set via UPDATE on `teams` and `departments`; hierarchy query verifies both match `targetMember.id` | Lines 40-41, assertion at line 45 | No action |

**Correction on F-1/F-2:** On careful re-reading, BOTH company INSERTs include `slug` as parameter `$2`. The first uses `integration-smoke-${suffix}` and the second uses `other-smoke-${suffix}`. The `NOT NULL` constraint is satisfied. **No BLOCKER exists.**

## 4. Correctly implemented items

| # | Item | Evidence |
|---|------|----------|
| 1 | All table/column names match baseline SQL exactly | Verified all 6 table INSERTs + 3 UPDATEs against `03_users_auth.sql` and `04_companies.sql` |
| 2 | User fixture queries use correct columns | `role`, `status`, `deleted_at` — all exist on `public.users` |
| 3 | Company hierarchy (branch → department → team) is correctly created and linked | FK chain: `company_members.branch_id → company_branches(id, company_id)`, `.department_id → departments(id, company_id)`, `.team_id → teams(id, department_id)` |
| 4 | Cross-company branch rejection is tested against real composite FK | `company_members_branch_tenant_fk` enforces `(branch_id, company_id)` pair match |
| 5 | Team lead and department head FK assertions are valid | `teams.lead_member_id → company_members(id, team_id)` and `departments.head_member_id → company_members(id, department_id)` — both verified via hierarchy query |
| 6 | Ownership transfer uses optimistic check (`WHERE owner_id=$3`) | Correct pattern for concurrent-safe transfer |
| 7 | Transaction always rolls back | `BEGIN` + `ROLLBACK` in success, skip, and error paths |
| 8 | Production guard + opt-in flag are both present | `NODE_ENV === 'production'` and `RUN_IDENTITY_COMPANY_INTEGRATION === 'true'` |
| 9 | No test data survives | No `COMMIT` path exists |
| 10 | No PII or secrets in script | Uses `@example.invalid` emails, random suffixes |
| 11 | Script does not claim to test NestJS authorization | Title says "DB invariants" — honest scope |

## 5. Security and tenant-isolation assessment

| Check | Verdict | Evidence |
|-------|---------|----------|
| **Production guard** | ✅ PASS | `NODE_ENV === 'production'` → throw before any DB connection |
| **Opt-in flag** | ✅ PASS | `RUN_IDENTITY_COMPANY_INTEGRATION !== 'true'` → exit 0 |
| **No data retention** | ✅ PASS | All 3 execution paths end in `ROLLBACK` |
| **Cross-company FK enforced** | ✅ PASS | Composite FK `company_members_branch_tenant_fk` rejects mismatched `(branch_id, company_id)` |
| **SSL handling** | ⚠️ LOW | `rejectUnauthorized: false` hardcoded — acceptable for dev/test smoke only |
| **DATABASE_URL exposure** | ✅ PASS | Not logged or printed |

## 6. Regression and test adequacy

**No build/test impact** — this is a standalone script, not a Jest test. No `npm test` changes.

**Script invariant coverage:**

| Invariant | Tested? | How |
|-----------|---------|-----|
| Company created with valid owner | ✅ | INSERT + RETURNING |
| Owner is active company member | ✅ | INSERT company_members + hierarchy JOIN |
| Target member assigned to branch/dept/team | ✅ | UPDATE company_members + hierarchy JOIN |
| Branch belongs to same company | ✅ | `branch_company_id === companyId` assertion |
| Department belongs to same company | ✅ | `department_company_id === companyId` assertion |
| Team belongs to department (same company) | ✅ | `member_department_id === team_department_id` assertion |
| Team lead is correct member | ✅ | `lead_member_id === targetMember.id` assertion |
| Department head is correct member | ✅ | `head_member_id === targetMember.id` assertion |
| Cross-company branch rejected by FK | ✅ | SAVEPOINT + INSERT + catch |
| Ownership transfer works | ✅ | UPDATE + RETURNING + assertion |
| Transaction rollback | ✅ | Final `ROLLBACK` |

**Missing invariants (informational, not blocking):**

| Invariant | Tested? | Risk |
|-----------|---------|------|
| `company_members.team_requires_department` CHECK | ❌ | LOW — SET with both values always satisfies this |
| `company_members_manager_check` (self-reference) | ❌ | LOW — script doesn't set `manager_member_id` |
| `company_members_active_joined` CHECK | ⚠️ Implicit | LOW — INSERT sets both `is_active=true` and `joined_at=NOW()` |
| Duplicate `company_members(user_id)` rejection | ❌ | LOW — not the script's purpose |

## 7. Documentation/tracker impact

| Item | Status | Detail |
|------|--------|--------|
| IMPLEMENTATION-TRACKER-HINGLISH.md | No update needed | Integration smoke tests are part of Phase 09-B testing; this is an infrastructure test, not a feature completion |
| Interview smoke test parallel | ✅ Consistent | Same pattern as `interview-integration-smoke.js` — rollback-safe, opt-in, production-guarded |

## 8. Final recommendation

**APPROVED WITH REQUIRED FIXES**

### Required before merge

| # | Fix | Severity | Effort |
|---|-----|----------|--------|
| 1 | Simplify cross-company error check: remove dead-code `if (!String(error.message).includes('cross-company branch assignment'))` — PostgreSQL FK errors never contain that string; the success branch is unreachable. Replace with unconditional `console.log('PASS: ...')` in the catch block. | HIGH | 2 min |

### Recommended (not blocking)

| # | Item | Severity | Rationale |
|---|------|----------|-----------|
| 1 | Remove `SAVEPOINT cross_company_fk` / `ROLLBACK TO SAVEPOINT` — the outer `ROLLBACK` already handles cleanup. SAVEPOINT adds complexity without benefit. | LOW | Simpler code |
| 2 | Add a `team_requires_department` negative test (SET `team_id` without `department_id` → CHECK violation) | LOW | Tests a constraint that's only implicitly covered |
| 3 | Add `manager_member_id` self-reference test | LOW | Tests `company_members_manager_check` |

---

*Review completed: 29 August 2026 | Agent: FreeBuf | Commit: 07c8438*
