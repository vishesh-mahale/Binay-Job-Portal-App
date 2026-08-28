# Ownership Transfer Audit Mechanism Gap Review

**Target Document:** `04-nestjs-api/04-nestjs-api-app/OWNERSHIP-TRANSFER-AUDIT-GAP.md`
**Auditor:** Opencode (Independent Senior NestJS + PostgreSQL + Supabase Architect)
**Date:** 2026-08-27
**Report Path:** `04-nestjs-api/ownership-audit-review/opencode.md`

---

## 1. Executive Verdict

### **PASS WITH REQUIRED FIXES — Option 1 Viable; Gap Statement Incomplete**

The OWNERSHIP-TRANSFER-AUDIT-GAP.md states: *"The baseline does not provide a company-history table, ownership-transfer audit function, or approved `company.ownership.transferred` outbox contract."*

**This statement is partially incorrect.** The baseline DOES provide a generic audit mechanism — the `audit_logs` table in `13_analytics.sql` (lines 173–230) — which is approved, immutable, and directly usable for ownership-transfer audit logging. The gap is not "no audit mechanism exists" but rather "no ownership-transfer-specific audit contract/route exists."

---

## 2. Evidence: Existing Audit Mechanisms

### 2.1 `audit_logs` Table (13_analytics.sql:173–230)

| Column | Type | Purpose | Usable for Ownership Transfer? |
|---|---|---|---|
| `id` | UUID | Primary key | ✅ |
| `company_id` | UUID → companies(id) | Tenant scope | ✅ |
| `user_id` | UUID → users(id) | Actor (who performed) | ✅ |
| `target_user_id` | UUID → users(id) | Affected user | ✅ |
| `action` | VARCHAR(100) | Event type (e.g., `company.ownership_transferred`) | ✅ |
| `entity_type` | VARCHAR(50) | Target entity type (e.g., `company`) | ✅ |
| `entity_id` | UUID | Target entity ID | ✅ |
| `old_values` | JSONB | Previous state | ✅ |
| `new_values` | JSONB | New state | ✅ |
| `changes` | JSONB | Field-level diff | ✅ |
| `request_id` | UUID | HTTP request correlation | ✅ |
| `trace_id` | UUID | Distributed trace | ✅ |
| `metadata` | JSONB | Additional context | ✅ |
| `created_at` | TIMESTAMPTZ | When | ✅ |

**Immutability:** `audit_logs_immutable` trigger prevents UPDATE/DELETE (13_analytics.sql:384–387).

**Indexes:** Company-scoped queries, user-scoped queries, entity-scoped queries, action-scoped queries, request/trace correlation (13_analytics.sql:233–240).

**RLS:** Enabled (17_rls.sql:139); default-deny for browser roles.

### 2.2 `user_security_log` Table (03_users_auth.sql:373–384)

| Column | Type | Purpose | Usable for Ownership Transfer? |
|---|---|---|---|
| `id` | UUID | Primary key | ✅ |
| `user_id` | UUID → users(id) | Affected user | ✅ |
| `event_type` | security_event_type | Event type | ⚠️ Limited to enum values |
| `description` | TEXT | Human-readable | ✅ |
| `metadata` | JSONB | Additional context | ✅ |
| `created_at` | TIMESTAMPTZ | When | ✅ |

**Immutability:** `user_security_log_immutable` trigger prevents UPDATE/DELETE (03_users_auth.sql:444–448).

**Limitation:** `event_type` is constrained to `public.security_event_type` enum. Need to verify if `company_ownership_transferred` is in the enum.

### 2.3 Outbox Events (15_infrastructure.sql:23–89)

The `outbox_events` table exists but no `company.ownership.transferred` event is registered in the dispatcher registry. Outbox event emission must remain fail-closed until a contract is registered.

---

## 3. Verification: Gap Statement Accuracy

| OWNERSHIP-TRANSFER-AUDIT-GAP.md Claim | Actual Baseline State | Accurate? |
|---|---|---|
| "baseline does not provide a company-history table" | Correct — no dedicated `company_ownership_history` table | ✅ |
| "baseline does not provide ownership-transfer audit function" | Correct — no dedicated function | ✅ |
| "baseline does not provide approved `company.ownership.transferred` outbox contract" | Correct — no registered contract | ✅ |
| Implicit: "no audit mechanism exists" | **INCORRECT** — `audit_logs` table exists and is usable | ❌ |

**The gap statement omits the existing generic `audit_logs` table.** This is a documentation accuracy issue, not a blocking architectural gap.

---

## 4. Option Evaluation

### Option 1: Existing Generic Audit Mechanism (`audit_logs`)

**Viability: ✅ RECOMMENDED**

| Aspect | Assessment |
|---|---|
| Schema exists | ✅ `audit_logs` table in 13_analytics.sql |
| Immutability enforced | ✅ `audit_logs_immutable` trigger |
| Company-scoped | ✅ `company_id` column with index |
| Actor tracking | ✅ `user_id` column |
| Target tracking | ✅ `target_user_id` column |
| Old/new values | ✅ `old_values`, `new_values`, `changes` JSONB columns |
| Request/trace correlation | ✅ `request_id`, `trace_id` columns |
| No schema changes needed | ✅ |
| No migration needed | ✅ |

**Implementation:** During `POST /companies/:companyId/ownership-transfer`, NestJS inserts into `audit_logs` inside the atomic transaction:
```sql
INSERT INTO audit_logs (company_id, user_id, target_user_id, action, entity_type, entity_id, old_values, new_values, changes, request_id, trace_id)
VALUES ($company_id, $actor_user_id, $target_user_id, 'company.ownership_transferred', 'company', $company_id, jsonb_build_object('owner_id', $old_owner_id), jsonb_build_object('owner_id', $new_owner_id), jsonb_build_object('owner_id', jsonb_build_object('from', $old_owner_id, 'to', $new_owner_id)), $request_id, $trace_id);
```

### Option 2: Forward Migration + Dedicated Contract

**Viability: ✅ VALID but DEFERRED**

Requires:
1. Forward migration `19_company_audit.sql` with `company_ownership_history` table
2. Contract `company.ownership.transferred.v1` in `contracts/`
3. Dispatcher registry update

This is enterprise-grade but adds scope. Should be deferred to Phase 10 unless product owners require dedicated tenant audit history now.

### Option 3: Defer Audit + Adjust Acceptance Criteria

**Viability: ✅ VALID for DOCUMENTATION ONLY**

Update acceptance criteria to state: *"Ownership transfer is atomic for primary owner ID and member roles; company-level history table logging is deferred to Phase 10 forward migration."*

**Risk:** Company-level historical audit queries unavailable until Phase 10.

---

## 5. Recommended Path

### **HYBRID: Option 1 (Immediate) → Option 2 (Deferred)**

| Phase | Action | Rationale |
|---|---|---|
| **Phase 09-B (Current)** | Use `audit_logs` for ownership-transfer audit | Zero schema changes; existing immutable mechanism |
| **Phase 09-B (Current)** | Update acceptance criteria to document `audit_logs` usage | Accurate documentation |
| **Phase 10 (Future)** | Evaluate if dedicated `company_ownership_history` needed | Product owner decision |
| **Phase 10 (Future)** | If needed, create forward migration + contract | Enterprise-grade audit isolation |

---

## 6. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Gap statement incomplete — `audit_logs` omitted | MEDIUM | Update OWNERSHIP-TRANSFER-AUDIT-GAP.md to acknowledge `audit_logs` |
| `audit_logs` is company-scoped, not user-scoped | LOW | Acceptable for ownership transfer (company-level event) |
| No dedicated ownership-transfer event type in `security_event_type` enum | LOW | Use `audit_logs.action = 'company.ownership_transferred'` instead |
| Outbox event not registered | LOW | Remain fail-closed; no outbox emission until contract registered |

---

## 7. Final Verdict

### **PASS WITH REQUIRED FIXES**

| Finding | Severity | Fix |
|---|---|---|
| OWNERSHIP-TRANSFER-AUDIT-GAP.md omits `audit_logs` table | MEDIUM | Update gap statement to acknowledge `audit_logs` as existing generic mechanism |
| No ownership-transfer-specific audit contract | LOW | Document as deferred to Phase 10 |
| Outbox event not registered | LOW | Remain fail-closed; no emission until contract registered |

**After updating the gap statement to acknowledge `audit_logs`:**
```
PASS — Option 1 viable; no BLOCKER
```

---

*Report generated by Opencode agent on 2026-08-27.*
