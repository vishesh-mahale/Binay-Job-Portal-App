# Phase 09-B API Contract Decisions — Review (Freebuff)

**Reviewer:** Freebuff (Senior NestJS + PostgreSQL + Supabase Architect)
**Audit Target:** `04-nestjs-api/PHASE-09-B-API-CONTRACT-DECISIONS-HINGLISH.md`
**Date:** 2026-08-26
**Review Type:** Independent — no previous agent claims trusted

---

## 1. Executive Verdict

### **PASS WITH MINOR FIXES**

The decision sheet covers 7 decisions (D1–D7) that are correctly identified from the open gaps in the proposal and contract freeze worksheets. All 7 decisions are grounded in actual source evidence. Zero invented tables, columns, roles, endpoints, events, permissions, or business rules. The decisions are not over-engineered.

However, **4 minor gaps** exist: 1 missing decision (company ownership transfer), 1 ambiguity in D3 (rejoin vs accept), and 2 documentation clarifications.

---

## 2. Repository Sources Checked

| # | File | Purpose |
|---|------|---------|
| 1 | `AGENTS.md` | Mandatory working rules |
| 2 | `PHASE-09-B-API-CONTRACT-PROPOSAL.md` | Open decisions reference |
| 3 | `PHASE-09-B-API-CONTRACT-FREEZE.md` | Contract freeze worksheet |
| 4 | `PHASE-09-B-IDENTITY-COMPANIES-SCOPE.md` | Scope boundary |
| 5 | `02-database/migrations/baseline/03_users_auth.sql` | users, sessions, triggers |
| 6 | `02-database/migrations/baseline/04_companies.sql` | companies, members, settings |
| 7 | `02-database/migrations/baseline/17_rls.sql` | RLS policies, grants |
| 8 | `DECISION-01` | Controlled Hybrid access model |
| 9 | `DECISION-06` | Error vocabulary |
| 10 | `PHASE-05-FINAL-REQUIREMENTS.md` | Frozen requirements |
| 11 | `04-nestjs-api/04-nestjs-api-app/src/clients.ts` | UserContext/SystemClient code |
| 12 | `04-nestjs-api/04-nestjs-api-app/src/auth.ts` | JWT verification code |
| 13 | `04-nestjs-api/04-nestjs-api-app/src/errors.ts` | Error envelope code |
| 14 | `04-nestjs-api/04-nestjs-api-app/src/database.ts` | Transaction wrapper code |

---

## 3. Decision-by-Decision Audit

### D1 — Auth Bootstrap Boundary ✅ CORRECT

**Decision sheet:** "Kya `POST /api/v1/auth/bootstrap` NestJS endpoint rahega, ya Supabase callback/trigger ke bahar hi account bootstrap complete hoga? Constraint: existing `handle_new_user()` trigger ka ownership bina approved change ke replace nahi hoga."

**Evidence found:**

| Source | Evidence |
|--------|----------|
| `03_users_auth.sql` L128-178 | `handle_new_user()` trigger creates `public.users` row from `auth.users` insert. `ON CONFLICT (id) DO NOTHING` makes it repeat-safe. |
| `03_users_auth.sql` L6-7 | "NestJS user-facing business API aur Supabase Auth workflow ka owner hai" |
| `03_users_auth.sql` L23 | "Login: Next.js → POST /auth/login → NestJS AuthProvider → Supabase Auth" |
| `03_users_auth.sql` L111-126 | "VERIFICATION FLOW: NestJS verification complete karta hai...status='active' karta hai" |
| `clients.ts` L8 | UserContextClient enforces SELECT-only with `request.jwt.claims` propagation |

**Verdict:** The decision correctly identifies the boundary. The constraint "trigger ownership bina approved change ke replace nahi hoga" is grounded in SQL. The NestJS bootstrap endpoint can exist for state updates (status activation, security log) while the trigger handles row creation. Not over-engineered.

**Blocks API freeze:** Yes (endpoint existence must be confirmed)

---

### D2 — Company Creation Eligibility ⚠️ INCOMPLETE

**Decision sheet:** "Kaun company create kar sakta hai? Options: Any authenticated user / Approved employer role only / Platform-admin approved account only"

**Evidence found:**

| Source | Evidence |
|--------|----------|
| `04_companies.sql` | `owner_id UUID NOT NULL REFERENCES users(id)` — no restriction on which users can be owners |
| `02_enums.sql` | `user_role` enum: candidate/employer/hr/admin — no "company creator" role defined |
| Scope §3 | "Company create/read/update lifecycle where catalog authorizes it" |
| Scope §7 | "Owner/admin role/status/deactivation safeguards" — implies owner/admin but doesn't define creation eligibility |

**Verdict:** The source is silent on who can create companies. The decision correctly identifies this gap. However, the options could be more precise.

**Missing concern:** The decision doesn't reference that the source says "employer/owner/admin" for company operations (Phase 06 §3B API-COMPANY-001). The "eligible" in the proposal is undefined.

**Recommendation (PROPOSED — HUMAN APPROVAL REQUIRED):** Confirm: "Employer or admin role; platform-admin can create on behalf of employer." This is grounded in the enum values and catalog actor description. If a different rule is needed, an explicit product decision is required.

**Blocks API freeze:** Yes (actor definition must be confirmed)

---

### D3 — Membership Invitation Model ⚠️ INCOMPLETE

**Decision sheet:** "Baseline me invitation token/table nahi hai. Options: Existing user ke inactive membership row ka self-accept OR New invitation table/token ke saath external-email flow"

**Evidence found:**

| Source | Evidence |
|--------|----------|
| `04_companies.sql` | `company_members`: `invited_at TIMESTAMPTZ`, `invited_by UUID REFERENCES users(id) ON DELETE SET NULL`, `is_active BOOLEAN DEFAULT false`, `joined_at TIMESTAMPTZ` |
| `04_companies.sql` | "Invitation create hone par membership inactive rahegi. NestJS acceptance transaction joined_at set karke is_active=true karegi." |
| `04_companies.sql` | `unique_member_per_company UNIQUE(company_id, user_id)` — one membership per user per company |
| `04_companies.sql` | No `invitation_token` column, no invitation table |
| Scope §5 | "Rejoin reactivates the existing membership row; it does not create a duplicate row" |

**Verdict:** The decision correctly identifies that the SQL supports inactive membership rows but has no invitation token mechanism. The default "self-accept" option is grounded in the SQL schema.

**Missing concern — Rejoin vs Accept ambiguity:** The decision conflates two distinct operations:
1. **Accept**: A NEW user (invited by owner/admin) activates their first membership
2. **Rejoin**: A PREVIOUSLY deactivated member (left_at is set) reactivates existing membership

The SQL supports both scenarios (same `company_members` row), but they have different actor/authorization models:
- Accept: invited user via some verification mechanism (TBD)
- Rejoin: previously associated user (self-service or owner-approved — TBD)

The decision doesn't explicitly distinguish these two use cases.

**Recommendation (PROPOSED — HUMAN APPROVAL REQUIRED):**
1. D3a (Accept): Default to "inactive membership row self-accept" (grounded in SQL). External-email invitation requires approved forward migration.
2. D3b (Rejoin): Confirm "rejoin is self-service for previously deactivated members" OR "rejoin requires owner/admin approval." The SQL allows both.
3. Both should be separate decision items.

**Blocks API freeze:** Yes (invitation model must be confirmed)

---

### D4 — Organization API Shape ✅ CORRECT

**Decision sheet:** "Branch, department aur team ke liye: Separate nested REST resources OR One organization-admin command endpoint"

**Evidence found:**

| Source | Evidence |
|--------|----------|
| `04_companies.sql` | 3 separate tables: `company_branches`, `departments`, `teams` |
| `04_companies.sql` | Each has distinct columns: branches have `city/country/timezone`, departments have `head_member_id`, teams have `lead_member_id` and require `department_id` |
| `04_companies.sql` | Each has `UNIQUE(company_id, name)` constraint |
| `04_companies.sql` | `teams.department_id NOT NULL` — teams belong to departments |
| Scope §4 | "Company branch, department and team administration" |
| Phase 08 §6 | Lock order: company → member → department head/team lead/manager references |

**Verdict:** The source clearly defines 3 distinct entity types with different schemas, constraints, and relationships. Separate nested REST resources are the natural fit. Not over-engineered.

**Recommendation (PROPOSED — HUMAN APPROVAL REQUIRED):** Separate nested REST resources. Grounded in 3 distinct SQL tables with different column structures and FK relationships.

**Blocks API freeze:** Yes (endpoint shape must be confirmed)

---

### D5 — Presence Session Revoke Scope ✅ CORRECT

**Decision sheet:** "`user_sessions` realtime-presence table hai, Supabase Auth session table nahi. Options: Sirf ek owned presence row deactivate/revoke OR User ki sabhi presence rows revoke"

**Evidence found:**

| Source | Evidence |
|--------|----------|
| `03_users_auth.sql` L195-196 | "This is NOT for auth sessions (Supabase Auth handles those)." |
| `03_users_auth.sql` L199-208 | `user_sessions`: `user_id`, `is_online`, `last_seen_at`, `socket_id`, `device_type` — presence tracking |
| `03_users_auth.sql` | No RLS policy for `user_sessions` SELECT — no authenticated read grant |
| `02_enums.sql` | No session-status enum; `is_online` is boolean |

**Verdict:** The decision correctly distinguishes presence rows from Supabase Auth sessions. The SQL confirms `user_sessions` is for realtime/presence, not auth. The constraint "Supabase Auth token revoke ko is decision me automatically assume nahi kiya jayega" is correct.

**Recommendation (PROPOSED — HUMAN APPROVAL REQUIRED):** Default to "all owned presence rows revoke" (user logging out from all devices). Single-row revoke is a superset of all-rows. This aligns with typical logout behavior.

**Blocks API freeze:** Yes (revoke semantics must be confirmed)

---

### D6 — Owner/Last-Admin Protection and Rejoin ✅ CORRECT

**Decision sheet:** "Confirm karo: Sole owner/last admin leave/deactivate transfer mandatory? Rejoin self-service or owner/admin approval? Rejoin par joined_at preserve or update?"

**Evidence found:**

| Source | Evidence |
|--------|----------|
| `04_companies.sql` | `company_members`: `is_active FALSE OR joined_at NOT NULL` — active requires joined_at |
| `04_companies.sql` | `company_members`: `left_at NULL OR is_active FALSE` — left implies inactive |
| `04_companies.sql` | FK `departments.head_member_id → company_members(id, department_id) ON DELETE RESTRICT` |
| `04_companies.sql` | FK `teams.lead_member_id → company_members(id, team_id) ON DELETE RESTRICT` |
| `04_companies.sql` | FK `company_members.manager_member_id → company_members(id, company_id) ON DELETE RESTRICT` |
| Scope §7 | "sole active owner deactivate/remove nahi ho sakta jab tak approved ownership transfer ya company deactivation pehle complete na ho" |
| Scope §5 | "Rejoin reactivates the existing membership row; it does not create a duplicate row" |

**Verdict:** The decision correctly captures the SQL constraints (RESTRICT FKs prevent deactivation without reassignment) and scope rules (sole owner protection). The three sub-questions are well-formed.

**Missing concern:** The decision doesn't explicitly address that rejoin preserves `joined_at` (the SQL doesn't update it on reactivation, and the scope says "reactivates the existing membership row"). This is implicit but should be stated.

**Recommendation (PROPOSED — HUMAN APPROVAL REQUIRED):**
1. Sole owner/last admin transfer mandatory before leave/deactivate — confirmed by scope §7.
2. Rejoin: default to self-service for previously deactivated members (grounded in scope §5).
3. Rejoin preserves original `joined_at` (grounded in scope §5: "reactivates the existing row").

**Blocks API freeze:** Yes (protection rules must be confirmed)

---

### D7 — Token-Level Auth Revocation ✅ CORRECT

**Decision sheet:** "Kya presence-row handling ke alawa Supabase Auth token/session revoke bhi chahiye? Agar haan, provider call DB transaction ke baad hoga; DB transaction ke andar external call nahi hoga."

**Evidence found:**

| Source | Evidence |
|--------|----------|
| `03_users_auth.sql` L6-7 | "NestJS user-facing business API aur Supabase Auth workflow ka owner hai" |
| `03_users_auth.sql` L23 | "Login: Next.js → POST /auth/login → NestJS AuthProvider → Supabase Auth" |
| `DECISION-01 §5` | "External API calls open DB transaction ke andar nahi hongi" |
| Phase 05 §3 | "No Cloud Tasks, FastAPI, email or other external call occurs inside the open DB transaction" |
| Scope §8 | "Secrets, raw tokens और sensitive audit data response/log में नहीं आएंगे" |

**Verdict:** The decision correctly identifies that Supabase Auth token revocation is a separate system concern from presence-row deactivation. The constraint "DB transaction ke baad hoga" is grounded in Decision-01 and Phase 05. Not over-engineered.

**Recommendation (PROPOSED — HUMAN APPROVAL REQUIRED):** Auth token revocation is optional for Phase 09-B. If included, it must be: (1) post-transaction, (2) through Supabase Auth API/SDK, (3) logged for audit, (4) failure handled gracefully (presence row already revoked). Default: defer to Phase 09-C or later.

**Blocks API freeze:** Yes (auth revocation scope must be confirmed)

---

## 4. Missing Decisions

### MD-1: Company Ownership Transfer Mechanism (MEDIUM)

**Gap:** The scope §7 says "Company ke sole active owner deactivate/remove nahi ho sakta jab tak approved ownership transfer ya company deactivation pehle complete na ho." But D1–D7 don't include a decision about HOW ownership transfer works.

**Questions that need answers:**
- Is ownership transfer self-service or requires admin/platform approval?
- Is there a separate API endpoint for ownership transfer?
- Does ownership transfer require the new owner to accept?
- What happens to the old owner's membership after transfer?

**Source evidence:** `companies.owner_id UUID NOT NULL REFERENCES users(id)` — the column exists but the transfer mechanism is not defined.

**Impact:** MEDIUM — ownership transfer is referenced in scope §7 but not in any decision.

**Recommendation (PROPOSED — HUMAN APPROVAL REQUIRED):** Add D8: "Company ownership transfer mechanism." Options: (a) Self-service by current owner (b) Admin-initiated transfer (c) Platform-level approval required. Default: self-service by current owner with new-owner acceptance confirmation.

---

### MD-2: Company Deactivation vs Deletion (LOW)

**Gap:** The decision sheet addresses member deactivation/leave but not company deactivation. The SQL has `companies.is_active BOOLEAN` and `companies.deleted_at TIMESTAMPTZ` but no decision about company lifecycle.

**Questions:**
- Who can deactivate a company (owner only, or admin too)?
- What happens to active members when company is deactivated?
- Can a deactivated company be reactivated?

**Source evidence:** `companies.is_active BOOLEAN NOT NULL DEFAULT true`, `companies.deleted_at TIMESTAMPTZ` — soft-delete supported.

**Impact:** LOW — company lifecycle is referenced in catalog but not in decisions.

**Recommendation (PROPOSED — HUMAN APPROVAL REQUIRED):** Add D9 or merge into D6: "Company deactivation: owner-only action, all active memberships deactivated, reactivation possible."

---

## 5. Contradictions or Invented Assumptions

| Check | Result |
|-------|--------|
| Invented tables | ✅ None |
| Invented columns | ✅ None |
| Invented roles | ✅ None |
| Invented endpoints | ✅ None |
| Invented events | ✅ None |
| Invented permissions | ✅ None |
| Invented business rules | ✅ None |
| Contradicts SQL | ✅ None found |
| Contradicts Decision-01 | ✅ None found |
| Contradicts Decision-06 | ✅ None found |
| Contradicts Phase 05 | ✅ None found |
| Contradicts scope | ✅ None found |
| Over-engineered | ✅ Not over-engineered |

---

## 6. Security and Data-Access Review

### 6.1 UserContextClient vs SystemClient

| Endpoint | Should Use | Reason | Correct in Sheet? |
|----------|------------|--------|-------------------|
| AUTH-ME | UserContextClient | `users` has `users_own_read` RLS policy; SELECT-only | ✅ Proposal specifies this |
| AUTH-SESSION (read) | SystemClient | `user_sessions` has no authenticated SELECT grant | ✅ Proposal specifies this |
| AUTH-SESSION (revoke) | SystemClient | Business write via trusted path | ✅ Implied |
| COMPANY-* | SystemClient | No authenticated SELECT/DML grants for company tables | ✅ Proposal specifies this |
| ORG-* | SystemClient | No authenticated grants for org tables | ✅ Implied |
| MEMBERSHIP-* | SystemClient | No authenticated grants for company_members | ✅ Implied |

**Verdict:** Client boundary is correctly specified in the proposal's DTO rules section.

### 6.2 RLS Applicability

| Table | RLS Enabled | Auth SELECT Grant | Policy | Correct? |
|-------|-------------|-------------------|--------|----------|
| `users` | ✅ | ✅ | `users_own_read` (id=auth.uid()) | ✅ AUTH-ME can use RLS |
| `user_sessions` | ✅ | ❌ None | No policy | ✅ AUTH-SESSION must use SystemClient |
| `companies` | ✅ | ❌ None | No policy | ✅ COMPANY-* must use SystemClient |
| `company_members` | ✅ | ❌ None | No policy | ✅ MEMBERSHIP-* must use SystemClient |
| `company_branches` | ✅ | ❌ None | No policy | ✅ ORG-* must use SystemClient |
| `departments` | ✅ | ❌ None | No policy | ✅ ORG-* must use SystemClient |
| `teams` | ✅ | ❌ None | No policy | ✅ ORG-* must use SystemClient |
| `company_settings` | ✅ | ❌ None | No policy | ✅ COMPANY-* must use SystemClient |

**Verdict:** RLS applicability is correctly understood. No new RLS policies are invented.

### 6.3 Owner/Admin Authorization

| Operation | Authorization Source | Correct? |
|-----------|---------------------|----------|
| Company create | TBD (D2) — source silent | ✅ Correctly pending |
| Company read | `is_company_member()` + NestJS guard | ✅ SQL function exists |
| Company update | Owner/admin + NestJS guard | ✅ Correct |
| Org admin | Owner/admin + NestJS guard | ✅ Correct |
| Membership invite | Owner/admin + NestJS guard | ✅ Correct |
| Membership accept | TBD (D3) — source silent | ✅ Correctly pending |
| Membership deactivate | Owner/admin + reassignment guard | ✅ SQL RESTRICT FKs |
| Membership leave | Active member (D6 — sole owner guard TBD) | ✅ Correctly pending |
| Membership rejoin | Previously associated user (D6) | ✅ Correctly pending |

**Verdict:** Authorization mapping is correctly grounded in SQL constraints and scope rules.

### 6.4 Session Semantics

- `user_sessions` is for realtime/presence, NOT Supabase Auth sessions — correctly distinguished in D5
- No authenticated SELECT grant for `user_sessions` — SystemClient required
- `is_online` is boolean, not a lifecycle enum
- `socket_id` has UNIQUE partial index for WebSocket identity

**Verdict:** Session semantics correctly understood.

### 6.5 Invitation Artifact

- `company_members` has `invited_at`, `invited_by` but NO `invitation_token`
- No separate invitation table in SQL 01-18
- D3 correctly identifies this gap
- Default "self-accept on inactive row" is grounded in SQL

**Verdict:** Invitation artifact gap correctly identified.

### 6.6 External Calls Outside DB Transaction

- D7 correctly states: "provider call DB transaction ke baad hoga; DB transaction ke andar external call nahi hoga"
- This is grounded in Decision-01 §5 and Phase 05 §3
- `auth.ts` code shows JWT verification is synchronous (no external call)
- `clients.ts` shows UserContextClient wraps queries in transactions (no external calls)
- `database.ts` shows transaction wrapper with BEGIN/COMMIT/ROLLBACK

**Verdict:** Transaction boundary correctly enforced.

---

## 7. Exact Changes Recommended in the Decision Sheet

### Change 1: Split D3 into D3a and D3b

**Current:** Single D3 for "Membership invitation model"
**Proposed:** Split into:
- D3a: Accept — how does a NEW invited user activate their membership?
- D3b: Rejoin — how does a PREVIOUSLY deactivated member reactivate?

**Reason:** These are distinct operations with different actor/authorization models. The current conflation creates implementation ambiguity.

### Change 2: Add D8 — Company Ownership Transfer

**Current:** Missing
**Proposed:** Add: "Company ownership transfer: self-service by current owner, admin-initiated, or platform approval? Transfer requires new-owner acceptance confirmation."

**Reason:** Scope §7 references ownership transfer but no decision exists.

### Change 3: Clarify D2 Options

**Current:** "Any authenticated user / Approved employer role only / Platform-admin approved account only"
**Proposed:** "Any authenticated user / Employer or admin role (per enum user_role) / Platform-admin only"

**Reason:** The enum `user_role` has specific values (candidate/employer/hr/admin). Options should reference these.

### Change 4: Add Rejoin Preserve Note to D6

**Current:** "Rejoin par original `joined_at` preserve hoga ya update?"
**Proposed:** Add note: "Scope §5 states 'rejoin reactivates the existing membership row' — this implies `joined_at` is preserved. Confirm."

**Reason:** Scope §5 explicitly states rejoin reactivates the existing row, which implies `joined_at` preservation. The decision should reference this.

---

## 8. Final Readiness

| Category | Status |
|----------|--------|
| **Overall Verdict** | ✅ **PASS WITH MINOR FIXES** |
| **D1 — Auth Bootstrap** | ✅ CORRECT (grounded in trigger + architecture) |
| **D2 — Company Creation** | ⚠️ INCOMPLETE (missing role reference) |
| **D3 — Invitation Model** | ⚠️ INCOMPLETE (rejoin vs accept ambiguity) |
| **D4 — Org API Shape** | ✅ CORRECT (grounded in 3 SQL tables) |
| **D5 — Session Revoke** | ✅ CORRECT (presence ≠ auth session) |
| **D6 — Owner/Rejoin** | ✅ CORRECT (grounded in SQL constraints) |
| **D7 — Auth Revocation** | ✅ CORRECT (post-transaction external call) |
| **Missing Decisions** | ⚠️ 1 MEDIUM (ownership transfer) |
| **Invented Items** | ✅ ZERO |
| **Over-Engineering** | ✅ NOT over-engineered |
| **Security** | ✅ All correct |
| **RLS** | ✅ No new policies invented |
| **Transaction Boundary** | ✅ External calls post-commit |
| **Blocks API Freeze** | Yes — 7 decisions pending + 1 missing |

---

## 9. Final Status

### **READY FOR HUMAN DECISIONS**

The decision sheet is well-structured, correctly grounded, and not over-engineered. All 7 decisions are valid and correctly pending. One missing decision (ownership transfer) should be added. After human approval of all decisions, the sheet will be ready for API contract freeze.

**Next steps:**
1. Apply 4 minor fixes (split D3, add D8, clarify D2, add D6 note)
2. Human approval of all decisions
3. Update proposal and catalog with approved decisions
4. Independent review of frozen contracts
5. Controller implementation authorization

---

*Report generated by Freebuff — independent reviewer. No files modified during this review. All decisions verified against actual SQL baseline, requirements, architecture, foundation code, and Decision documents.*
