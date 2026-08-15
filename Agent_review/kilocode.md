# Binay Job Portal App — Independent Audit Report

**Repository**: `C:\Users\ADMIN\OneDrive\Desktop\Vishesh\Binay-Job-Portal-App`
**Audit date**: 2026-08-15
**Scope**: Full repository independent audit (no blind reliance on old `Binay-App`)
**Constraint**: Read-only audit — no files modified, generated, renamed, moved, or deleted.

---

## 1. Executive Verdict

**Safe to continue** with the current migration trajectory. The repository demonstrates mature architectural thinking, consistent documentation, and a well-structured database baseline. No critical blockers were found. The schema enforces strong integrity, the background-processing design is sound, and requirements are internally consistent. Remaining work is primarily implementation (NestJS, Dispatcher, FastAPI worker, Cloud Tasks, Next.js), not schema redesign.

---

## 2. Critical Blockers

**None found.** The database baseline (`01–18`) executes cleanly, RLS is enabled on all 82 public tables, and the documented flows are executable without schema changes.

---

## 3. High-Priority Issues

### 3.1 Missing `saved_candidates` Table vs. Approved Requirement
- **Files**:
  - `01-requirements/current/PRODUCT-REQUIREMENTS.md` (lines 220–225)
  - `02-database/README.md` (lines 127–132)
- **Evidence**: `PRODUCT-REQUIREMENTS.md` §15A explicitly lists "Recruiter saved candidates" as **PLANNED CURRENT SCOPE**. `02-database/README.md` confirms `saved_candidates` is absent from the approved `01–11` schema and flags it as an open cross-file schema item.
- **Impact**: Approved current-scope requirement has no database foundation. NestJS APIs, RLS policies, and UI cannot be built until this table is designed and migrated.
- **Classification**: Missing implementation (planned, not yet migrated)
- **Recommended correction**: Design `saved_candidates` with candidate/recruiter/company ownership, uniqueness, indexes, NestJS DTOs, and RLS as a reviewed forward migration.

---

## 4. Medium / Low Improvements

### 4.1 `candidate_search_profiles` Missing `source_profile_revision` Check Constraint
- **File**: `02-database/migrations/baseline/08_candidates.sql`
- **Evidence**: The table stores `source_profile_revision` but lacks a `CHECK (source_profile_revision > 0)` constraint similar to `application_profile_snapshots.snapshot_version`.
- **Impact**: Low. Application-level validation exists, but a DB-level guard would prevent corrupt inserts.
- **Classification**: Optional improvement

### 4.2 `referral_invitations` `opened_at` Timestamp Absent
- **File**: `02-database/migrations/baseline/09_applications.sql`
- **Evidence**: The `referral_invitation_status` enum includes `opened`, but the table has no `opened_at` column.
- **Impact**: Medium. Product requirement ("Invitation lifecycle" in `MANUAL-REFERRAL-REQUIREMENT.md`) tracks `opened` state; without a timestamp, analytics and expiry logic are weakened.
- **Classification**: Missing implementation
- **Recommended correction**: Add `opened_at TIMESTAMPTZ` with a controlled transition function, or document that `opened` is derived from delivery events only.

### 4.3 Duplicate `candidate_id` FK Path in `candidate_profile_documents`
- **File**: `02-database/migrations/baseline/08_candidates.sql` (lines 111–125)
- **Evidence**: `candidate_id` references `candidate_profiles(id)`, and `document_id` references `uploaded_documents(id)`. The composite PK `(candidate_id, document_id, document_role)` is correct, but there is no guarantee that `uploaded_documents` belongs to the same candidate.
- **Impact**: Low. NestJS enforces ownership, but a DB-level check via a trigger or application-layer invariant would strengthen defense-in-depth.
- **Classification**: Optional improvement

### 4.4 `application_status_history.from_status` Nullable but Transition Check Loose
- **File**: `02-database/migrations/baseline/09_applications.sql` (lines 113–128)
- **Evidence**: `from_status` is nullable (initial insert), and the CHECK allows `from_status IS NULL OR from_status IS DISTINCT FROM to_status`. This permits nonsensical transitions like `applied -> applied`.
- **Impact**: Low. NestJS `change_application_status()` controls transitions, but the DB constraint is weaker than it could be.
- **Classification**: Optional improvement

### 4.5 `jobs.search_vector` Trigger Not Idempotent on No-Op Updates
- **File**: `02-database/migrations/baseline/05_jobs.sql`
- **Evidence**: The `jobs_search_vector_trigger` fires on every UPDATE, even when search-relevant fields are unchanged. PostgreSQL handles this efficiently, but high-throughput job edits could cause unnecessary WAL.
- **Impact**: Low. Standard PostgreSQL FTS practice.
- **Classification**: Optional improvement

### 4.6 `02-database/README.md` Line 68 Comment Stale
- **File**: `02-database/migrations/baseline/17_rls.sql` (line 67 comment) and `02-database/README.md`
- **Evidence**: `17_rls.sql` line 67 comment says "81 business tables" but RLS is enabled on 82 tables (the 81 preceding business tables plus `platform_feedback` from `18_feedback.sql`).
- **Impact**: Cosmetic only.
- **Classification**: Inconsistency (documentation)

---

## 5. Confirmed-Correct Architecture Decisions

1. **Transactional outbox in same DB transaction as business rows** — `NestJS/FastAPI transaction + outbox_events INSERT` ensures committed work is never lost.
2. **Supabase async INSERT webhook as primary wake-up** — Decoupled, reliable, and avoids tight coupling between NestJS and Dispatcher.
3. **`FOR UPDATE SKIP LOCKED` bounded batch claim** — Prevents duplicate dispatch and allows parallel recovery.
4. **`processed_events` composite PK `(consumer_name, event_id)`** — Provides permanent idempotency at the consumer level.
5. **Stale publishing lease → dead-letter transition** — Prevents infinite reclaim loops and surfaces dispatcher failures.
6. **RLS default-deny with explicit server grants** — Browser roles start with zero privileges; `service_role` is the only elevated path.
7. **Canonical profile + active-resume evidence separation** — Resume-derived data never silently overwrites confirmed canonical facts (PD-002).
8. **Immutable application snapshots** — Submission-time state is historical truth; later profile changes do not rewrite history (PD-003).
9. **Guest upload session scoped to `job_id`** — Prevents cross-job session reuse and enforces job-level authorization.
10. **Raw tokens never stored** — `invite_token_hash`, `claim_token_hash`, and `guest_upload_sessions.token_hash` are hashed; raw values exist only in transit.

---

## 6. Missing but Planned Implementation

These are explicitly documented as pending and are **not defects**:

| Component | Status |
|---|---|
| NestJS API (`04-nestjs-api/src/`) | Guide migrated; application code pending |
| Outbox Dispatcher (`05-outbox-dispatcher-nestjs/`) | Plan ready; component code/config pending |
| Google Cloud Tasks queue/IAM config (`06-google-cloud-tasks/`) | Plan ready; IaC/deployment pending |
| FastAPI AI worker (`07-fastapi-ai-worker/`) | Old code audit pending; clean component pending |
| Next.js web (`03-nextjs-web/`) | Folder/docs/code pending |
| ADRs (`docs/adr/`) | Placeholder README only; actual ADRs pending component migration |
| Shared contracts (`contracts/api/`, `contracts/events/`, `contracts/tasks/`) | Placeholder README only; machine-readable contracts pending |
| `saved_candidates` table | Approved requirement; schema migration pending |
| Behavioral RLS/worker integration tests | Implementation pending |

---

## 7. Requirements ↔ SQL ↔ Documentation Inconsistencies

| # | Area | Requirement Source | SQL State | Documentation | Verdict |
|---|---|---|---|---|---|
| 1 | Saved candidates | `PRODUCT-REQUIREMENTS.md` §15A — PLANNED CURRENT SCOPE | Missing table | `02-database/README.md` flags as open item | Documented gap |
| 2 | Referral `opened_at` | `MANUAL-REFERRAL-REQUIREMENT.md` — `opened` in lifecycle | No `opened_at` column | `09_applications_Explanation.md` should clarify | Minor gap |
| 3 | RLS table count | `17_rls.sql` enables RLS on 82 tables | 82 tables RLS-enabled | Comment says "81 business tables" | Stale comment |
| 4 | Embedding dimension | `SEARCH-STRATEGY.md` §6 — same dimension required | `jobs.embedding vector(768)` | Consistent across all docs | Consistent |
| 5 | Active resume search | `PD-002-ACTIVE-RESUME-SEARCH.md` | `candidate_search_profiles` supports source labels | `08_candidates_Explanation.md` synchronized | Consistent |

---

## 8. Broken / Stale Links and References

### 8.1 Internal Markdown Links — Verified Correct
All root-level README links resolve:
- `README.md` → `AGENTS.md`, `PROJECT-CONTEXT-MAP.md`, `MIGRATION-PLAN-HINGLISH.md`, `MIGRATION-COVERAGE-AUDIT.md`, `docs/adr/README.md`, `docs/research/README.md`, `contracts/README.md` — **all exist**

### 8.2 Component README Links — Verified Correct
- `01-requirements/README.md` → all current/future/product-decisions files exist
- `02-database/README.md` → all 18 baseline SQL files, schema-docs, and flows exist
- `04-nestjs-api/README.md` → exists and links to `NESTJS-IMPLEMENTATION-GUIDE.md`
- `contracts/README.md` → valid navigation target

### 8.3 Cross-Repository References
- Multiple files reference `Binay-App/` as migration evidence (e.g., `MIGRATION-COVERAGE-AUDIT.md`, `02-database/README.md`). These are **intentional traceability references**, not broken links.

### 8.4 No Broken Internal Links Found
All `[← Component README](../README.md)` and `[Main project](../../README.md)` back-navigation patterns resolve correctly within the new repository structure.

---

## 9. Security / Privacy Findings

### 9.1 Secrets in Repository — NONE FOUND
- Grep for hardcoded API keys, passwords, service-role keys, and private keys returned **zero matches** in executable code or config files.
- All "secret" references are in documentation explaining that secrets must come from runtime secret managers.

### 9.2 `.gitignore` — SUFFICIENT
Covers: `.env`, `*.pem`, `*.key`, `service-account*.json`, `credentials*.json`, `secrets/`, Supabase local state, Terraform state, IDE metadata, build artifacts, and personal data directories.

### 9.3 Password Handling — CORRECT
- `02-enums.sql` defines `login_failure_reason` enum but no password columns exist in application tables.
- `03_users_auth.sql` delegates password hashing to Supabase Auth.
- `user_security_log` stores event metadata as JSONB with a CHECK constraint ensuring it is an object (no raw secrets).

### 9.4 Token Storage — CORRECT
- `guest_upload_sessions.token_hash`, `referral_invitations.invite_token_hash`, `guest_candidate_claims.claim_token_hash` — all store hashes only.
- Documentation explicitly states raw tokens must never appear in logs, analytics, or error responses.

### 9.5 RLS Default-Deny — VERIFIED
- `17_rls.sql` line 151: `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;`
- Service-only tables like `platform_feedback` (18_feedback.sql) have `REVOKE ALL` and only `service_role` grants.

### 9.6 Storage Paths vs. URLs — CORRECT
- All `*_path` columns store internal storage paths; signed URLs are generated at access time.
- `uploaded_documents.storage_path` and `storage_bucket` are never exposed directly to browsers.

---

## 10. Exact File-Wise Findings with Line Numbers

| # | File | Line(s) | Finding | Impact | Classification |
|---|---|---|---|---|---|
| 1 | `01-requirements/current/PRODUCT-REQUIREMENTS.md` | 220–225 | `saved_candidates` approved current scope | Schema missing | Missing implementation |
| 2 | `02-database/README.md` | 127–132 | Documents `saved_candidates` as open item | — | Inconsistency (documented) |
| 3 | `02-database/migrations/baseline/09_applications.sql` | 510–513 | `referral_invitation_status` enum has `opened` but table lacks `opened_at` column | Analytics gap | Missing implementation |
| 4 | `02-database/migrations/baseline/08_candidates.sql` | 111–125 | `candidate_profile_documents` FK does not verify document belongs to same candidate | Defense-in-depth gap | Optional improvement |
| 5 | `02-database/migrations/baseline/09_applications.sql` | 113–128 | `application_status_history` allows `from_status = to_status` for non-null values | Weak DB constraint | Optional improvement |
| 6 | `02-database/migrations/baseline/08_candidates.sql` | — | `candidate_search_profiles` lacks `CHECK (source_profile_revision > 0)` | Prevents corrupt inserts | Optional improvement |
| 7 | `02-database/migrations/baseline/17_rls.sql` | 67 | Comment says "81 business tables" but RLS is enabled on 82 tables (includes `platform_feedback` from 18) | Minor doc stale | Inconsistency |
| 8 | `02-database/migrations/baseline/05_jobs.sql` | 184–186 | `embedding vector(768)` hardcodes dimension; model migration requires manual schema change | Operational consideration | Design note |
| 9 | `04-nestjs-api/NESTJS-IMPLEMENTATION-GUIDE.md` | 553–559 | "Purāne guide se kya jānbūjhakār nahī̃ rakhā gayā" lists 7 corrected decisions | — | Confirmed correct |
| 10 | `docs/architecture/background-processing/BACKGROUND-WORKER-IMPLEMENTATION-PLAN-HINGLISH.md` | 588–594 | Webhook payload must not contain raw resume/sensitive data | Security boundary | Confirmed correct |

---

## 11. Recommended Fix Order

1. **Design and migrate `saved_candidates` table** — Approved current scope requirement with no schema foundation. Blocking NestJS API work.
2. **Add `opened_at` to `referral_invitations`** — Completes the invitation lifecycle tracking defined in the approved referral requirement.
3. **Verify `02-database/README.md` line 68 comment** — Update "81 business tables" to "82 public tables" for accuracy (cosmetic).
4. **Consider `candidate_search_profiles.source_profile_revision` CHECK constraint** — Low-effort defensive DB guard.
5. **Consider `application_status_history` transition CHECK refinement** — Block no-op status transitions at the DB level.
6. **Proceed with NestJS API implementation** — Schema is stable; begin with Auth/Users modules per the guide's implementation order.

---

## 12. Final Decision

**Safe to continue** with the current migration plan. The database baseline is solid, requirements are consistent, and the architecture is well-reasoned. The primary gap is the missing `saved_candidates` schema, which should be addressed before NestJS API implementation proceeds for that module. No redesign is required.
