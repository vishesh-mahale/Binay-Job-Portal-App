# Phase 09-B API Contract Freeze Worksheet — Independent Review Report

- **Agent:** Cline (independent Senior API Architect / Multi-Tenant Security reviewer)
- **Date:** 2026-08-26
- **Audit target:** `04-nestjs-api/PHASE-09-B-API-CONTRACT-FREEZE.md`
- **Mode:** Contract review only — no code written, no file modified, no path/DTO/event guessed.
- **Prior reports:** Antigravity's existing review claims `PASS — zero issues`; treated as untrusted input. Its cited "evidence" contains fabrications (documented below, F-C7) and contradicts baseline sources in ways that would mislead the freeze process.

---

## 1. Executive Verdict

```text
CONDITIONAL PASS
```

The worksheet is honest about its stage: all five contract rows stay `NEEDS_DECISION`, no path/DTO is guessed, the scope stays inside catalog §3A–§3B, no unrelated domain leaks in (`application.submitted`, notifications, jobs absent), and controller coding remains blocked pending freeze exit criteria. Several prior scope-review weaknesses were visibly repaired (AUTH-SESSION restored as its own row; rejoin-reactivates-existing-row made explicit; owner-transfer/reassignment guards mandated; outbox rule conditioned with "unapproved event emit नहीं होगा").

It does not reach PASS because four items are preconditions for the very columns the next step freezes, and leaving them unwritten invites wrong freezes: (C1) the owner/admin permission derivation is still undefined while the worksheet freezes Actor/Permission columns against it; (C2) no per-row UserContextClient/SystemClient + RLS disposition although `17_rls.sql` grants own-read policies on exactly three tables and none on company tables; (C3) the external-call-prohibition inside DB transactions — a global hard rule from the Foundation gate — is omitted from the non-negotiables list; (C4) MEMBERSHIP-COMMAND merges admin commands and self-service commands into one row, which cannot satisfy the freeze criterion for method/path/approval per capability without decomposition.

---

## 2. Sources inspected

| Source | Key verified fact used |
|---|---|
| `AGENTS.md` | No-invent/silent-conflict-ban discipline |
| `PHASE-05-FINAL-REQUIREMENTS.md` | REQ-AUTH/REQ-COMPANY current; §9 blocker #1 — per-code `error.details` schemas still open |
| `PHASE-06-API-CATALOG.md` §3A–§3B | API-AUTH-001..003, COMPANY-001..003 line-by-line (paths TBD, outbox TBD/no-invent wording) |
| `PHASE-07-ARCHITECTURE.md` | Tenant boundary, module ownership, envelope/correlation rules |
| `PHASE-08-IMPLEMENTATION-PLAN.md` | 08-B package + lock-order matrix row “Company/member deactivation” (§6 L191) |
| `PHASE-09-B-IDENTITY-COMPANIES-SCOPE.md` | Prior findings F-B1..F-B9 (this agent) used as regression checklist |
| `03_users_auth.sql` | users enum role/status, soft-delete columns, `handle_new_user()` ON CONFLICT (id) DO NOTHING (L260), security-log/session DDL, `login_history` NestJS-populated (L388–391) |
| `04_companies.sql` | owner_id FK, org hierarchy uniqueness, invited/joined/left CHECKs (L255–282), `unique_member_per_company` (L290), tenant composite FKs (L294–305) |
| `17_rls.sql` | Full policy sweep: authenticated SELECT policies exist ONLY for users/user_security_log/login_history own-read (L178–180); none on companies/company_members/branches/departments/teams/settings |
| Decision-01 | Controlled hybrid; client-boundary rule; OD-1 note |
| Decision-06 | Approved code set; CONFLICT/EXPIRED/CURSOR_INVALID banned; progress ≠ errors |

---

## 3. Row-by-row contract verification (five rows)

| Row | Catalog anchor | Path/DTO kept TBD? | Actor/permission adequacy | Verdict-as-worksheet-row |
|---|---|---|---|---|
| AUTH-BOOTSTRAP | API-AUTH-001 (+REQ-AUTH-006 OAuth; catalog: duplicate callback safe) | ✅ no guess | “verified active user” matches catalog normalization rule; idempotency cell “existing user identity” aligns with `handle_new_user` ON CONFLICT DO NOTHING (03_users_auth.sql L260) | Sound; needs provider-boundary note before freeze (Supabase Auth call outside DB txn) |
| AUTH-SESSION | API-AUTH-002 | ✅ | “authenticated user” ok | Sound restoration (prior F-B1 closed) — but lock/order + who records `login_history` must be stated at freeze |
| COMPANY-COMMAND | API-COMPANY-001 | ✅ | ❌ “owner/admin” undefined derivation → C1/F-C1 | Blocked-on-decision as designed; derivation MUST land first |
| ORG-ADMIN | API-COMPANY-002 | ✅ | same derivation dependency; acceptance line (“deactivation cannot orphan”) mirrors baseline RESTRICT semantics correctly | Same dependency |
| MEMBERSHIP-COMMAND | API-COMPANY-003 | ✅ | ⚠ mixed actors (admin cmds vs self accept/leave) in one row → C4/F-C4 | Needs method-level decomposition at freeze |

Row-level red flags checked and found clean: no invented HTTP verbs, no slugs invented, no queue/event names introduced, no `role` value beyond existing enum, no table/column suggested. Status header honest (`CONTRACT FREEZE PENDING — NO CONTROLLERS AUTHORIZED YET`) — matches reality of all-TBD rows.

---

## 4. Findings

### F-C1 — Owner/admin permission derivation still unfrozen (MEDIUM — carried from scope F-B4)

- **Exact reference:** Worksheet L20–22 actor column (“owner/admin”, “company owner/admin”); L40 exit criterion “Actor/permission matrix approved”; baseline `03_users_auth.sql` L73/118 (platform role enum) vs `04_companies.sql` L247–257 (`is_primary_hr`, nullable `permissions JSONB`, no member-role column).
- **Evidence:** No document in the chain defines how “company admin” is derived; the worksheet repeats the undefined label rather than resolving it, while its own freeze criterion demands an approved permission matrix.
- **Impact:** Frozen DTOs/guards would inherit a made-up privilege rule (invention) or mis-map platform-`admin` onto tenant administration.
- **Recommended fix:** Before populating Actor columns, freeze a minimal derivation sentence: `companies.owner_id` ⇒ full company management incl. transfer; `is_primary_hr` ⇒ member/HR administration subset; platform admin ⇒ explicit policy note; `permissions` JSONB keys unusable until a decision record freezes them.

### F-C2 — No per-row client-boundary/RLS disposition column or rule (MEDIUM — carried F-B2)

- **Exact reference:** Worksheet L7–12 cite Decision-01 generally; rows carry no read/write client class; exit criteria include no boundary item.
- **Evidence:** `17_rls.sql` L178–180 — authenticated SELECT policies exist only on users/user_security_log/login_history; zero policies on companies/company_members/branches/departments/teams/settings (policy sweep re-run this session). Decision-01 requires explicit approval to extend RLS.
- **Impact:** A profile read can legitimately freeze as UserContextClient+RLS (`users_own_read`), but any company-domain read frozen the same way returns empty sets silently or tempts authoring a new policy (ADR-required invention).
- **Recommended fix:** Add one boundary line per row + an exit-criterion item: user-profile/session reads via UserContextClient+RLS where an approved policy exists; all company/membership/org-unit reads/writes via SystemClient + same-company checks.

### F-C3 — External-call-inside-transaction prohibition missing from non-negotiables (MEDIUM)

- **Exact reference:** Worksheet L29 covers atomicity + only-approved-outbox-events; L30 bans browser→Supabase writes; nothing restates “no external call inside an open DB transaction.”
- **Evidence:** Foundation gate §5 and PHASE-04 §2 make this a hard global rule; AUTH-BOOTSTRAP/AUTH-SESSION necessarily touch Supabase Auth provider calls, making it row-relevant immediately rather than generic boilerplate.
- **Impact:** Freezing transaction semantics for the AUTH rows without this constraint could legitimize provider calls inside BEGIN…COMMIT during implementation.
- **Recommended fix:** Add a bullet to §Non-negotiable contract rules: external Auth/provider/email/network calls occur strictly after commit, never inside the DB transaction.

### F-C4 — MEMBERSHIP-COMMAND merges two actor classes into one contract row (MINOR-MEDIUM)

- **Exact reference:** Worksheet L22 (“invite/add/accept/deactivate/leave/rejoin … owner/admin **or invited user** as applicable”) with single path/method/idempotency cells.
- **Evidence:** Catalog COMPANY-003 keeps one entry but behaviors differ; baseline semantics per action: invite creates inactive row (`is_active=false`, L255), accept flips active+joined_at (`company_members_active_joined` L277–279), leave writes `left_at` subject to `company_members_left_inactive` (L280–282), deactivate is admin-side with mandatory reassignment guard (worksheet L33).
- **Impact:** One row cannot satisfy “approved method/path” plus deterministic per-action idempotency without implicit sub-contracts (e.g., repeat-accept → success vs duplicate-invite semantics).
- **Recommended fix:** At freeze time either split into MEMBERSHIP-ADMIN / MEMBERSHIP-SELF rows or require an embedded action×method×path×actor×idempotency matrix inside this family before its criterion can pass.

### F-C5 — Audit destination unnamed; no catalog traceability column (MINOR — carried F-B5)

- **Exact reference:** Worksheet L29 (“audit/history”); table lacks back-references to API-AUTH-/COMPANY- IDs; no traceability exit item.
- **Evidence:** Approved destinations exist: `audit_logs` (13_analytics.sql L173–195: company_id/target_user_id/request_id/trace_id; comments list 'company.updated','permission.changed'), append-only `user_security_log`, `login_history` populated by NestJS (03_users_auth.sql L388–391).
- **Impact:** The exit criterion “Transaction/audit/outbox disposition explicit” cannot be objectively verified while the destination stays abstract.
- **Recommended fix:** Per-row AuditDestination mapping line + Catalog-ID column + default OutboxDisposition cell `none-today (G-1 gated)`.

### F-C6 — Freeze-completeness hardening bundle (INFO/MINOR)

- Lock-order pointer for org/membership mutations (PHASE-08 §6 company row L191) absent from rules/tests linkage.
- No per-row Errors cell with pre-approved Decision-06 codes (CONFLICT/EXPIRED/CURSOR_INVALID stay banned).
- AUTH-BOOTSTRAP needs a note that status→active flows only through verified verification path (PHASE-04 §3); recovery-permission stays TBD.
- Rejoin/invite-repeat determinism wording (prior F-B6) should live inside the MEMBERSHIP cells.

### F-C7 — Prior review accuracy conflict (process finding, MINOR, report-level)

- **Exact reference:** `antigravity-contract-review.md` §3 vs actual worksheet lines.
- **Evidence:** Cites nonexistent numbered sections (“Section 16/26/29/31/32/33”) for what are unnumbered bullets (L16–33); asserts a fabricated uniform-404 anti-enumeration rule present nowhere in the worksheet or any approved source; claims envelope includes `error.details` although PHASE-05 §9 leaves details schemas explicitly open; marks items ✅ that the worksheet itself defers.
- **Impact:** Downstream agents may treat invented behavior (404 policy, details schema) as established precedent — the AGENTS.md-prohibited failure mode.
- **Recommended fix:** Do not propagate antigravity citations into freeze decisions; treat primary sources + line-level evidence as the only inputs. Documented here as conflict, not silently adopted.

---

## 5. Positive verifications

1. **No invention** — every TBD preserved; zero verbs, slugs, event names, queues or statuses invented; role references match the existing `candidate|employer|hr|admin` enum only.
2. **Scope hygiene** — no `application.submitted`, notification, job or candidate capability appears anywhere in the worksheet (string-level confirmed).
3. **Rejoin policy explicit and correct** — “existing membership row reactivate” matches `unique_member_per_company` (04_companies.sql L290) reality; no orphan duplicate rows by construction.
4. **Owner-transfer/deactivation + reassignment guards mandatory** — aligns with the RESTRICT-FK-bypass-by-soft-delete analysis; consistent with PHASE-08 lock-order company row.
5. **Server-side derivation rule** — L26 blocks client-supplied tenant IDs/ownership claims, matching API-AUTH-003 acceptance (“cross-user/cross-company access fails closed”).
6. **Error routing via Decision-06** — no new public codes introduced anywhere.
7. **Status honesty** — header (`CONTRACT FREEZE PENDING — NO CONTROLLERS AUTHORIZED YET`) and closing line keep coding blocked until rows resolve; gate discipline intact.
8. **AUTH-SESSION row restoration** closes prior silent-descope finding F-B1 at the worksheet level.

---

## 6. Final Verdict

```text
VERDICT: CONDITIONAL PASS

Close these four conditions while populating / before freeze sign-off:
  C1 (F-C1)  Freeze owner/admin derivation rule
             (owner_id | is_primary_hr | platform-admin boundary;
              permissions JSONB keys gated behind a decision record)
  C2 (F-C2)  Add per-row UserContextClient/SystemClient + RLS disposition
             (company tables have NO approved 17_rls policies today)
  C3 (F-C3)  Restate "no external call inside DB transaction" in
             non-negotiables — directly relevant to both AUTH rows
  C4 (F-C4)  Decompose MEMBERSHIP-COMMAND into per-action
             method/actor/idempotency matrix (or split ADMIN/SELF rows)

RECOMMENDED: F-C5 audit destination + catalog-ID traceability columns;
F-C6 error-code cells, lock-order pointer, bootstrap status-transition note,
rejoin determinism wording; F-C7 never inherit antigravity's fabricated citations.

BOUNDARY CONFIRMED: no code written, no source/plan modified, unrelated domains kept out;
the worksheet's PENDING/no-controllers posture is correct as-is and endorsed.
```

Har finding ke saath severity, exact source/file/section reference, evidence, impact aur recommended fix ऊपर शामिल है। Requirement/SQL/decision conflicts silently resolve नहीं किए गए — F-C7 exact conflict के रूप में documented है।


