# Jobs/Search — Independent Cross-Audit (Freebuf)

**Date:** 2026-08-27
**Auditor:** Freebuf (independent Senior Tech Architect)
**Scope:** Last 4–5 changes — Decision-07, expire_due_jobs() SQL, expiry transitions, notification/audit behavior, grants, guest expires_at guard, API catalog sync

---

## 1. Executive Verdict

**⚠️ CONDITIONAL PASS — VALIDATED with 2 MEDIUM and 3 LOW findings**

The last 4–5 changes (Decision-07 finalization, expire_due_jobs() SQL addition, Codex cross-review, SQL-contract sync scope, expiry design draft) are **architecturally sound and internally consistent**. The expire_due_jobs() function is correctly designed for idempotency, concurrency safety, audit logging, and notification behavior. No BLOCKER or HIGH severity issues found. However, 2 MEDIUM and 3 LOW findings require attention before production deployment.

---

## 2. Files Inspected

| # | File | Role |
|---|------|------|
| 1 | `DECISION-07-JOBS-SEARCH-FINAL.md` | Final frozen Jobs/Search decisions J1–J8 |
| 2 | `CODEX-FINAL-AGENT-REVIEW.md` | Cross-review of 3 agent reports |
| 3 | `EXPIRY-SQL-FINAL-DECISION-FORM.md` | Expiry SQL decision form (pending confirmation) |
| 4 | `EXPIRY-SQL-DESIGN-DRAFT.md` | Expiry SQL design draft |
| 5 | `SQL-CONTRACT-SYNC-IMPLEMENTATION-SCOPE.md` | Implementation scope doc |
| 6 | `15_infrastructure.sql` | expire_due_jobs() function |
| 7 | `17_rls.sql` | Grants and REVOKE/GRANT for expire_due_jobs |
| 8 | `05_jobs.sql` | Jobs table, indexes, expiry index |
| 9 | `12_notifications.sql` | Notifications table, constraints |
| 10 | `13_analytics.sql` | audit_logs table, constraints, immutable trigger |
| 11 | `PHASE-06-API-CATALOG.md` §3D | Jobs/search catalog (Decision-07 synced) |
| 12 | `PHASE-08-IMPLEMENTATION-PLAN.md` | Phase 08-D jobs/search plan |
| 13 | `guest.ts` | Guest session, apply, expires_at guard |
| 14 | `02_enums.sql` | job_status enum definition |

---

## 3. Decision-07 Source Alignment

| Decision | Claim | Evidence | Verdict |
|----------|-------|----------|---------|
| J1 Routes | 11 company-scoped REST routes frozen | Phase 06 §3D lines 389–411: TBD → now synced to Decision-07 | ✅ VALIDATED |
| J1 Terminal states | `closed`, `expired`, `archived` cannot reopen | `02_enums.sql:161–169`: 7 states; Phase 04 §7: no reopen assumed | ✅ VALIDATED |
| J2 Permissions | owner/admin approval, HR/employer create/edit | `04_companies.sql`: company_members permissions JSONB; 17_rls.sql: RLS boundary | ✅ VALIDATED |
| J3 Approval | `job_approval_required = false` = direct publish | `04_companies.sql`: `company_settings.job_approval_required BOOLEAN DEFAULT TRUE` | ✅ VALIDATED |
| J3 Archived conflict | `auto_approve_jobs` vs `job_approval_required` resolved | Decision-07: "archived auto_approve_jobs is documentation only; implementation uses real column" | ✅ VALIDATED |
| J4 Expiry | pg_cron daily 12:05 AM + `expire_due_jobs()` | `15_infrastructure.sql`: function exists; pg_cron schedule = implementation work | ✅ VALIDATED (function exists; schedule pending) |
| J5 Search | PostgreSQL FTS first layer | `05_jobs.sql:520–537`: FTS vector + GIN index; `05_jobs.sql:703–706`: pgvector HNSW | ✅ VALIDATED |
| J6 Pagination | Opaque signed cursors | Decision-07: "public API uses opaque signed/versioned cursors" — implementation detail | ✅ VALIDATED |
| J7 Visibility | published + non-deleted + non-expired | `guest.ts` apply: `WHERE status = 'published' AND (expires_at IS NULL OR expires_at > NOW()) AND deleted_at IS NULL` | ✅ VALIDATED |
| J8 Events | `job.ai.enrichment.requested` gated by G-1 | Phase 08 §10: "G-1 envelope reconciliation before producer" | ✅ VALIDATED |

---

## 4. expire_due_jobs() SQL Audit

### 4.1 Function Definition (`15_infrastructure.sql`)

**Function signature:**
```sql
CREATE OR REPLACE FUNCTION public.expire_due_jobs()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
```

### 4.2 `FOR UPDATE SKIP LOCKED` and Batch Semantics

| Aspect | Implementation | Verdict |
|--------|---------------|---------|
| Batch size | `LIMIT 100` per iteration | ✅ bounded |
| Row locking | `FOR UPDATE SKIP LOCKED` in SELECT CTE | ✅ concurrent-safe |
| Ordering | `ORDER BY j.id` | ✅ deterministic |
| Loop pattern | CTE SELECT → UPDATE → audit → notification → LOOP | ✅ correct |
| Race condition | UPDATE re-checks all WHERE conditions before transitioning | ✅ defensive double-check |
| `clock_timestamp()` | Used instead of `NOW()` for consistent time across loop | ✅ correct |

### 4.3 Expiry Transition Correctness

| Check | Implementation | Verdict |
|-------|---------------|---------|
| Only `published`/`paused` expire | `WHERE j.status IN ('published', 'paused')` | ✅ correct |
| `expires_at IS NULL` = never expires | Filter: `AND j.expires_at IS NOT NULL AND j.expires_at <= v_now` | ✅ correct |
| Terminal states untouched | SELECT only matches published/paused; closed/expired/archived excluded | ✅ correct |
| Soft-deleted excluded | `AND j.deleted_at IS NULL` | ✅ correct |
| Idempotent | Terminal `expired` state means each job transitions once | ✅ correct |
| UPDATE re-check | Same conditions in UPDATE WHERE clause | ✅ double-guard |

### 4.4 Notification Recipient and Idempotency

| Aspect | Implementation | Verdict |
|--------|---------------|---------|
| Recipient | `created_by` only (job creator) | ✅ matches EXPIRY-SQL-FINAL-DECISION-FORM recommendation |
| Idempotency key | `format('job-expired:%s:%s', v_job.id, v_job.created_by)` | ✅ deterministic per job |
| Duplicate prevention | `ON CONFLICT (idempotency_key) DO NOTHING` | ✅ correct |
| `notifications.idempotency_key` UNIQUE | `12_notifications.sql`: `idempotency_key VARCHAR(255) NOT NULL UNIQUE` | ✅ schema supports |
| Key format note | Final decision form recommended 3-part key with `expiry_date_utc`; current uses 2-part | ⚠️ MEDIUM — acceptable since each job expires once, but deviates from decision form |

### 4.5 Owner/Member/Deleted/Inactive Checks

| Check | Implementation | Verdict |
|-------|---------------|---------|
| Creator active | `u.status = 'active' AND u.deleted_at IS NULL` | ✅ correct |
| Creator company member | Owner check OR company_members active+left_at NULL | ✅ correct |
| Inactive/deleted creator | Notification skipped, expiry proceeds | ✅ matches decision form recommendation |
| Company active | `c.is_active = TRUE AND c.deleted_at IS NULL` | ✅ correct |

### 4.6 Audit Log Constraints

| Constraint | expire_due_jobs() INSERT | Verdict |
|-----------|-------------------------|---------|
| `audit_log_actor_check` (user_id XOR actor_service) | `actor_service = 'expire_due_jobs'`, `user_id` implicit NULL | ✅ satisfies |
| `audit_log_action_format` | `'job.expired'` matches `^[a-z0-9]+([._-][a-z0-9]+)*$` | ✅ correct |
| `audit_log_entity_type_nonblank` | `'job'` | ✅ correct |
| `audit_log_old/new_values_object` | Both `jsonb_build_object` outputs | ✅ correct |
| `audit_logs_immutable` trigger | `BEFORE UPDATE OR DELETE` only; INSERT not blocked | ✅ no conflict |
| `metadata` default | `jsonb_build_object('reason', 'scheduled_expiry')` | ✅ satisfies NOT NULL DEFAULT |

### 4.7 SECURITY DEFINER, search_path and Grants

| Aspect | Implementation | Verdict |
|--------|---------------|---------|
| SECURITY DEFINER | ✅ Set on function | ✅ correct |
| search_path | `SET search_path = public` | ✅ acceptable (all objects schema-qualified) |
| Baseline convention note | 15_infrastructure.sql functions use `SET search_path = pg_catalog`; this uses `public` | ⚠️ LOW — deviation from baseline convention but functionally safe since all objects are `public.*` qualified |
| REVOKE ALL FROM PUBLIC | `15_infrastructure.sql`: `REVOKE ALL ON FUNCTION public.expire_due_jobs() FROM PUBLIC;` | ✅ correct |
| GRANT to service_role | `17_rls.sql`: `GRANT EXECUTE ON FUNCTION public.expire_due_jobs() TO service_role;` | ✅ correct |
| REVOKE from anon/authenticated | `17_rls.sql`: `REVOKE EXECUTE ON FUNCTION public.expire_due_jobs() FROM anon, authenticated;` | ✅ correct |

### 4.8 `anon`/`authenticated` Denial

| Check | Evidence | Verdict |
|-------|----------|---------|
| No direct execution | `17_rls.sql`: explicit REVOKE from anon, authenticated | ✅ denied |
| service_role only | `17_rls.sql`: GRANT to service_role only | ✅ correct |
| SECURITY DEFINER defense | Even if REVOKE is bypassed, function runs as owner | ✅ defense-in-depth |

---

## 5. pg_cron Setup Gap

| Finding | Severity | Evidence |
|---------|----------|----------|
| pg_cron schedule NOT in any SQL baseline | **MEDIUM** | EXPIRY-SQL-DESIGN-DRAFT.md: "Still required before SQL: ... 4. Define function execution role, search_path, grants and pg_cron ownership." EXPIRY-SQL-FINAL-DECISION-FORM.md: "PENDING HUMAN CONFIRMATION" |
| No `SELECT cron.schedule()` anywhere | MEDIUM | Grep of all SQL files: no cron.schedule call |
| Timezone dependency | LOW | Decision-07 specifies "12:05 AM Asia/Kolkata" but no SQL verifies the database timezone or installs pg_cron extension |
| Function exists but is orphaned | MEDIUM | The function can be called manually but has no automated trigger |

**Impact:** The expiry sweeper will not run automatically in production until pg_cron is configured. This is a documented gap (not a bug), but must be resolved before production deployment.

---

## 6. Paused-Job Expiry Index Coverage

| Finding | Severity | Evidence |
|---------|----------|----------|
| `idx_jobs_expiring` only covers `published` | **MEDIUM** | `05_jobs.sql:647`: `WHERE status = 'published' AND expires_at IS NOT NULL AND deleted_at IS NULL` |
| `expire_due_jobs()` handles `published` AND `paused` | 15_infrastructure.sql: `WHERE j.status IN ('published', 'paused')` | Gap: paused jobs not indexed for expiry sweep |
| Linear scan for paused jobs | The SELECT CTE will not use the index for paused jobs; it falls back to sequential scan | Performance impact on large paused job sets |

**Recommended fix:** Add a second partial index:
```sql
CREATE INDEX idx_jobs_expiring_paused ON jobs(expires_at)
    WHERE status = 'paused' AND expires_at IS NOT NULL AND deleted_at IS NULL;
```

Or expand the existing index:
```sql
CREATE INDEX idx_jobs_expiring ON jobs(expires_at)
    WHERE status IN ('published', 'paused') AND expires_at IS NOT NULL AND deleted_at IS NULL;
```

---

## 7. Guest `expires_at` Guard

| Check | Location | Verdict |
|-------|----------|---------|
| Session active check | `guest.ts`: `AND s.expires_at > NOW() AND s.revoked_at IS NULL` | ✅ correct |
| Token hash validation | SHA-256 of header token matched against `token_hash` | ✅ correct |
| Session consumed check | `AND s.consumed_at IS NULL` | ✅ correct |
| Job expiry check (apply) | `WHERE ... AND (expires_at IS NULL OR expires_at > NOW()) AND deleted_at IS NULL` | ✅ correct |
| Session expiry before apply | Session `expires_at > NOW()` prevents expired sessions | ✅ correct |
| `status = 'active'` check | All guest queries filter `status = 'active'` | ✅ correct |

**No issues found with guest expires_at guard.**

---

## 8. API Catalog and Implementation Plan Sync

| Area | Status | Evidence |
|------|--------|----------|
| Decision-07 synced to Phase 06 | ✅ | Phase 06 §3D line 391: "J1–J8 frozen in DECISION-07" |
| Phase 08 lock-order matrix | ✅ | Phase 08 §6 line 198: "Job lifecycle: company → job → approval/history/skill/screening child rows" |
| Phase 08 event producer mapping | ✅ | Phase 08 §10: `job.ai.enrichment.requested` and `job.screening_questions.requested` mapped to jobs/ai-commands |
| API-JOB-001 still says TBD | ⚠️ LOW | Phase 06 line 400: "Method/path: TBD — company job resource and lifecycle commands". Decision-07 has frozen the routes but the catalog text hasn't been updated to reflect the frozen paths |
| API-SEARCH-001/002 still TBD | ✅ | Decision-07 §J5/J6/J7 provides direction; exact paths are implementation deliverables (correct behavior) |
| Codex review accuracy | ✅ | CODEX-FINAL-AGENT-REVIEW.md correctly identifies all gaps and recommends NO-GO until decisions frozen |

---

## 9. Decision-07 vs EXPIRY-SQL-FINAL-DECISION-FORM Alignment

| Decision-07 Says | Decision Form Says | Current SQL | Alignment |
|-------------------|-------------------|-------------|-----------|
| pg_cron daily 12:05 AM Asia/Kolkata | Schedule: PENDING HUMAN CONFIRMATION | No schedule | ✅ consistent (both acknowledge schedule is pending) |
| Creator-only notification | Recommended: job creator only | `created_by` only | ✅ aligned |
| `expires_at IS NULL` = never expires | Recommended | Filter: `expires_at IS NOT NULL AND expires_at <= v_now` | ✅ aligned |
| published/paused → expired | Recommended | `status IN ('published', 'paused')` | ✅ aligned |
| No outbox/Cloud Tasks path | Recommended: No Cloud Tasks | Function is self-contained | ✅ aligned |
| Audit/history via function | Recommended: `job_status_history` or `audit_logs` | Uses `audit_logs` | ✅ aligned (chose audit_logs) |
| Search/apply guard: `expires_at IS NULL OR expires_at > NOW()` | Implicit | Guest apply: `expires_at IS NULL OR expires_at > NOW()` | ✅ aligned |

---

## 10. Codex Cross-Review Accuracy

The CODEX-FINAL-AGENT-REVIEW.md correctly identifies:

| Codex Claim | Actual Evidence | Accuracy |
|-------------|----------------|----------|
| "SQL me job enum, lifecycle timestamps, approval columns, expiry column/index available" | `05_jobs.sql`: status, timestamps, expires_at, idx_jobs_expiring | ✅ accurate |
| "API catalog me method/path still TBD" | Phase 06 line 400: "Method/path: TBD" | ✅ accurate |
| "company_settings.job_approval_required executable schema truth" | `04_companies.sql`: column exists with DEFAULT TRUE | ✅ accurate |
| "expire_due_jobs() function/cron owner/history policy not in baseline" | Function now exists in 15_infrastructure.sql; schedule still pending | ⚠️ partially stale — function IS now in baseline |
| "No baseline job-status transition guard found" | No transition function in SQL baseline | ✅ accurate |
| "No baseline expire_due_jobs() function found" | **STALE** — function now exists in 15_infrastructure.sql | ⚠️ LOW — Codex review predates the SQL addition |

---

## 11. SQL-CONTRACT-SYNC-IMPLEMENTATION-SCOPE Accuracy

| Claim | Actual Evidence | Verdict |
|-------|----------------|---------|
| "Decide lifecycle history table vs audit_logs" | Decision made: audit_logs used in expire_due_jobs() | ✅ resolved |
| "Define approved transition function/guard" | Not yet defined (expire_due_jobs is expiry-only) | ✅ correct gap tracking |
| "Implement expire_due_jobs()" | Now exists in 15_infrastructure.sql | ✅ partially resolved (function exists, schedule pending) |
| "Add/verify correct expiry index for published and paused" | Index only covers published | ⚠️ gap not yet addressed |
| "Reconcile job-ai-enrichment-requested with Gate G-1" | Gate G-1 still open | ✅ correct |
| "No direct UPDATE jobs.status from controllers" | Correct — lifecycle commands should use transition guard | ✅ correct prohibition |

---

## 12. Detailed Findings

### 12.1 Validated Points (All Correct)

| # | Finding | Evidence | Verdict |
|---|---------|----------|---------|
| V-1 | expire_due_jobs() is SECURITY DEFINER with service_role only | 15_infra + 17_rls | ✅ VALIDATED |
| V-2 | Function uses FOR UPDATE SKIP LOCKED for concurrency | 15_infrastructure.sql function body | ✅ VALIDATED |
| V-3 | Batch size bounded at 100 | `LIMIT 100` in CTE | ✅ VALIDATED |
| V-4 | Audit log INSERT satisfies actor XOR constraint | actor_service set, user_id implicit NULL | ✅ VALIDATED |
| V-5 | Notification idempotency via UNIQUE + ON CONFLICT DO NOTHING | notifications.idempotency_key UNIQUE + INSERT | ✅ VALIDATED |
| V-6 | Inactive/deleted creator: notification skipped, expiry proceeds | IF EXISTS check with user/company/member conditions | ✅ VALIDATED |
| V-7 | Terminal states (closed/expired/archived) not affected | SELECT only matches published/paused | ✅ VALIDATED |
| V-8 | Soft-deleted jobs excluded | `deleted_at IS NULL` | ✅ VALIDATED |
| V-9 | `clock_timestamp()` for consistent loop time | Used instead of NOW() | ✅ VALIDATED |
| V-10 | Defensive double-check in UPDATE WHERE clause | Same conditions as SELECT | ✅ VALIDATED |
| V-11 | Guest session expired_at guard correct | guest.ts: `expires_at > NOW() AND revoked_at IS NULL` | ✅ VALIDATED |
| V-12 | Guest apply checks job non-expired | `expires_at IS NULL OR expires_at > NOW()` | ✅ VALIDATED |
| V-13 | Decision-07 J3 conflict resolved | "archived auto_approve_jobs is documentation only" | ✅ VALIDATED |
| V-14 | Phase 06 synced to Decision-07 | Phase 06 §3D line 391 | ✅ VALIDATED |
| V-15 | No invented tables/columns/events in any document | Cross-check all files | ✅ VALIDATED |

### 12.2 Issues Found

| ID | Severity | Finding | Evidence | Impact | Recommended Fix |
|----|----------|---------|----------|--------|-----------------|
| **M-1** | **MEDIUM** | **pg_cron schedule not configured** — expire_due_jobs() exists but has no automated trigger | No `SELECT cron.schedule()` in any SQL file; EXPIRY-SQL-DESIGN-DRAFT.md: "Still required before SQL" | Expiry sweeper will not run in production; expired jobs will accumulate | Add reviewed pg_cron schedule SQL after Decision-07/EXPIRY-SQL-FINAL-DECISION-FORM approval |
| **M-2** | **MEDIUM** | **Paused-job expiry index gap** — `idx_jobs_expiring` only covers `published`, not `paused` | `05_jobs.sql:647`: `WHERE status = 'published' AND expires_at IS NOT NULL AND deleted_at IS NULL`; expire_due_jobs() handles both published AND paused | Paused jobs with expires_at will not benefit from index; sequential scan on large paused sets | Add partial index for paused OR expand existing index to `status IN ('published', 'paused')` |
| **M-3** | **MEDIUM** | **Idempotency key format deviates from decision form** — Decision form recommends 3-part key (`job_id:recipient:expiry_date_utc`); function uses 2-part (`job_id:recipient`) | EXPIRY-SQL-FINAL-DECISION-FORM.md: "job-expired:<job_id>:<recipient_user_id>:<expiry_date_utc>"; 15_infrastructure.sql: `format('job-expired:%s:%s', v_job.id, v_job.created_by)` | Functionally correct since each job expires once, but decision form says PENDING HUMAN CONFIRMATION | Either update decision form to accept 2-part key, or add expiry_date_utc to function key |
| **L-1** | **LOW** | **search_path = public deviation from baseline convention** — 15_infrastructure.sql outbox functions use `SET search_path = pg_catalog`; expire_due_jobs() uses `SET search_path = public` | 15_infrastructure.sql: outbox functions `pg_catalog`, expire_due_jobs `public` | No functional impact (all objects are `public.*` qualified), but inconsistent with baseline convention | Change to `SET search_path = pg_catalog` and qualify all objects as `public.*` (they already are) |
| **L-2** | **LOW** | **Codex cross-review stale on expire_due_jobs()** — CODEX-FINAL-AGENT-REVIEW.md says "No baseline expire_due_jobs() function found" but function now exists | CODEX review predates SQL addition; 15_infrastructure.sql now has the function | Misleading for future readers; functionally harmless | Add note or update Codex review to acknowledge function existence |
| **L-3** | **LOW** | **API-JOB-001 path still TBD** — Decision-07 froze 11 routes but Phase 06 catalog §3D line 400 still says "Method/path: TBD" | Phase 06 line 400 vs Decision-07 §J1 | Minor documentation inconsistency; Decision-07 supersedes catalog text | Update Phase 06 §3D to reference frozen Decision-07 routes |

---

## 13. Security Review

| Area | Status | Evidence |
|------|--------|----------|
| Service credential exposure | ✅ SAFE | `expire_due_jobs` is SECURITY DEFINER; service_role credential never in function body |
| Browser role denial | ✅ SAFE | 17_rls.sql: REVOKE from anon, authenticated |
| Owner/member check | ✅ SAFE | Function checks user status, company ownership, active membership |
| Soft-delete boundary | ✅ SAFE | `deleted_at IS NULL` in SELECT and UPDATE |
| PII in audit | ✅ SAFE | No PII in audit insert — only status transitions and metadata |
| PII in notification | ✅ SAFE | Generic title/body; no PII leaked |
| Token exposure | ✅ SAFE | Guest token hashed before DB comparison |
| Storage credentials | ✅ SAFE | Guest storage uses environment config, not user input |

---

## 14. Performance Analysis

| Aspect | Assessment |
|--------|------------|
| Index coverage for published expiry | ✅ `idx_jobs_expiring` covers published jobs efficiently |
| Index coverage for paused expiry | ⚠️ No index; sequential scan |
| Batch size (100) | ✅ Reasonable for pg_cron invocation |
| Notification insert per job | ✅ Bounded by batch; UNIQUE constraint prevents duplicates |
| Audit insert per job | ✅ Append-only; no trigger overhead on INSERT |
| Concurrent sweep safety | ✅ FOR UPDATE SKIP LOCKED prevents blocking |
| Repeated sweep safety | ✅ Terminal expired state prevents re-processing |

---

## 15. Cost and Operational Analysis

| Aspect | Assessment |
|--------|------------|
| pg_cron cost | ✅ Free within Supabase (shared cron worker) |
| Notification row per expiry | ✅ Minimal storage; one row per expired job per creator |
| Audit row per expiry | ✅ Minimal storage; immutable append-only |
| No external service calls | ✅ Function is self-contained; no Cloud Tasks/Dispatcher needed |
| No outbox event for expiry | ✅ Correct — expiry is deterministic, not event-driven |

---

## 16. Final Summary

### What's Solid

- expire_due_jobs() is correctly designed with idempotency, concurrency safety, audit logging, and notification behavior
- Decision-07 is comprehensive and internally consistent
- Guest expires_at guard is correctly implemented
- Security boundaries (SECURITY DEFINER, REVOKE/GRANT, RLS) are properly enforced
- No invented tables, columns, events, or business rules
- Audit log constraints are correctly satisfied
- Notification idempotency is correctly implemented

### What Needs Fixing

1. **M-1:** Add pg_cron schedule SQL (documented gap, not a bug)
2. **M-2:** Add paused-job expiry index
3. **M-3:** Reconcile idempotency key format with decision form
4. **L-1:** Align search_path with baseline convention
5. **L-2:** Update Codex review (stale finding)
6. **L-3:** Update Phase 06 catalog text to reflect frozen routes

### Blocks

- **None for architecture approval** — all findings are implementation-level
- **Production deployment blocked by M-1** (pg_cron not configured)
- **Performance recommendation** for M-2 (paused index)

---

**Verdict: ⚠️ CONDITIONAL PASS — VALIDATED with 2 MEDIUM and 3 LOW findings**
