# Membership Rejoin Approval Contract Review

**Question Document:** `04-nestjs-api/membership-rejoin-review/REJOIN-APPROVAL-CONTRACT-QUESTION.md`  
**Auditor:** Kilo  
**Date:** 2026-08-27  
**Report File Location:** `04-nestjs-api/membership-rejoin-review/kilo.md`

---

## 1. D6 Exact Meaning — VERIFIED

From `PHASE-09-B-API-CONTRACT-DECISIONS-HINGLISH.md:58-66`:

- **Member self-request:** "Previously associated user rejoin request कर सकता है"
- **Owner/admin approval required:** "membership activation owner/admin approval के बाद होगी"
- **Existing row reactivated:** "Existing `company_members` row ही reactivate होगी; duplicate row नहीं बनेगी"
- **Original `joined_at` preserved:** "Original `joined_at` audit history के लिए preserve होगा और `updated_at` बदलेगा"

D6 is unambiguous: a two-step flow where the member initiates a request and owner/admin approval performs the actual reactivation.

---

## 2. Current Database — Request/Approval State Available?

**NO.** The baseline (migrations 01–19) provides no approved durable state for rejoin requests or approvals.

| Artifact | Present? | Evidence |
|---|---|---|
| Rejoin request table | **No** | `04_companies.sql:234-306` defines `company_members` only. No `company_membership_rejoin_requests` or similar table exists. |
| Rejoin status column | **No** | `company_members` has `is_active`, `left_at`, `joined_at` but **no** `rejoin_requested_at`, `rejoin_status`, `rejoin_approved_by`, or `rejoin_approved_at`. |
| Rejoin approval function | **No** | No function in `04_companies.sql`, `03_users_auth.sql`, or `15_infrastructure.sql` handles rejoin approval. |
| Generic audit repurposing | **Not approved** | `audit_logs` (`13_analytics.sql`) and `user_security_log` (`03_users_auth.sql`) are append-only logs, not request/approval state machines. No contract maps them to rejoin approval. |

**Conclusion:** The current schema cannot distinguish a "rejoin request" from a deactivated member, nor can it track pending/approved/denied approval states.

---

## 3. Options Comparison

### Option 1: Two-step commands (member requests → owner/admin approves)

| Criterion | Assessment |
|---|---|
| **D6 consistent?** | **YES.** Exact match: member requests + owner/admin approval + existing row reactivation. |
| **Schema supported?** | **NO.** Requires durable request state (new table or columns). |
| **Durable state mechanism needed?** | Yes. Either a new `company_membership_rejoin_requests` table or new status columns on `company_members`. |

**Exact requirements for Option 1:**
- **Table/Column/Function:** A durable rejoin request state is required. Minimum: new table `company_membership_rejoin_requests` with `(id, company_id, user_id, member_id, requested_at, status, approved_by, approved_at, rejection_reason)` or equivalent columns on `company_members`.
- **API paths:** 
  - Request: `POST /api/v1/companies/:companyId/membership/rejoin` (self-request; no request DTO; actor = JWT sub)
  - Approval: new endpoint (exact path TBD by Phase 7 architecture; freeze candidate currently lacks it) with `member_id` in route or DTO
- **DTOs:** Request = none; Approval = none or optional `rejection_reason`; `member_id` route-derived
- **Authorization rules:** Request = same-company previously deactivated member (`left_at IS NOT NULL`, `is_active = false`); Approval = same-company owner/admin
- **Transaction boundary:** Approval transaction reactivates `company_members` row (`is_active = true`, clears `left_at`), updates request state to `approved`, and writes audit/history atomically. No external call in transaction.
- **Migration:** New reviewed forward migration creating request-state table/columns and indexes.

### Option 2: Owner/admin-only reactivation

| Criterion | Assessment |
|---|---|
| **D6 consistent?** | **NO.** D6 mandates "Previously associated user rejoin **request** कर सकता है". Removing the member self-request changes approved D6 wording. |
| **Schema supported?** | Partially. Can directly update `company_members.is_active`, but no approval state is recorded. |
| **Required change?** | D6 must be explicitly amended to remove member-request requirement. |

### Option 3: Single self-service rejoin

| Criterion | Assessment |
|---|---|
| **D6 consistent?** | **NO.** D6 explicitly requires "owner/admin approval". Self-service directly contradicts D6. |
| **Schema supported?** | Can directly update `company_members.is_active`. |
| **Required change?** | D6 must be explicitly amended to remove approval requirement. |

---

## 4. Most Consistent Option

**Option 1 is the ONLY option consistent with approved D6.** Options 2 and 3 each conflict with explicit D6 text and would require amending the approved decision.

---

## 5. Existing Independent Review Flags

Prior reviews in this repository already identified the same gap:

- `freebuf-review.md:161` — "M-5: Rejoin requires owner/admin approval (D6) but no approval endpoint exists"
- `freebuf-review.md:186` — "⚠️ Rejoin approval endpoint missing"
- `opencode-final-review.md:360` — "MEMBERSHIP-REJOIN actor misaligned: Proposal says 'previously associated user' (self-service). D6 says admin-activated."

These confirm the conflict is not new; it remains unresolved in the freeze candidate.

---

## 6. Final Verdict

**BLOCKED — human decision required**

| Path | What it requires | Impact on D6 |
|---|---|---|
| **A: Keep D6 as approved** | Forward migration for request-state table/columns + new approval endpoint + contract update. | D6 preserved. |
| **B: Change D6 to Option 2** | No new schema; owner/admin directly reactivates. D6 text explicitly amended. | D6 member-request requirement removed. |
| **C: Change D6 to Option 3** | No new schema; member self-service. D6 text explicitly amended. | D6 approval requirement removed. |

No implementation may proceed until this decision is made. The current freeze candidate (`POST /api/v1/companies/:companyId/membership/rejoin` with no DTO) cannot honestly implement the approved D6 two-step flow.
