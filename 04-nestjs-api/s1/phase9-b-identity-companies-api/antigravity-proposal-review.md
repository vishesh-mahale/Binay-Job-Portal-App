# Phase 09-B Identity & Company API Contract Proposal Audit Report

**Target Component:** `04-nestjs-api` Phase 09-B API Contract Proposal (`PHASE-09-B-API-CONTRACT-PROPOSAL.md`)  
**Auditor:** Antigravity (Senior API Architect & Multi-Tenant Security Reviewer)  
**Date:** 2026-08-26  
**Report File Location:** `04-nestjs-api/s1/phase9-b-identity-companies-api/antigravity-proposal-review.md`  

---

## 1. Executive Verdict

### **PASS WITH MINOR FIXES**

*(Reason: `PHASE-09-B-API-CONTRACT-PROPOSAL.md` is a highly transparent, well-structured API contract proposal. It maps 14 proposed REST endpoints to catalog capabilities without prematurely claiming them as frozen. It correctly identifies and flags 5 open decisions—including invitation token sources (`04_companies.sql`), owner eligibility policies, and `/auth/bootstrap` boundaries—as requiring explicit resolution before freeze. One low-severity operational note is provided regarding explicit HTTP verb separation for POST/PATCH endpoints).*

---

## 2. Files and Sources Inspected

The following authoritative ground-truth files were inspected and cross-checked:

1. `AGENTS.md` (Mandatory Working Rules)
2. [`PHASE-05-FINAL-REQUIREMENTS.md`](../../PHASE-05-FINAL-REQUIREMENTS.md) (`REQ-AUTH-001..007`, `REQ-ONBOARDING-001`, `REQ-COMPANY-001..005`)
3. [`PHASE-06-API-CATALOG.md`](../../PHASE-06-API-CATALOG.md) (Section 3A Auth & Section 3B Company Catalogs)
4. [`PHASE-07-ARCHITECTURE.md`](../../PHASE-07-ARCHITECTURE.md) (Layered & Multi-Tenant Boundaries)
5. [`PHASE-08-IMPLEMENTATION-PLAN.md`](../../PHASE-08-IMPLEMENTATION-PLAN.md) (Phase 08-B Plan)
6. [`PHASE-09-B-IDENTITY-COMPANIES-SCOPE.md`](../../PHASE-09-B-IDENTITY-COMPANIES-SCOPE.md)
7. Baseline SQL: `03_users_auth.sql`, `04_companies.sql`, and `17_rls.sql`
8. `DECISION-01-NESTJS-SUPABASE-ACCESS-MODEL-HINGLISH.md` (Controlled Hybrid Model)
9. `DECISION-06-API-ERROR-VOCABULARY-HINGLISH.md` (Error Vocabulary)

---

## 3. Proposal Verification Matrix

| Proposed Contract ID | Proposed Method & Path | Actor / Permission Scope | Ground Truth Audit Verification | Result |
|---|---|---|---|---|
| **AUTH-BOOTSTRAP** | `POST /api/v1/auth/bootstrap` | Verified signup/callback | Flagged in Decision 1 (`NEEDS_DECISION` for NestJS vs Supabase callback boundary). | ✅ **PASS** |
| **AUTH-ME** | `GET /api/v1/auth/me` | Authenticated active user | Maps to `03_users_auth.sql` `users` table profile summary (`REQ-AUTH-001`). | ✅ **PASS** |
| **AUTH-SESSION** | `GET /api/v1/auth/sessions`, `POST /api/v1/auth/sessions/revoke` | Authenticated user | Maps to `03_users_auth.sql` `user_sessions` table (`REQ-AUTH-005`). Decision 5 tracks revocation granularity. | ✅ **PASS** |
| **COMPANY-CREATE** | `POST /api/v1/companies` | Eligible user | Maps to `04_companies.sql` `companies` + `company_members` (`owner`). Decision 2 tracks eligibility rules. | ✅ **PASS** |
| **COMPANY-READ** | `GET /api/v1/companies/:companyId` | Authorized member/owner | Enforces tenant boundary check. Cross-company access returns `404 Not Found`. | ✅ **PASS** |
| **COMPANY-UPDATE** | `PATCH /api/v1/companies/:companyId` | Owner/admin policy | Updates `companies` / `company_settings` in atomic DB transaction. | ✅ **PASS** |
| **ORG-BRANCH** | `POST/PATCH /api/v1/companies/:companyId/branches/:branchId?` | Owner/admin | Maps to `04_companies.sql` `company_branches` table (`REQ-COMPANY-003`). | ✅ **PASS** |
| **ORG-DEPARTMENT** | `POST/PATCH /api/v1/companies/:companyId/departments/:departmentId?` | Owner/admin | Maps to `04_companies.sql` `departments` table (`REQ-COMPANY-003`). | ✅ **PASS** |
| **ORG-TEAM** | `POST/PATCH /api/v1/companies/:companyId/teams/:teamId?` | Owner/admin | Maps to `04_companies.sql` `teams` table (`REQ-COMPANY-003`). | ✅ **PASS** |
| **MEMBERSHIP-INVITE** | `POST /api/v1/companies/:companyId/members` | Owner/admin | Adds `company_members` record (`REQ-COMPANY-004`). | ✅ **PASS** |
| **MEMBERSHIP-ACCEPT** | `POST /api/v1/membership-invitations/:invitationId/accept` | Invitation caller | Flagged in Decision 3 (`NEEDS SOURCE/DECISION` for token table). | ✅ **PASS** |
| **MEMBERSHIP-DEACTIVATE** | `POST /api/v1/companies/:companyId/members/:memberId/deactivate` | Owner/admin | Enforces department-head, team-lead, manager reassignment before deactivation. | ✅ **PASS** |
| **MEMBERSHIP-LEAVE** | `POST /api/v1/companies/:companyId/membership/leave` | Active member | Enforces relationship reassignment & owner orphan protection. | ✅ **PASS** |
| **MEMBERSHIP-REJOIN** | `POST /api/v1/companies/:companyId/membership/rejoin` | Previously associated user | Reactivates existing `company_members` row (`REQ-COMPANY-005`). | ✅ **PASS** |

---

## 4. Open Decisions Verification Checklist

The proposal honestly tracks all 5 open decisions in Section 36:
1. **Decision 1 (`/auth/bootstrap`):** Verifies whether NestJS or Supabase handles callback bootstrap.
2. **Decision 2 (Owner Eligibility):** Resolves universal owner/admin creation permissions.
3. **Decision 3 (Invitation Token Source):** Flags missing invitation token schema in baseline `04_companies.sql`.
4. **Decision 4 (Org Structure Nesting):** Resolves nested REST paths vs single org administration command endpoint.
5. **Decision 5 (Session Revocation Scope):** Resolves single session vs all session revocation boundaries.

---

## 5. Minor Fixes and Operational Recommendations

| ID | Severity | Proposal Target | Finding / Issue Description | Recommended Fix | Blocks Freeze? |
|---|---|---|---|---|---|
| **FIX-01** | 🟢 **LOW** | Lines 17–19 (`ORG-BRANCH`, `ORG-DEPARTMENT`, `ORG-TEAM`) | Path table combines `POST/PATCH` into a single line with `?` notation. | Split `POST` (create) and `PATCH` (update) into distinct table rows in the final frozen contract. | ❌ No |

---

## 6. Next Step Readiness & Implementation Authorization

```text
Status: PROPOSAL REVIEW PASSED — READY FOR FINAL CONTRACT FREEZE AFTER 5 OPEN DECISIONS RESOLVED
```

Once the 5 open decisions in Section 36 are formally resolved, the proposal can be promoted to **FROZEN PUBLIC API CONTRACT**.

---

## 7. Final Verdict

### **PASS WITH MINOR FIXES**
