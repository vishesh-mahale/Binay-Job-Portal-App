# Ownership Transfer Audit Mechanism Gap Review

**Target Document:** `04-nestjs-api/04-nestjs-api-app/OWNERSHIP-TRANSFER-AUDIT-GAP.md`  
**Auditor:** Kilo  
**Date:** 2026-08-27  
**Report File Location:** `04-nestjs-api/ownership-audit-review/kilo.md`

---

## 1. Executive Verdict

**GAP CONFIRMED.** No approved `company_history` table, ownership-transfer-specific DB function, or `company.ownership.transferred` outbox contract exists in the reviewed baseline (01–19) or approved Phase 5/6/9-B documents. The gap document's core claim is accurate.

However, the review identified one additional fact absent from the gap document: `audit_logs` (defined in `13_analytics.sql`) is an existing generic audit table with the shape to record ownership transfers (`company_id`, `target_user_id`, `old_values`, `new_values`, `action`, `entity_type`). It is **not** currently approved or contracted for this purpose, so Option 1 remains unfulfilled without an explicit mapping decision.

---

## 2. Ground-Truth Evidence

| Source | Verified Finding | Impact |
|---|---|---|
| `04_companies.sql:42-130` | `companies` table has only `owner_id UUID NOT NULL REFERENCES users(id)`. No `company_history`, `ownership_audit`, or similar table. | Confirms no dedicated company ownership history table. |
| `04_companies.sql:132-135` | Only trigger is `companies_updated_at` (timestamp update). No ownership-transfer trigger or function. | Confirms no ownership-transfer audit function. |
| `03_users_auth.sql:373-384` | `user_security_log` exists: append-only, user-scoped, `event_type` ENUM. Immutable via `user_security_log_immutable` trigger. | Generic user security audit exists but is user-scoped, not company-scoped. Not approved for ownership transfer. |
| `03_users_auth.sql:394-422` | `login_history` exists: append-only, login-specific. | Irrelevant to ownership transfer. |
| `15_infrastructure.sql:23-89` | `outbox_events` generic table exists. No `company.ownership.transferred` event is registered in any reviewed document. | Confirms no approved outbox contract for ownership transfer. |
| `13_analytics.sql:173-240` | `audit_logs` table exists with `company_id`, `user_id`, `target_user_id`, `action`, `entity_type`, `entity_id`, `old_values`, `new_values`, `changes`. Examples include `company.updated`. Append-only via `audit_logs_immutable` trigger (line 384). | Generic company-level audit table exists (Option 1 candidate) but is **not** approved/contracted for ownership-transfer logging. |
| `PHASE-05-FINAL-REQUIREMENTS.md:100` | "Business row, audit/history and outbox event commit atomically." | Requires audit/history to exist. |
| `PHASE-05-FINAL-REQUIREMENTS.md:220-240` | Registered async routes list 7 events; none is `company.ownership.transferred`. `application.status.changed` is noted as an expected phased gap. | Confirms no ownership-transfer event in the dispatcher registry. |
| `PHASE-06-API-CATALOG.md:824-842` | `API-COMPANY-004` catalogs ownership transfer. Transaction: "eligibility, relationship checks, owner update and audit/history commit atomically." Outbox: "none unless an approved contract is later mapped." | Contract requires audit/history but does not define the table/function/event. |
| `PHASE-09-B-API-CONTRACT-FINAL-FREEZE-CANDIDATE.md:13,47,58` | "One primary owner per company; owner transfer is explicit and atomic." "Business row plus required audit/history is atomic." "commits ownership plus required audit/history atomically." | Freeze candidate mandates audit/history but does not specify the mechanism. |
| `AGENTS.md:16-18` | "Missing requirement invent न करें... silently guess/fix न करें।" | Prohibits inventing an audit table/function/event. Requires explicit decision. |

---

## 3. Evaluation of Options

### Option 1: Approve Existing Generic Audit Mechanism
- **Candidate:** `audit_logs` (`13_analytics.sql`) is the strongest existing generic mechanism. It supports `company_id`, `target_user_id`, `old_values`/`new_values`, and `action` (e.g., `company.ownership_transferred`).
- **Gap:** It is **not** currently approved for this specific action. No trigger, function, or contract maps ownership transfer to `audit_logs`. RLS in `17_rls.sql` enables the table but leaves it service-only; no authenticated read policy exists.
- **Verdict:** Partially viable. Requires an explicit approval decision and contract mapping before use.

### Option 2: Reviewed Forward Migration + Versioned Contract
- **Mechanics:** Add a reviewed forward migration (e.g., `company_ownership_history` table with `company_id`, `previous_owner_id`, `new_owner_id`, `transferred_by`, `transferred_at`) and a versioned `company.ownership.transferred.v1` outbox contract.
- **Verdict:** Valid and clean. Requires new baseline artifact, contract file, and dispatcher registration. Aligns with `AGENTS.md` forward-migration discipline.

### Option 3: Explicitly Defer Audit and Adjust Acceptance Criteria
- **Mechanics:** Keep the atomic `companies.owner_id` update. Update the `API-COMPANY-004` acceptance criteria and `PHASE-09-B` freeze criteria to remove the "required audit/history" claim for this endpoint until a forward migration or contract mapping is completed.
- **Verdict:** Valid and lowest-risk short-term path. Accurately reflects the current executable baseline without inventing anything.

---

## 4. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **Production blocker:** Endpoint is frozen as implementation-authorized but cannot honestly claim "audit/history" completion. | High | High | Decide on Option 1, 2, or 3 explicitly before NestJS implementation begins. |
| **Wrong mechanism chosen:** Using `user_security_log` (user-scoped) instead of `audit_logs` (company-scoped) creates query/ownership inconsistencies. | Medium | Medium | If Option 1 is chosen, formally map to `audit_logs`, not `user_security_log`. |
| **Invented schema risk:** Teams may be tempted to create `company_history` without a reviewed forward migration. | Medium | High | `AGENTS.md` prohibits this; enforce via review gate. |
| **Contract drift:** `PHASE-09-B` says "required audit/history" but no artifact exists, creating a phantom requirement. | High | Medium | Update the contract document to reflect the chosen path. |

---

## 5. Final Verdict

**GAP CONFIRMED.** The ownership-transfer audit mechanism is missing. The gap document correctly identifies the absence of a dedicated table, function, and event. 

**Recommended path:** **Option 3 (defer) for immediate Phase 09-B compliance, with Option 2 (forward migration) tracked as the next explicit artifact.** 
- Rationale: The baseline is frozen. No approved audit artifact exists. Adding `audit_logs` mapping (Option 1) is viable but still requires an explicit contract approval that does not currently exist. Deferring the acceptance claim is the most honest and lowest-risk path. A forward migration (`company_ownership_history` + versioned contract) should be the next reviewed artifact if historical audit queries are required by product.

If the team insists on shipping audit in Phase 09-B without a forward migration, **Option 1 must be formalized**: explicitly approve `audit_logs.action = 'company.ownership_transferred'` with `old_values`/`new_values` capturing `owner_id`, and update `PHASE-09-B` acceptance criteria to name `audit_logs` as the approved mechanism.

Do not silently choose an option. Do not invent a table or event.
