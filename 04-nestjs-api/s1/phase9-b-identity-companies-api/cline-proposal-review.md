# Phase 09-B API Contract Proposal — Independent Review Report

- **Agent:** Cline (independent Senior API Architect / Multi-Tenant Security reviewer)
- **Date:** 2026-08-26
- **Audit target:** `04-nestjs-api/PHASE-09-B-API-CONTRACT-PROPOSAL.md`
- **Posture honored:** Review of a *proposal* — no proposed path/method/actor/DTO treated as approved; verdict below endorses only evidence-backed directions. No code or file modified.
- **Prior reviews:** My own chain used as regression checklist (scope F-B1..B9, worksheet C1..C7); antigravity artifacts not relied upon (fabrication conflict recorded in worksheet review F-C7 stands).

---

## 1. Executive Verdict

```text
PASS WITH MINOR FIXES
```

This proposal improves materially over the worksheet: the two most dangerous invention traps are self-declared rather than hidden — `MEMBERSHIP-ACCEPT` is explicitly `NEEDS SOURCE/DECISION` (no invitation table/artifact exists in the baseline), and decision item #2 concedes that no universal “eligible user” company-creation rule exists in any source. Every hazardous area from prior reviews (owner/admin derivation, invitation source, rejoin-row policy, server-side tenant derivation) is either reflected as an open decision or expressed within evidence-backed bounds. All 14 rows stay non-frozen and controller coding stays blocked by the document's own closing rule.

It earns `PASS WITH MINOR FIXES` rather than `PASS` because six documentation-grade gaps remain before this can responsibly become the freeze basis: (P1) session revoke lacks semantics AND `user_sessions` has no approved RLS policy — unmanaged, this row fails closed invisibly or tempts a banned policy; (P2) no per-row UserContextClient/SystemClient declaration although company-family tables have zero `17_rls.sql` policies; (P3) row→catalog-ID traceability absent, leaving `AUTH-ME` (a genuinely new route) without an anchor; plus wording/decision-list additions (P4–P6) and the carried global-rule restatements. None invalidates the proposed layout itself.

---

## 2. Row-by-row verification (all 14 rows)

| Row | Evidence anchor | Independent result |
|---|---|---|
| AUTH-BOOTSTRAP `POST /auth/bootstrap` | API-AUTH-001 (“signup/callback boundary … confirmed with Supabase Auth”; duplicate callback safe); `handle_new_user()` ON CONFLICT (id) DO NOTHING (`03_users_auth.sql` L260) | ✅ direction valid; decision #1 (needed-or-not) is the right open question; idempotency via provider-subject uniqueness matches baseline |
| AUTH-ME `GET /auth/me` | Scope use-case 1 (“Authenticated user bootstrap/profile read”); API-AUTH-001 response (“safe public user/account summary”) | ⚠ no §3A browser-route entry exists → requires explicit catalog-ID citation at freeze (P3); otherwise supported |
| AUTH-SESSION `GET /auth/sessions`, `POST /auth/sessions/revoke` | API-AUTH-002; `user_sessions` DDL L335–348 | ⚠ file comment L333: `user_sessions` tracks WebSocket presence, "**NOT for auth sessions (Supabase Auth handles those)**" — revoke semantics undecided (P1); no RLS policy on this table (`17_rls.sql` sweep L178–180 = only users/security_log/login_history own-read) (P1/P2) |
| COMPANY-CREATE `POST /companies` | REQ-COMPANY-001; `companies.owner_id` FK L80; `slug` CITEXT UNIQUE L47 | ✅ sound; actor eligibility genuinely undefined → decision #2 correct; slug-duplicate error mapping undefined (P8) |
| COMPANY-READ `GET /companies/:companyId` | API-COMPANY-001 reads | ⚠ zero RLS policies on `companies` → must be SystemClient + active-membership check (P2); member-vs-admin read visibility split unaddressed (minor) |
| COMPANY-UPDATE `PATCH /companies/:companyId` | API-COMPANY-001 acceptance “unsafe owner/status changes fail closed” | ⚠ PATCH scope vs `verification_status/verified_at` unstated (P7); unsafe-field protection should be named |
| ORG-BRANCH / ORG-DEPARTMENT / ORG-TEAM | API-COMPANY-002; branches L143–170, departments L183–196, teams L208–226; team-requires-department CHECK L283–285; RESTRICT head/lead FKs L313–321 | ✅ shapes fit baseline; `?` dual-row notation honestly declared non-runtime (L26); owner/admin dependency on decision #2 throughout |
| MEMBERSHIP-INVITE `POST /companies/:id/members` | API-COMPANY-003; `unique_member_per_company` L290; `invited_at/by` L256–257 | ⚠ **baseline allows inviting only EXISTING `users` rows** (`user_id NOT NULL REFERENCES users(id)` L237) — external-email invitations impossible without new artifact (supports decision #3; freeze must scope invite to existing users) |
| MEMBERSHIP-ACCEPT `…/:invitationId/accept` | none — no invitation table/token/id concept anywhere | ✅ correctly `NEEDS SOURCE/DECISION`; minimal faithful option identified (see P4 recommendation) instead of inventing an artifact |
| MEMBERSHIP-DEACTIVATE `POST …/members/:memberId/deactivate` | worksheet L33 guard; L280–282 CHECKs; RESTRICT-FK-bypass analysis | ✅ aligns; reassignment-before-deactivation inherited correctly |
| MEMBERSHIP-LEAVE `POST …/membership/leave` | scope L44 includes leave in reassignment rule | ⚠ owner-self-leave / last-admin protection unspecified → add decision (P5) |
| MEMBERSHIP-REJOIN `POST …/membership/rejoin` | worksheet rule “reactivate existing row”; `unique_member_per_company` L290 | ⚠ approver semantics silent (self vs admin) → add decision (P6); `active_joined` CHECK L277–279 permits reactivation cleanly |

No row introduces an invented table, event, queue, provider, role value or permission model. No unrelated domain (`application.submitted`, notifications, jobs, candidates) appears anywhere. The `?` notation is explicitly not a runtime path.

---

## 3. Findings

### P1 — Session revoke semantics + absent RLS policy on `user_sessions` (MEDIUM)

- **Source/file/section:** Proposal L13 (`AUTH-SESSION`) and decision #5 (granularity only); `03_users_auth.sql` L330–364; `17_rls.sql` L178–180 policy sweep.
- **Evidence:** Baseline defines `user_sessions` as realtime-presence tracking and states verbatim it is NOT for auth sessions — Supabase Auth owns those. No authenticated SELECT/UPDATE policy exists on `user_sessions`; only `users`, `user_security_log`, `login_history` have own-read policies.
- **Impact:** “Revoke” could freeze as (a) presence-row deactivation — safe but not a security logout — or (b) an implied Supabase token-kill/blacklist mechanism no approved object implements. Reading via UserContextClient would silently return nothing (no RLS), pushing implementers toward authoring a new policy (Decision-01 requires ADR) or misusing SystemClient without stated ownership checks.
- **Recommended resolution:** At freeze state: revoke = lifecycle update of NestJS-tracked session rows via SystemClient with strict ownership validation, plus (if token-level termination is required) an explicit Supabase AuthProvider call strictly outside the DB transaction as its own approved capability; declare per-row client class.

### P2 — Per-row client-boundary declarations still missing (MEDIUM — carried C2/F-B2)

- **Source/file/section:** Proposal L28–34 DTO rules; all company-family rows.
- **Evidence:** `17_rls.sql` grants authenticated policies on exactly three user-domain tables; none on companies/company_members/branches/departments/teams/settings.
- **Impact:** Without per-row boundary text, reviewers cannot tell which rows intend RLS reads vs SystemClient+checks; silent empty results or ADR-bypassing policies become likely.
- **Recommended resolution:** Add Client/RLS column: AUTH-ME → UserContextClient+RLS (`users_own_read`); AUTH-SESSION → SystemClient+ownership pending any approved expansion; ALL COMPANY-/ORG-/MEMBERSHIP- rows → SystemClient + same-company authorization.

### P3 — Catalog-ID traceability absent; `AUTH-ME` unanchored (MINOR-MEDIUM)

- **Source/file/section:** Proposal L9–24 table; carried worksheet condition F-C5.
- **Evidence:** Rows cite neither API-AUTH-001..003 / COMPANY-001..003 nor REQ IDs; §3A contains no standalone current-user browser route.
- **Impact:** AGENTS.md traceability duty unverifiable at freeze; AUTH-ME risks being read as an invented endpoint rather than scope-use-case-1 realization.
- **Recommended resolution:** Add Catalog-ID + Requirement-ID columns; anchor AUTH-ME to scope use case 1 explicitly.

### P4 — `MEMBERSHIP-ACCEPT`: choose minimal-faithful design over artifact invention (MEDIUM, direction guidance)

- **Source/file/section:** Proposal L21 (`NEEDS SOURCE/DECISION`) + decision #3; baseline has no invitation table/token/id — only `invited_at`/`invited_by` on `company_members`.
- **Evidence:** A source-faithful accept exists WITHOUT new tables: `POST /companies/:companyId/membership/accept` where the server matches `auth.uid()` to the caller's own `is_active=false AND joined_at IS NULL` row, sets active/joined atomically and audits. Path `/membership-invitations/:invitationId/…` presumes an artifact that is itself an invention unless a decision creates it.
- **Impact:** Freezing invitation-ID paths prematurely bakes in unsupported infrastructure.
- **Recommended resolution:** Record both alternatives at freeze: (A) zero-artifact self-accept on membership row [recommended default]; (B) separate invitation-table flow → requires approved forward migration AND a G-1-gated event contract if invitations must reach never-signed-up emails.

### P5 — Owner self-leave / last-admin protection unspecified (MINOR)

- **Source/file/section:** Proposal L23 actor “active member”; baseline silence (owner_id ≠ membership row; nothing prevents sole admin leaving).
- **Impact:** A company can be left operationally orphaned through a legitimate-looking command; recovery undefined.
- **Recommended resolution:** Add a decisions-list item: owner/sole-administrator leave/deactivate requires prior transfer or another eligible admin (ties into decision #2 derivation).

### P6 — Rejoin approval semantics undefined (MINOR)

- **Source/file/section:** Proposal L24; scope L23 fixes only the existing-row policy.
- **Evidence:** Mechanical reactivation is CHECK-compatible (`active_joined` satisfied via persisted `joined_at`); instant-self vs admin-approved rejoin is nowhere fixed.
- **Recommended resolution:** Sub-decision under #2/#3; also state whether original `joined_at` is preserved (audit-affecting).

### P7 — PATCH field-scope guard for verification fields unstated (MINOR)

- **Source/file/section:** Proposal L16 (COMPANY-UPDATE); `04_companies.sql` L81–83 verification columns.
- **Impact:** Owner/admin PATCH might include verification self-service — privilege escalation no catalog line grants.
- **Recommended resolution:** Freeze explicitly: verification fields excluded from member/owner PATCH; platform/admin flow stays separate NEEDS_DECISION.

### P8 — Error-code mappings for domain duplicates undecided (MINOR)

- **Source/file/section:** Proposal L33–34; Decision-06 mapping rule; baseline uniques (slug L47; member/code/email L290–292).
- **Impact:** Freeze hits duplicate collisions without a pre-approved public code — ad-hoc code creation risk violating D06 (CONFLICT itself banned).
- **Recommended resolution:** Decision item mapping each duplicate class to VALIDATION_ERROR-with-message vs formal change request for a dedicated code; cite the Foundation envelope implementation in the freeze doc.

### P9 — Carried global rules not restated (MINOR bundle)

- External-call-inside-transaction ban (immediately relevant to bootstrap/callback); audit destination naming (`audit_logs` / append-only `user_security_log` / `login_history`); PHASE-08 §6 lock-order pointer; per-row Errors cells. All additive wording carried from worksheet conditions.

---

## 4. Positive verifications

1. **Honest self-declaration of traps** — decision items #1–#5 match this reviewer chain's independent findings (eligible-user void, invitation-source void, ORG shape choice, revoke granularity) instead of papering over them.
2. **MEMBERSHIP-ACCEPT isolated** as NEEDS SOURCE/DECISION — highest invention-risk row correctly withheld from PROPOSED status.
3. **No unrelated-domain leakage** — string-level check clean for applications/notifications/jobs/candidates across the document.
4. **Server-side derivation retained** (L30: user_id/actor-role/company distrust) consistent with API-AUTH-003 acceptance rules.
5. **DTO discipline sentence** (L31, SQL-fields-only) prevents speculative request shapes pre-freeze.
6. **No generic idempotency store** — matches Foundation gate language exactly (L34).
7. **`?` notation declared non-runtime** (L26) — avoids accidental route registration.
8. **Closing gate intact** — controllers stay unauthorized until five decisions close.

---

## 5. Final Verdict

```text
VERDICT: PASS WITH MINOR FIXES

The proposal may proceed toward freeze after these documentation-level fixes
(all same-document edits; none alter the proposed endpoint layout):
  P1  Session-revoke semantics declared (presence rows vs Supabase token kill)
      + client class for session rows (user_sessions has NO RLS policy today)
  P2  Per-row UserContextClient/SystemClient + RLS applicability column
      (company-family tables have NO approved policies — all SystemClient)
  P3  Catalog-ID / Requirement-ID traceability columns incl. AUTH-ME anchor
  P4  MEMBERSHIP-ACCEPT resolved via the minimal zero-artifact option recorded;
      invitation-artifact path only via approved forward migration + G-1 gate
  P5  Owner/last-admin leave protection added to decisions list
  P6  Rejoin approver semantics added; joined_at preservation policy noted
  P7  Verification fields explicitly excluded from owner/admin PATCH
  P8  Domain-duplicate error mappings decided per Decision-06 pathway
  P9  Restate carried rules: external-call-in-txn ban, audit destinations,
      lock-order pointer, per-row error-code cells

After these land, a fresh independent review can approve the FROZEN contract;
until then this document remains PROPOSAL — NOT FROZEN, exactly as its header states.
```

Har finding ke saath severity, exact source/file/section reference, evidence, impact aur recommended resolution शामिल है। कोई भी proposed path/method/actor/DTO automatically approved नहीं किया गया; source-silent areas `NEEDS_DECISION` के रूप में ही documented किए गए हैं। कोई invented table/event/invitation-source/permission इस review में add नहीं किया गया और न ही किसी finding में implicitly legitimize किया गया।


