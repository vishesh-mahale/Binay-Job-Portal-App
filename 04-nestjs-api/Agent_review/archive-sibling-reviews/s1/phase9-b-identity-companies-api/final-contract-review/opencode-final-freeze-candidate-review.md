# Phase 09-B — Final Freeze Candidate Review (Opencode)

**Auditor:** Opencode (Independent Senior NestJS + PostgreSQL + Supabase Architect)
**Date:** 2026-08-27
**Report Path:** `04-nestjs-api/s1/phase9-b-identity-companies-api/final-contract-review/opencode-final-freeze-candidate-review.md`

---

## 1. Executive Verdict

### **PASS WITH REQUIRED FIXES**

The freeze candidate document is well-structured and correctly resolves all D1–D8 decisions. DTO fields are SQL-backed, boundaries are accurate, and no phantom elements exist. However, **1 MEDIUM issue** and **2 LOW issues** require resolution before freeze.

**MEDIUM:** Ownership-transfer endpoint (`POST /api/v1/companies/:companyId/ownership-transfer`) has no explicit Phase 06 API catalog entry. It is traced only to D8 decision, not to a catalog requirement ID.

---

## 2.10-Point Verification Matrix

### Checkpoint 1: Endpoint/DTO traceability to requirement/API-catalog

| Endpoint | Phase 06 Catalog Entry | Requirement IDs | Traceable? |
|---|---|---|---|
| `GET /api/v1/auth/me` | API-AUTH-001 (line 195) | REQ-AUTH-001, REQ-AUTH-006 | ✅ |
| `GET /api/v1/auth/sessions` | API-AUTH-002 (line 215) | REQ-AUTH-001, REQ-AUTH-003, REQ-AUTH-004 | ✅ |
| `POST /api/v1/auth/sessions/revoke` | API-AUTH-002 (line 215) | REQ-AUTH-001, REQ-AUTH-003, REQ-AUTH-004 | ✅ |
| `POST /api/v1/companies` | API-COMPANY-001 (line 257) | REQ-COMPANY-001, REQ-COMPANY-004 | ✅ |
| `GET /api/v1/companies/:companyId` | API-COMPANY-001 (line 257) | REQ-COMPANY-001, REQ-COMPANY-004 | ✅ |
| `PATCH /api/v1/companies/:companyId` | API-COMPANY-001 (line 257) | REQ-COMPANY-001, REQ-COMPANY-004 | ✅ |
| `POST /api/v1/companies/:companyId/branches` | API-COMPANY-002 (line 277) | REQ-COMPANY-001, REQ-COMPANY-004, REQ-COMPANY-005 | ✅ |
| `PATCH /api/v1/companies/:companyId/branches/:branchId` | API-COMPANY-002 (line 277) | REQ-COMPANY-001, REQ-COMPANY-004, REQ-COMPANY-005 | ✅ |
| `POST /api/v1/companies/:companyId/departments` | API-COMPANY-002 (line 277) | REQ-COMPANY-001, REQ-COMPANY-004, REQ-COMPANY-005 | ✅ |
| `PATCH /api/v1/companies/:companyId/departments/:departmentId` | API-COMPANY-002 (line 277) | REQ-COMPANY-001, REQ-COMPANY-004, REQ-COMPANY-005 | ✅ |
| `POST /api/v1/companies/:companyId/teams` | API-COMPANY-002 (line 277) | REQ-COMPANY-001, REQ-COMPANY-004, REQ-COMPANY-005 | ✅ |
| `PATCH /api/v1/companies/:companyId/teams/:teamId` | API-COMPANY-002 (line 277) | REQ-COMPANY-001, REQ-COMPANY-004, REQ-COMPANY-005 | ✅ |
| `POST /api/v1/companies/:companyId/members` | API-COMPANY-003 (line 297) | REQ-COMPANY-002, REQ-COMPANY-004, REQ-COMPANY-005 | ✅ |
| `POST /api/v1/companies/:companyId/membership/accept` | API-COMPANY-003 (line 297) | REQ-COMPANY-002, REQ-COMPANY-004, REQ-COMPANY-005 | ✅ |
| `POST /api/v1/companies/:companyId/members/:memberId/deactivate` | API-COMPANY-003 (line 297) | REQ-COMPANY-002, REQ-COMPANY-004, REQ-COMPANY-005 | ✅ |
| `POST /api/v1/companies/:companyId/membership/leave` | API-COMPANY-003 (line 297) | REQ-COMPANY-002, REQ-COMPANY-004, REQ-COMPANY-005 | ✅ |
| `POST /api/v1/companies/:companyId/membership/rejoin` | API-COMPANY-003 (line 297) | REQ-COMPANY-002, REQ-COMPANY-004, REQ-COMPANY-005 | ✅ |
| `POST /api/v1/companies/:companyId/ownership-transfer` | **NO CATALOG ENTRY** | Only D8 decision | ⚠️ MEDIUM |

**Finding M-1:** Ownership-transfer endpoint has no explicit Phase 06 API catalog entry. The catalog has API-COMPANY-001 for "Company profile management" but does not list ownership transfer as a separate capability. D8 decision provides business rules but is not a catalog entry.

---

### Checkpoint 2: DTO fields SQL-backed

| DTO | Fields | SQL Table | Verified? |
|---|---|---|---|
| `AuthMeResponseDto` | `id, email, first_name, middle_name, last_name, display_name, phone, avatar_path, role, status` | `users` (03_users_auth.sql:78-156) | ✅ |
| `PresenceSessionListDto` | `id, socket_id, device_type, user_agent, last_seen_at, is_online, created_at, updated_at` | `user_sessions` (03_users_auth.sql:335-348) | ✅ |
| `RevokePresenceSessionDto` | `session_id` → `user_sessions.id` | `user_sessions.id` | ✅ |
| `CreateCompanyDto` | 24 fields (name, slug, legal_name, etc.) | `companies` (04_companies.sql:42-130) | ✅ |
| `CompanySummaryDto` | `id, name, slug, legal_name, description, industry, company_size, website, is_active, verification_status, created_at, updated_at` | `companies` (04_companies.sql:42-130) | ✅ |
| `UpdateCompanyDto` | Approved mutable subset of create fields | `companies` | ✅ |
| `CreateBranchDto` / `UpdateBranchDto` | Actual `company_branches` columns | `company_branches` (04_companies.sql:143-170) | ✅ |
| `CreateDepartmentDto` / `UpdateDepartmentDto` | `name, head_member_id` + actual columns | `departments` (04_companies.sql:183-196) | ✅ |
| `CreateTeamDto` / `UpdateTeamDto` | `department_id, name, lead_member_id` + actual columns | `teams` (04_companies.sql:208-221) | ✅ |
| `AddCompanyMemberDto` | Actual `company_members` columns | `company_members` (04_companies.sql:234-306) | ✅ |
| `MembershipSummaryDto` | Actual `company_members` columns | `company_members` | ✅ |
| `TransferOwnershipDto` | `new_owner_user_id` → `public.users.id` | `companies.owner_id` (04_companies.sql:80) | ✅ |

**All DTO fields verified SQL-backed.** ✅

---

### Checkpoint 3: No phantom elements

| Check | Result | Evidence |
|---|---|---|
| No phantom fields | ✅ | All fields traced to SQL columns |
| No phantom tables | ✅ | All referenced tables exist in baseline |
| No phantom enums | ✅ | No new enums introduced |
| No phantom routes | ✅ | All routes traceable to catalog/decisions |
| No phantom behavior | ✅ | All behavior consistent with D1-D8 |

**No phantom elements found.** ✅

---

### Checkpoint 4: Actor/ownership/scoping rules consistent with D1–D8

| Decision | Freeze Candidate Coverage | Consistent? |
|---|---|---|
| D1 — Auth bootstrap | No bootstrap endpoint; `GET /auth/me` returns profile | ✅ |
| D2 — Company creation | Active employer creates company, JWT `sub` → `owner_id` | ✅ |
| D3 — Membership model | Registered user via inactive row; self-accept; no external invitation | ✅ |
| D4 — Org API shape | Separate nested REST resources for branches/departments/teams | ✅ |
| D5 — Session revoke | Current presence row only; other devices unaffected | ✅ |
| D6 — Owner protection | Sole owner cannot leave without transfer; rejoin = owner/admin approval | ✅ |
| D7 — Auth revocation | HttpOnly cookie clear; no Supabase token-revoke per logout | ✅ |
| D8 — Ownership transfer | Single-owner model; atomic transaction; eligible active member | ✅ |

**All D1-D8 rules correctly reflected.** ✅

---

### Checkpoint 5: UserContextClient/SystemClient/RLS boundaries

| Endpoint | Client | RLS Policy | Correct? |
|---|---|---|---|
| `GET /auth/me` | UserContextClient | `users_own_read` (17_rls.sql:178) | ✅ |
| `GET /auth/sessions` | SystemClient | No authenticated SELECT policy (17_rls.sql:69) | ✅ |
| `POST /auth/sessions/revoke` | SystemClient | No authenticated SELECT policy | ✅ |
| Company reads | SystemClient | No authenticated SELECT policy (17_rls.sql:72) | ✅ |
| Company writes | SystemClient | No authenticated DML policy | ✅ |
| Org reads/writes | SystemClient | No authenticated SELECT/DML policy | ✅ |
| Membership reads/writes | SystemClient | No authenticated SELECT/DML policy | ✅ |

**UserContextClient is SELECT-only (clients.ts:10).** ✅
**SystemClient is server-only (clients.ts:17-22).** ✅
**No authenticated DML grants on business tables (17_rls.sql:152).** ✅

**All boundaries accurate.** ✅

---

### Checkpoint 6: Transaction/audit/idempotency/external-call rules

| Rule | Freeze Candidate | Phase 05/07 | Implementable? |
|---|---|---|---|
| Business row + audit/history atomic | Line 47: "Business row plus required audit/history is atomic" | Phase 05: line 100 | ✅ |
| External calls post-commit | Line 47: "external calls are post-commit" | Phase 07: line 136 | ✅ |
| Idempotency where applicable | Not detailed per-endpoint | Expected at implementation level | ✅ |
| Audit trail mandatory | Not detailed per-endpoint | Expected at implementation level | ✅ |

**All rules implementable.** ✅

---

### Checkpoint 7: Ownership-transfer completeness

| Aspect | Status | Evidence |
|---|---|---|
| Path | ✅ | `POST /api/v1/companies/:companyId/ownership-transfer` |
| Request DTO | ✅ | `TransferOwnershipDto` with `new_owner_user_id` |
| Response DTO | ✅ | `CompanySummaryDto` |
| Business rules | ✅ | D8: single-owner, eligible active member, atomic transaction |
| Acceptance criteria | ⚠️ LOW | Not detailed in freeze candidate; D8 provides business rules only |

**Ownership-transfer has 1 LOW gap: acceptance criteria not detailed.**

---

### Checkpoint 8: Error vocabulary/acceptance criteria

| Aspect | Status | Evidence |
|---|---|---|
| Error vocabulary defined | ✅ | Decision-06: 16 approved codes |
| Per-endpoint error mapping | ⚠️ LOW | Not in freeze candidate; expected in API catalog |
| Acceptance criteria per-endpoint | ⚠️ LOW | Not in freeze candidate; expected in API catalog |

**Error vocabulary is defined (Decision-06). Per-endpoint mapping is an implementation detail.** ✅

---

### Checkpoint 9: Historical wording contradictions

| Document | Potential Contradiction | Resolution | Contradicts? |
|---|---|---|---|
| Proposal line 21: "NEEDS SOURCE/DECISION" for MEMBERSHIP-ACCEPT | Freeze candidate line 35: `POST .../membership/accept` with `none` DTO | Freeze candidate supersedes | ✅ No contradiction |
| Freeze worksheet line 30: "NEEDS_DECISION" for MEMBERSHIP-INVITE | Freeze candidate line 34: `POST .../members` with `AddCompanyMemberDto` | Freeze candidate supersedes | ✅ No contradiction |
| Freeze candidate line 5: "Historical worksheets may contain older TBD labels; they do not override this candidate document" | Explicit supersession clause | N/A | ✅ No contradiction |

**No contradictions found.** ✅

---

### Checkpoint10: No requirement silently missed/invented/altered

| Check | Result | Evidence |
|---|---|---|
| No requirements invented | ✅ | All endpoints trace to catalog/decisions |
| No requirements altered | ✅ | All behavior consistent with Phase 05 |
| No requirements silently missed | ✅ | Auth/Company/Membership domains covered |

**No silent misses/inventions/alterations.** ✅

---

## 3. Findings Summary

| # | Finding | Severity | Fix Required |
|---|---|---|---|
| M-1 | Ownership-transfer endpoint has no Phase 06 API catalog entry | MEDIUM | Add API-COMPANY-004 entry in Phase 06 catalog or explicitly trace to existing entry |
| L-1 | Ownership-transfer acceptance criteria not detailed | LOW | Add acceptance criteria section to freeze candidate |
| L-2 | Per-endpoint error code mapping not in freeze candidate | LOW | Add error code reference per endpoint or note as implementation detail |

---

## 4. Previous Review Issues — Status

| # | Previous Issue | Status in Freeze Candidate |
|---|---|---|
| 1 | `session_id` mapping to SQL | ✅ **RESOLVED** — Line 44: "`session_id` maps to SQL `user_sessions.id`" |
| 2 | Phantom columns (`ip_address`, `last_activity_at`) | ✅ **RESOLVED** — Not present in freeze candidate |
| 3 | Ownership-transfer endpoint missing | ✅ **RESOLVED** — Line 39: endpoint added |
| 4 | `legal_name` in company response | ✅ **RESOLVED** — Line 25: `CompanySummaryDto` includes `legal_name` |
| 5 | MEMBERSHIP-ACCEPT path unresolved | ✅ **RESOLVED** — Line 35: path with `none` DTO |
| 6 | Stale NEEDS_DECISION labels | ✅ **RESOLVED** — Line 5: "Historical worksheets may contain older TBD labels; they do not override" |
| 7 | D6 rejoin-approval semantics | ✅ **RESOLVED** — Line 15: "Rejoin reactivates the existing membership row after owner/admin approval" |
| 8 | Proposal "decisions required" outdated | ✅ **RESOLVED** — Freeze candidate supersedes proposal |

---

## 5. D1–D8 Decision Reflection (Freeze Candidate)

| Decision | Freeze Candidate Line | Correct? |
|---|---|---|
| D1 — Auth bootstrap | Line 9: "handle_new_user() creates public.users" | ✅ |
| D2 — Company creation | Line 13: "One primary owner per company" | ✅ |
| D3 — Membership model | Line 14: "Registered-user membership accept only" | ✅ |
| D4 — Org API shape | Lines 28-33: Separate nested REST resources | ✅ |
| D5 — Session revoke | Lines 23-24: Sessions/revoke endpoints | ✅ |
| D6 — Owner protection | Line 15: "Rejoin reactivates the existing membership row after owner/admin approval" | ✅ |
| D7 — Auth revocation | Line 16: "Normal logout clears the HttpOnly cookie and current presence row" | ✅ |
| D8 — Ownership transfer | Line 39: Ownership-transfer endpoint | ✅ |

**All D1-D8 correctly reflected.** ✅

---

## 6. Non-negotiable Rules Check

| Rule | Freeze Candidate | Verified? |
|---|---|---|
| `owner_id`, `company_id`, actor identity server-derived | Line 43 | ✅ |
| `session_id` → `user_sessions.id` | Line 44 | ✅ |
| `head_member_id`/`lead_member_id`/`manager_member_id` → `company_members` IDs | Line 45 | ✅ |
| No unapproved event/table/queue/artifact | Line 46 | ✅ |
| Business row + audit/history atomic; external calls post-commit | Line 47 | ✅ |
| Sensitive fields excluded from responses | Line 48 | ✅ |

**All non-negotiable rules present and correct.** ✅

---

## 7. Final Readiness

### **PASS WITH REQUIRED FIXES**

| Category | Status |
|---|---|
| **Endpoint traceability** | ⚠️ 17/18 traceable; ownership-transfer needs catalog entry |
| **DTO field SQL-backing** | ✅ All fields verified |
| **Phantom elements** | ✅ None found |
| **D1–D8 consistency** | ✅ All 8 correctly reflected |
| **Client/RLS boundaries** | ✅ Accurate |
| **Transaction/audit rules** | ✅ Implementable |
| **Ownership-transfer** | ⚠️ Path/DTO present; acceptance criteria LOW gap |
| **Error vocabulary** | ✅ Defined in Decision-06 |
| **Historical contradictions** | ✅ None found |
| **Requirement integrity** | ✅ No silent misses/inventions |

**After M-1 (add ownership-transfer to Phase 06 catalog) and L-1/L-2 (add acceptance criteria and error mapping notes):**
```
READY FOR CONTRACT FREEZE
```

---

*Report generated by Opencode agent on 2026-08-27.*
