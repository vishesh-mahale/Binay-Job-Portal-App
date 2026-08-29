# Phase 09-B Identity/Companies Scope — Independent Review Report

- **Agent:** Cline (independent Senior NestJS / PostgreSQL / multi-tenant security reviewer)
- **Date:** 2026-08-26
- **Audit target:** `04-nestjs-api/PHASE-09-B-IDENTITY-COMPANIES-SCOPE.md`
- **Mode:** Scope review only — no code written, no file modified, no paths/tables/events invented.
- **Prior agent reports:** none exist yet for this slice; every claim below verified directly against PHASE-05/06/07/08, SQL baseline 03/04/13/17 and Decisions 01/06.

---

## 1. Executive Verdict

```text
CONDITIONAL PASS
```

The scope is faithful to its inputs in structure: use cases map to catalog §3A/§3B entries, all named tables/functions exist in baseline 03–04, lock-order citation is now accurate against the updated Phase-08 matrix row (companies, `PHASE-08` §6 L191), idempotency stays constraints-based, exclusions prevent creep, and no invented path/event/role appears anywhere in the document.

Verdict is CONDITIONAL PASS because four material ambiguities would each force an implementer into either silent invention or wrong behavior at authorization time: (F-B4) "Owner/admin" permission derivation has no frozen source in the baseline; (F-B2) the RLS claim exceeds the approved policy surface; (F-B3) the outbox sentence implies events that do not exist today; (F-B1) session/security operations from API-AUTH-002 are dropped without an exclusion note. All four are fixable as scope-document clarifications before DTO/contract freeze — none requires new upstream decisions beyond explicitly deferring to existing gates.

---

## 2. Sources inspected

| Source | Result |
|---|---|
| `AGENTS.md` | No-invent/conflict rules applied |
| `PHASE-05-FINAL-REQUIREMENTS.md` | REQ-AUTH-001..007 + REQ-COMPANY-001..005 confirmed current (L55–56) |
| `PHASE-06-API-CATALOG.md` §3A/§3B | API-PLATFORM/AUTH-001..003/COMPANY-001..003 read line-by-line |
| `PHASE-07-ARCHITECTURE.md` | Client separation §5, tenant boundary reconfirmed |
| `PHASE-08-IMPLEMENTATION-PLAN.md` | §4 08-B package (L97–120) + §6 matrix incl. updated `Company/member deactivation` row (L191) |
| `03_users_auth.sql` (full) | users/role/status/deleted_at/locked_until, handle_new_user, hard-delete ban trigger, sessions/security-log/login-history DDL |
| `04_companies.sql` (full) | companies/company_branches/departments/teams/company_members/company_settings + composite tenant FKs + uniqueness set |
| `13_analytics.sql` (targeted) | `audit_logs` destination table (L173–195) |
| `17_rls.sql` (policy sweep) | Full CREATE POLICY inventory |
| Decision-01 / Decision-06 | Access model boundaries; error vocabulary mapping check |

---

## 3. Fourteen-point verification results

| # | Verification point | Result |
|---|---|---|
| 1 | User/account authorization rules | ✅ faithful (bootstrap/status/ownership checks); gaps → F-B1 |
| 2 | Company ownership & membership permissions | ⚠ derivation rule undefined → F-B4 |
| 3 | Cross-company read/write isolation | ✅ strong: composite tenant FKs `(branch_id,company_id)` `(department_id,company_id)` `(manager_member_id,company_id)` make cross-tenant assignment DB-impossible (`04_companies.sql` L294–305); tests required |
| 4 | Branch/department/team relationships | ✅ hierarchy + `unique_*_per_company/department`, HQ partial unique (L378), member team-requires-department CHECK (L283) |
| 5 | Invite/accept/deactivate/leave/rejoin | ✅ single-row policy via `unique_member_per_company` (L290), invite-inactive default (L255), joined/left CHECKs (L277–282); minor gap → F-B6 |
| 6 | Owner/admin role & status protections | ⚠ see F-B4; status transitions rely on NestJS (no DB guard on status column) → F-B7 test note |
| 7 | Manager/lead/head reassignment rules | ✅ correctly mandated pre-deactivation (L44): soft deactivation bypasses RESTRICT FKs, so only NestJS can enforce dangling-reference prevention; matrix owner present |
| 8 | UserContextClient/SystemClient + RLS boundary | ⚠ overbroad RLS surface → F-B2 |
| 9 | Transaction/audit/outbox requirements | ⚠ outbox ambiguity + unnamed audit destination → F-B3/F-B5 |
| 10 | Deterministic lock ordering | ✅ citation accurate (matrix L191 exists post-update); INFO nuance F-B8 |
| 11 | SQL tables/constraints/functions mapping | ✅ all 9 listed tables exist; ❌ `login_history` omitted from data list → F-B1b |
| 12 | Idempotency expectations | ✅ constraints/approved domain keys only; generic in-memory banned — matches Foundation gate exactly |
| 13 | Required security/concurrency/rollback tests | ✅ comprehensive list; additive suggestions → F-B7 |
| 14 | Exclusions / no scope creep / nothing invented | ✅ clean — TBD paths kept, no event/queue/provider names, direct browser writes banned |

---

## 4. Findings

### F-B4 — "Owner/admin" company-management permission has no frozen derivation source (MEDIUM)

- **Exact reference:** Scope L25 (“Owner/admin role/status/deactivation safeguards”), L24, vs baseline reality.
- **Evidence:** `03_users_auth.sql` L73/118 — `users.role` enum is `candidate|employer|hr|admin` (platform-level). `04_companies.sql` L234–306 `company_members` has **no role column**; only nullable `permissions JSONB` (L250, “nullable = inherit from user roles”) and `is_primary_hr BOOLEAN` (L247). No approved document freezes which JSONB keys exist or how “company admin” is derived.
- **Impact:** Every guard decision in this slice (who may create branches, invite members, deactivate) depends on this rule. As written, implementers must either invent a permission-key vocabulary (invention → AGENTS.md violation) or misapply platform-`admin` to tenant administration (privilege-model bug).
- **Recommended fix (scope-text level, no new table/column):** Freeze the minimal faithful derivation: `companies.owner_id = user.id` ⇒ full company management; platform `role='admin'` ⇒ per PHASE-04/policy note; company-level administrative acts otherwise require explicit membership capability that the current schema can express today via `is_primary_hr` for member-administration subset; `permissions JSONB` keys remain unusable until a decision record freezes the key set. Add this paragraph to scope §Security criteria and mirror it in the owner/admin matrix tests.

### F-B2 — RLS claim broader than the approved policy surface (MEDIUM)

- **Exact reference:** Scope L32 (“User-facing personal/catalog reads के लिए verified user context और RLS boundary use होगी”).
- **Evidence:** Full `17_rls.sql` policy sweep shows approved authenticated SELECT policies exist ONLY for `users_own_read` (L178), `security_log_own_read` (L179), `login_history_own_read` (L180). **No SELECT policy exists on** `companies`, `company_branches`, `departments`, `teams`, `company_members`, `company_settings`. Decision-01 allows expanding read paths only after explicit policies + dual-path tests.
- **Impact:** Implementers could route company/member catalog reads through `UserContextClient` — with no policy, RLS silently returns zero rows (fail-closed but broken feature); or worse, author a new policy (invention requiring ADR).
- **Recommended fix:** Scope must pin the exact split: UserContextClient+RLS limited to the three own-read tables above; ALL company/membership/org-unit reads go through `SystemClient` + NestJS same-company authorization checks (Decision-01 hybrid), with a note that any future company-side RLS policy requires its own decision record.

### F-B3 — Outbox sentence implies events that do not exist for this domain (MEDIUM)

- **Exact reference:** Scope L34 (“…business row, required history/audit और approved outbox event एक ही transaction में होंगे”).
- **Evidence:** Catalog §3A/§3B explicitly mark outboxes `TBD` / “no event invented” / “invitation event only after approved contract”; dispatcher registry contains **zero** user/company routes; Gate G-1/G-5 fail-closed discipline stands.
- **Impact:** The absolute phrasing makes “one transaction including an event” sound mandatory per write — pushing toward inventing e.g. `user.created`/`member.invited`, or making acceptance unfulfillable when correctly emitting nothing.
- **Recommended fix:** Reword to conditional form: history/audit rows are always atomic; an outbox row is written **only where an approved contract exists — today none exists for identity/company domains, so no event is emitted in this slice** until G-1 closes with an approved contract.

### F-B1 — Session/security operations (API-AUTH-002) silently dropped from included use cases (MEDIUM)

- **Exact reference:** Scope L17–26 use-case list; contrast `PHASE-08` §4 L106 (“Session/security operations and protected-request context”).
- **Evidence:** 09-B lists bootstrap/profile-read and status/role checks, but no use case owns logout/session-tracking revocation, security-log events, password/email-change audit flows (API-AUTH-002: REQ-AUTH-001/003/004). `user_security_log`/`user_sessions` appear in the data list without an owning use case, and **`login_history` is missing from the data list entirely** (`03_users_auth.sql` L394–400 defines it as NestJS-populated; `17_rls.sql` L180 grants own-read).
- **Impact:** A catalogued authorized API disappears from the slice without appearing in the exclusions list either — exactly the silent-descope pattern AGENTS.md prohibits; requirement coverage exit criterion becomes unverifiable.
- **Recommended fix:** Either add use case 1b mirroring API-AUTH-002 (session/security operations incl. login_history recording on auth transitions within this slice's boundaries), or move API-AUTH-002 explicitly into §Exclusions with the owning slice named and the omission visible to reviewers.

### F-B5 — Approved audit/history destination unnamed for company-domain writes (MINOR)

- **Exact reference:** Scope L31 (“…और उनके approved audit/history mechanisms”), L34.
- **Evidence:** `04_companies.sql` contains **no** company history/audit table (only `updated_at` triggers); the approved tenant-aware destination is `audit_logs` (`13_analytics.sql` L173–195: `company_id`, `user_id`, `target_user_id`, `request_id`, `trace_id`, `action`, `entity_type/id` — comments list `'company.updated'`, `'permission.changed'`). User-domain audit = append-only `user_security_log` (+ immutability triggers per file header).
- **Impact:** Without naming it, an implementer may conclude a new history table must be invented (banned) or that “history” has no concrete target and skip durable audit rows.
- **Recommended fix:** Add one mapping line to §Data rules: membership/company/org-unit mutations append `audit_logs` rows in-transaction (actor, target, request/trace ids); user security transitions append `user_security_log`; login attempts → `login_history`.

### F-B6 — Repeat-invite semantics unspecified on existing inactive row (MINOR)

- **Exact reference:** Scope L23 use case 5; catalog COMPANY-003 idempotency line (“repeated invite … safe and deterministic”).
- **Evidence:** Baseline yields one row per `(company_id,user_id)` (L290) with `is_active=false` at invite (L255). Scope doesn't say whether re-invite updates `invited_at/invited_by` or no-ops.
- **Recommended fix:** One sentence: re-invite on pending row refreshes invitation metadata atomically + audits; re-invite on active member is a no-op error-free response. No schema change implied.

### F-B7 — Account-status transition matrix test not explicit (MINOR)

- **Exact reference:** Scope tests L48–57.
- **Evidence:** No DB trigger guards `users.status` transitions; PHASE-04 §3 fixes boundaries (pending_verification→active only via verified flow; suspended/deactivated/banned→active requires authorized recovery policy marked TBD).
- **Recommended fix:** Add test item: illegal status jumps fail closed with approved envelope incl. the recovery-permission-TBD path; plus `users_no_hard_delete` denial assertion (L305–327) in negative tests.

### F-B8 / F-B9 — INFO notes (non-blocking)

- **F-B8:** Lock-order citation is accurate for deactivation family (matrix row exists); branch/dept/team CREATE/UPDATE commands are not literally inside that row — matrix preamble (parent→child, stable UUID) covers them naturally. Optional: one clarifying clause in scope §Data rules.
- **F-B9:** REQ-ONBOARDING-001 appears in authoritative inputs (L9) but belongs to the candidate/onboarding slice (PHASE-08-C). Mark explicitly as “deferred to candidate slice” to prevent confusion.

---

## 5. Positive verifications

1. **Every named table/constraint genuinely exists** — all 9 tables confirmed in 03/04; uniqueness set (`slug`, `unique_member_per_company`, employee-code/work-email) matches scope claims exactly.
2. **Cross-company isolation is defense-in-depth real** — composite tenant FKs make wrong-tenant child assignments physically impossible; not merely guard-level.
3. **Reassignment-before-deactivation requirement is technically necessary, not decorative** — soft `is_active=false` bypasses RESTRICT FKs, so scope L44 is the only protection against dangling head/lead/manager references; correctly placed with lock order + rollback tests.
4. **No invention anywhere in the doc** — paths stay TBD, event list empty, provider slots untouched, roles reference existing enum values only.
5. **Idempotency posture matches the Foundation gate** verbatim (constraints/approved domain keys; generic store banned).
6. **Error vocabulary** used in criteria maps cleanly onto Decision-06 codes already exercised by Foundation filter.

---

## 6. Final Verdict

```text
VERDICT: CONDITIONAL PASS

Upgrade to PASS once these four scope-text conditions close (no code required):
  F-B4  Freeze minimal company-management permission derivation
        (owner_id / is_primary_hr / platform-admin boundaries;
         permissions JSONB keys gated behind a decision record)
  F-B2  Pin exact RLS vs SystemClient read split per approved 17_rls policies
  F-B3  Reword outbox rule to conditional ("emit nothing today; G-1-gated")
  F-B1  Restore API-AUTH-002 session/security operations into include-or-exclude

RECOMMENDED additions (non-blocking): F-B5 audit_logs mapping sentence,
F-B6 repeat-invite determinism, F-B7 status-transition + hard-delete-denial tests,
F-B8/F-B9 wording notes.

BOUNDARY CONFIRMED: review limited to this scope document; no business code written,
no catalog/plan/SQL modified. Nothing outside authorized Phase 09-B inputs was assumed.
```

Har finding के लिए severity, exact file/section, evidence, impact और fix ऊपर शामिल हैं; कोई भी conflict silently resolve नहीं किया गया।

