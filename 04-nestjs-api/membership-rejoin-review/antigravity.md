# Membership Rejoin Approval Contract Review

**Target Document:** `04-nestjs-api/membership-rejoin-review/REJOIN-APPROVAL-CONTRACT-QUESTION.md`  
**Auditor:** Antigravity (Senior NestJS/PostgreSQL & System Architecture Reviewer)  
**Date:** 2026-08-27  
**Report File Location:** `04-nestjs-api/membership-rejoin-review/antigravity.md`  

---

## 1. Executive Verdict

### **PASS WITH REQUIRED CONTRACT/MIGRATION**

*(Reason: Decision D6 specifies that a previously associated member requests a rejoin, an owner/admin approves it, the existing `company_members` row is reactivated, and the original `joined_at` timestamp is preserved. Baseline migration `04_companies.sql` supports atomic row reactivation (`is_active = true`, `left_at = null`, `employment_status = 'active'`) and preserves `joined_at`, but contains NO column or table to track a pending self-request state (`rejoin_requested_at`). Option 2 (Owner/Admin-driven Reactivation) is 100% supported by the existing schema without database changes. If Option 1 (Two-Step Request + Approval) is preferred to match D6 verbatim, a minor forward migration adding `rejoin_requested_at TIMESTAMPTZ` to `company_members` is required).*

---

## 2. Ground-Truth Source Evidence Verification

| File / Document Target | Verified Repository Evidence | Impact on Rejoin Contract |
|---|---|---|
| `PHASE-09-B-API-CONTRACT-DECISIONS-HINGLISH.md` (§D6) | "Previously associated user rejoin request kar sakta hai, lekin membership activation owner/admin approval ke baad hogi. Existing `company_members` row hi reactivate hogi; duplicate row nahi banegi. Original `joined_at` audit history ke liye preserve hoga." | Establishes the business rule: Member Request ➔ Owner/Admin Approval ➔ Reactivate existing row + Preserve `joined_at`. |
| `04_companies.sql` (Lines 234–268) | `company_members` table contains `id`, `company_id`, `user_id`, `is_active` (boolean), `joined_at` (TIMESTAMPTZ), `left_at` (TIMESTAMPTZ), `employment_status` (`active`, `on_leave`, `terminated`, `resigned`). | **No pending-rejoin column exists**. Reactivating a row is supported by setting `is_active = true`, `left_at = NULL`, `employment_status = 'active'` while keeping `joined_at` intact. |
| `17_rls.sql` | RLS policies restrict membership DML; write operations occur via backend `SystemClient` transactions with NestJS same-company authorization guards. | Deactivated users (`is_active = false`) have no direct RLS read/write access to company data; NestJS backend must handle the request context. |
| `PHASE-09-B-API-CONTRACT-FINAL-FREEZE-CANDIDATE.md` (Line 38) | Lists `POST /api/v1/companies/:companyId/membership/rejoin` (`MembershipSummaryDto`). | Lacks separate request vs approval endpoints and target `memberId` DTO parameter for two-step workflow. |

---

## 3. Evaluation and Comparison of the 3 Options

### **Option 1: Two-Step Commands (Self-Request ➔ Owner/Admin Approval)**
- **Mechanics:**
  - **Step 1 (Member Request):** Former member (`user_id == sub`) calls `POST /api/v1/companies/:companyId/membership/rejoin-request`. Sets `rejoin_requested_at = NOW()` on `company_members`.
  - **Step 2 (Admin Approval):** Owner/Admin calls `POST /api/v1/companies/:companyId/members/:memberId/approve-rejoin`. Sets `is_active = true`, `left_at = NULL`, `employment_status = 'active'`, `rejoin_requested_at = NULL`, and updates `updated_at`, keeping `joined_at` unchanged.
- **Schema Impact:** Requires a forward migration (`19_membership_rejoin_request.sql`) adding `rejoin_requested_at TIMESTAMPTZ` to `company_members`.
- **Verdict:** **100% Consistent with D6 business requirement**.

### **Option 2: Owner/Admin-Driven Reactivation (Single Command)**
- **Mechanics:**
  - Owner/Admin calls `POST /api/v1/companies/:companyId/members/:memberId/reactivate`.
  - Atomically sets `is_active = true`, `left_at = NULL`, `employment_status = 'active'`, updating `updated_at` while preserving `joined_at`.
  - Former member communicates desire to rejoin out-of-band (email, portal inquiry, HR request).
- **Schema Impact:** **Zero schema changes needed**. Fully supported by baseline `04_companies.sql`.
- **Verdict:** **100% Consistent with existing database schema**.

### **Option 3: Single Self-Service Rejoin (No Admin Approval)**
- **Mechanics:** Former member directly reactivates own row (`POST /api/v1/companies/:companyId/membership/rejoin`).
- **Verdict:** ❌ **REJECTED**. Violates D6 and multi-tenant security principles (a deactivated employee must never bypass employer authorization to regain access to company data).

---

## 4. Required Contract & Schema Definitions for Selected Paths

### **If Adopting Option 2 (Existing Schema Compliant — Zero Migration):**
- **Endpoint:** `POST /api/v1/companies/:companyId/members/:memberId/reactivate`
- **Actor:** Company Owner / Admin (`role IN ('owner', 'admin')`)
- **Client Boundary:** `SystemClient` + same-company authorization check
- **Request DTO:** None (path parameters `companyId` and `memberId`)
- **Response DTO:** `MembershipSummaryDto` (`status = 'active'`)
- **Transaction:** `BEGIN...COMMIT` updating `company_members` (`is_active = true`, `left_at = NULL`, `employment_status = 'active'`) and appending security audit log.

### **If Adopting Option 1 (D6 Verbatim Compliant — Requires Minor Migration):**
- **Migration:** `19_membership_rejoin_request.sql` ➔ `ALTER TABLE company_members ADD COLUMN rejoin_requested_at TIMESTAMPTZ;`
- **Endpoint 1 (Request):** `POST /api/v1/companies/:companyId/membership/rejoin-request` (Actor: Former member `user_id == sub`)
- **Endpoint 2 (Approval):** `POST /api/v1/companies/:companyId/members/:memberId/approve-rejoin` (Actor: Owner/Admin)
- **Transaction:** Step 1 sets `rejoin_requested_at = NOW()`; Step 2 reactivates member row (`is_active = true`, `rejoin_requested_at = NULL`).

---

## 5. Final Recommendation & Verdict

### **RECOMMENDED RESOLUTION:**

1. **Primary Recommendation (Option 2):** Adopt **Owner/Admin Reactivation** (`POST /api/v1/companies/:companyId/members/:memberId/reactivate`). It fulfills the core business goal (reactivating an existing `company_members` row while preserving `joined_at`) with **zero database schema modifications**.
2. **Alternative Recommendation (Option 1):** If the two-step self-request UI flow must be stored in the database, authorize forward migration `19_membership_rejoin_request.sql` to add `rejoin_requested_at TIMESTAMPTZ`.

---

## 6. Final Verdict

### **PASS WITH REQUIRED CONTRACT/MIGRATION**
