# Codex Consolidated Review — Phase 09-B API Contract Proposal

Date: 2026-08-26  
Scope: `PHASE-09-B-API-CONTRACT-PROPOSAL.md` and the independent agent reviews

## Verdict

**CONDITIONAL PASS — proposal is evidence-aligned, but it is not a frozen public API contract yet.**

The proposal correctly keeps unsupported paths and business rules as pending decisions. No controller implementation should start until the decisions below are resolved and the proposal is promoted to a freeze document.

## Findings accepted from cross-review

1. `AUTH-BOOTSTRAP` is only a callback/bootstrap boundary proposal. Ownership of the `public.users` row remains with the existing Supabase `handle_new_user()` trigger unless an approved decision changes it.
2. `AUTH-ME` is a valid approved personal read and must use `UserContextClient` with the existing `users_own_read` RLS policy.
3. `AUTH-SESSION` must not be described as Supabase Auth token revocation. `user_sessions` is realtime-presence data; reads/revokes use `SystemClient` plus explicit ownership checks. Any token-level revoke is a separate post-transaction provider operation and still needs approval.
4. Company, branch, department, team and membership operations have no approved direct authenticated RLS policies in the baseline. They therefore require `SystemClient` plus same-company owner/admin authorization; no new policies are invented here.
5. Company creation eligibility is undefined in the source documents and remains a decision, not an assumed role rule.
6. The baseline has no invitation token/table. `MEMBERSHIP-ACCEPT` remains `TBD`; an external-email invitation flow requires an approved forward migration and contract review. Existing-user self-accept is the source-faithful default option.
7. Leave/deactivate must protect the sole owner/last administrator and resolve department-head, team-lead and manager references first. Rejoin reactivates the existing membership row; `joined_at` semantics still need an explicit decision.
8. Company settings one-to-one initialization, verification-field exclusion, endpoint-specific Phase 06 errors, atomic audit/history writes and post-commit-only external calls are now explicit proposal rules.

## Remaining decisions before freeze

| ID | Decision | Why it blocks freeze |
|---|---|---|
| D1 | Is `/auth/bootstrap` a NestJS endpoint or only an external Supabase callback integration? | Prevents duplicate signup ownership. |
| D2 | Exact company owner/admin eligibility policy | Baseline does not define a universal eligibility rule. |
| D3 | Invitation model and accept actor (existing-user self-accept vs new invitation artifact) | No token/table exists in `04_companies.sql`. |
| D4 | Separate nested organization resources vs one organization command endpoint | Affects public paths and DTO boundaries. |
| D5 | Session revoke scope and meaning | `user_sessions` is presence data, not Supabase Auth sessions. |
| D6 | Sole-owner/last-admin leave/deactivate rule and rejoin `joined_at` behavior | Prevents orphaned companies and audit ambiguity. |
| D7 | Whether token-level Supabase Auth revocation is required in addition to presence-row handling | Requires a separate provider capability and post-transaction flow. |

## Implementation gate

Do **not** create controllers, DTOs or routes from this proposal yet. After D1–D7 are explicitly approved, update the proposal/contract catalog, run one final independent review, then freeze the API contract and begin implementation.

**Status: READY FOR DECISIONS — NOT READY FOR API CODING.**
