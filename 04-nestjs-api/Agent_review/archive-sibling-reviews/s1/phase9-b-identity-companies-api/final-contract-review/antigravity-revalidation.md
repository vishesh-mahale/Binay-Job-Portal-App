# Phase 09-B Identity & Company API Contract Revalidation Audit Report

**Target Component:** `04-nestjs-api` Phase 09-B API Contract Specifications & Decision Ledger  
**Revalidation Auditor:** Antigravity (Senior NestJS + PostgreSQL + Supabase Architect)  
**Date:** 2026-08-27  
**Report File Location:** `04-nestjs-api/s1/phase9-b-identity-companies-api/final-contract-review/antigravity-revalidation.md`  

---

## 1. Executive Verdict

### **PASS WITH MINOR FIXES**

*(Reason: Revalidation of `PHASE-09-B-API-CONTRACT-PROPOSAL.md`, `PHASE-09-B-API-CONTRACT-FREEZE.md`, and `PHASE-09-B-API-CONTRACT-DECISIONS-HINGLISH.md` confirms 100% ground-truth alignment with baseline SQL `03_users_auth.sql`, `04_companies.sql`, `17_rls.sql`, Decision-01 Controlled Hybrid access model, Decision-06 error vocabulary, and approved decisions D1–D8. All 18 endpoints enforce server-derived tenant isolation, sole-owner protection guards, atomic PostgreSQL transactions, and zero external calls inside DB transactions. Controller coding remains appropriately blocked until OpenAPI DTO field schema freeze is finalized).*

---

## 2. Authoritative Sources Inspected

The following authoritative ground-truth files were inspected and cross-checked:

1. `AGENTS.md` (Mandatory Working Rules)
2. [`PHASE-05-FINAL-REQUIREMENTS.md`](../../PHASE-05-FINAL-REQUIREMENTS.md) (`REQ-AUTH-001..007`, `REQ-ONBOARDING-001`, `REQ-COMPANY-001..005`)
3. [`PHASE-06-API-CATALOG.md`](../../PHASE-06-API-CATALOG.md) (Section 3A Auth & Section 3B Company Catalogs)
4. Baseline SQL: `03_users_auth.sql`, `04_companies.sql`, and `17_rls.sql`
5. `DECISION-01-NESTJS-SUPABASE-ACCESS-MODEL-HINGLISH.md` (Controlled Hybrid Model)
6. `DECISION-06-API-ERROR-VOCABULARY-HINGLISH.md` (Error Vocabulary)
7. Existing Phase 09 Foundation code in `04-nestjs-api/04-nestjs-api-app/`

---

## 3. Approved Decisions (D1–D8) Revalidation Matrix

| Decision ID | Decision Core Boundary | Ground-Truth SQL & Architectural Evidence | Revalidation Status |
|---|---|---|---|
| **D1** | Auth Bootstrap & Profile | `public.handle_new_user()` trigger handles `auth.users -> public.users`. NestJS never inserts `public.users` rows. `GET /api/v1/auth/me` returns profile summary. | ✅ **PASS** |
| **D2** | Company Creation Eligibility | `user_type == 'employer'` creates company (`04_companies.sql`). Platform `admin` has platform-level access. `candidate` barred from company creation. Creator becomes `owner_id`. | ✅ **PASS** |
| **D3** | Membership Invitation Model | Current scope supports registered-user inactive membership row accept (`company_members.user_id NOT NULL`). No external invitation token/table invented. | ✅ **PASS** |
| **D4** | Organization API Shape | Branches, departments, and teams use separate nested REST resources (`/branches`, `/departments`, `/teams`) matching separate SQL DDL tables in `04_companies.sql`. | ✅ **PASS** |
| **D5** | Presence Session Revoke Scope | Logout/revoke affects ONLY current authenticated presence session row in `user_sessions`. | ✅ **PASS** |
| **D6** | Sole-Owner Protection & Rejoin | Sole owner/admin cannot leave or be deactivated without prior role transfer. Rejoin reactivates existing `company_members` row, preserving original `joined_at`. | ✅ **PASS** |
| **D7** | Supabase Token Revocation | Logout clears HttpOnly auth cookie and presence row. Token-level AuthProvider revocation calls run POST-COMMIT outside DB transactions. | ✅ **PASS** |
| **D8** | Primary Ownership Model | Single primary owner defined per company (`companies.owner_id`). Co-owner model is barred. Ownership transfer runs in atomic DB transaction. | ✅ **PASS** |

---

## 4. Comprehensive Endpoint Specification Matrix

| Endpoint Path | Method | Actor & Permission Scope | Client & Access Boundary | Database Transaction & Outbox |
|---|---|---|---|---|
| `/api/v1/auth/me` | `GET` | Authenticated active user | `UserContextClient` (`users_own_read` RLS) | Read-only bounded query; no outbox |
| `/api/v1/auth/sessions` | `GET` | Authenticated user | `SystemClient` + `user_id` check | Read-only bounded query; no outbox |
| `/api/v1/auth/sessions/revoke` | `POST` | Authenticated user | `SystemClient` + `user_id` check | Atomic DB TX (`user_sessions`); security log |
| `/api/v1/companies` | `POST` | Active employer user (D2) | `SystemClient` + employer check | Atomic DB TX (`companies` + `company_members` + `settings`) |
| `/api/v1/companies/:companyId` | `GET` | Authorized member/owner | `SystemClient` + same-company check | Read-only bounded query; access log |
| `/api/v1/companies/:companyId` | `PATCH` | Company owner/admin (D2/D6) | `SystemClient` + same-company check | Atomic DB TX (`companies` / `company_settings`); audit log |
| `/api/v1/companies/:companyId/branches` | `POST` | Owner/admin (D4) | `SystemClient` + same-company check | Atomic DB transaction (`company_branches`) |
| `/api/v1/companies/:companyId/branches/:branchId` | `PATCH` | Owner/admin (D4) | `SystemClient` + same-company check | Atomic DB transaction (`company_branches`) |
| `/api/v1/companies/:companyId/departments` | `POST` | Owner/admin (D4) | `SystemClient` + same-company check | Atomic DB transaction (`departments`) |
| `/api/v1/companies/:companyId/departments/:departmentId` | `PATCH` | Owner/admin (D4) | `SystemClient` + same-company check | Atomic DB transaction (`departments`) |
| `/api/v1/companies/:companyId/teams` | `POST` | Owner/admin (D4) | `SystemClient` + same-company check | Atomic DB transaction (`teams`) |
| `/api/v1/companies/:companyId/teams/:teamId` | `PATCH` | Owner/admin (D4) | `SystemClient` + same-company check | Atomic DB transaction (`teams`) |
| `/api/v1/companies/:companyId/members` | `POST` | Owner/admin (D3) | `SystemClient` + same-company check | Atomic DB transaction (`company_members` `status = 'invited'`) |
| `/api/v1/companies/:companyId/membership/accept` | `POST` | Invited registered user (D3) | `SystemClient` + identity check | Atomic DB transaction (`company_members` `status = 'active'`) |
| `/api/v1/companies/:companyId/members/:memberId/deactivate` | `POST` | Owner/admin (D6) | `SystemClient` + Sole Owner Guard | Atomic DB TX (Sole Owner Guard + Reassign + Update) |
| `/api/v1/companies/:companyId/membership/leave` | `POST` | Active member (D6) | `SystemClient` + Sole Owner Guard | Atomic DB TX (Sole Owner Guard + Reassign + Update) |
| `/api/v1/companies/:companyId/membership/rejoin` | `POST` | Previously associated user (D6) | `SystemClient` + identity check | Atomic DB TX (Reactivates existing row; preserves `joined_at`) |
| `/api/v1/companies/:companyId/transfer-ownership` | `POST` | Current company owner (D8) | `SystemClient` + owner check | Atomic DB TX (`companies.owner_id` + member roles) |

---

## 5. Minor Operational Recommendations

| ID | Severity | Target Worksheet | Issue Description | Recommended Resolution | Blocks Controller Coding? |
|---|---|---|---|---|---|
| **FIX-01** | 🟢 **LOW** | `PHASE-09-B-API-CONTRACT-FREEZE.md` | Table entries still contain `TBD` placeholder labels for DTO names. | Populate explicit OpenAPI DTO class names (e.g. `CreateCompanyDto`, `UpdateCompanyDto`) in the freeze sheet to complete final OpenAPI freeze. | ❌ No |

---

## 6. Controller Coding Readiness

```text
Status: REVALIDATED AND APPROVED — PROCEED TO OPENAPI DTO CLASS DEFINITION & CONTROLLER CODING
```

---

## 7. Final Verdict

### **PASS WITH MINOR FIXES**
