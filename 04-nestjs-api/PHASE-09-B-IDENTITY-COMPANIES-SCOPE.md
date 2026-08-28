# Phase 09-B — Identity, Users, Companies & Membership Scope

Status: `CONTRACT FROZEN CANDIDATE — READY FOR IMPLEMENTATION`

यह Foundation के बाद पहला business slice है। इसका scope केवल existing requirements, API catalog और SQL baseline तक सीमित है। कोई नया business rule या endpoint path अनुमान से तय नहीं किया जाएगा।

Implementation note: approved endpoint paths and DTOs are defined only by `PHASE-09-B-API-CONTRACT-FINAL-FREEZE-CANDIDATE.md`. Any older `TBD` wording in this scope document is historical and does not override that canonical candidate.

## Authoritative inputs

- `PHASE-05-FINAL-REQUIREMENTS.md` — `REQ-AUTH-001..007`, `REQ-ONBOARDING-001`, `REQ-COMPANY-001..005`
- `PHASE-06-API-CATALOG.md` — Identity catalog §3A और Company catalog §3B
- `PHASE-07-ARCHITECTURE.md` — tenant boundary और access model
- `PHASE-08-IMPLEMENTATION-PLAN.md` — Phase 08-B dependency/test rules
- `02-database/migrations/baseline/03_users_auth.sql`
- `02-database/migrations/baseline/04_companies.sql`
- Decision-01 access model और Decision-06 error vocabulary

## Included use cases

1. Authenticated user bootstrap/profile read using verified request context.
2. Account status, role और ownership checks.
3. Company create/read/update lifecycle where catalog authorizes it.
4. Company branch, department और team administration.
5. Company member invite/add, accept, deactivate/leave और rejoin using the existing membership row policy. Rejoin reactivates the existing membership row; it does not create a duplicate row.
6. Same-company authorization and cross-company denial.
7. Owner/admin role/status/deactivation safeguards and relationship reassignment checks.

API paths अभी catalog की तरह `TBD` रहेंगे जब तक implementation contract review में freeze न हों।

## Data and transaction rules

- Existing tables/functions/constraints from SQL 03–04 ही use होंगे: `users`, `user_security_log`, `login_history`, `user_sessions`, `companies`, `company_branches`, `departments`, `teams`, `company_members`, `company_settings` और उनके approved audit/history mechanisms.
- User-facing personal/catalog reads केवल explicitly approved RLS policies के through user context में होंगे; जिन company/organization reads के लिए direct RLS policy नहीं है वे NestJS authorization के बाद trusted path से होंगे।
- Business writes के लिए NestJS authorization guard + trusted `SystemClient` transaction use होगा।
- Company/member writes में business row और required history/audit एक ही transaction में होंगे। Outbox event केवल approved versioned contract और registered route होने पर producer किया जाएगा; बिना contract के event invent या emit नहीं होगा। External calls transaction के अंदर नहीं।
- Stable lock order: company → member/user → branch/department/team relationships, जैसा Phase 08 matrix में है।
- Duplicate membership/company commands existing unique constraints या approved domain idempotency से सुरक्षित होंगे; generic in-memory idempotency नहीं।

## Security acceptance criteria

- Invalid/expired JWT rejected with approved error envelope.
- Inactive/deleted user cannot perform business commands.
- Company A का user Company B का resource read/update नहीं कर सकता.
- Owner/member role, account status और `deleted_at` unsafe transitions fail closed.
- Company का sole active owner deactivate/remove नहीं हो सकता जब तक approved ownership transfer या company deactivation पहले complete न हो.
- Company owner के user account को deactivate/suspend/delete करने से पहले ownership transfer guard लागू होगा.
- Member deactivate/leave से पहले department-head, team-lead और manager references resolve/reassign करना आवश्यक होगा.
- Supabase Auth signup के बाद `handle_new_user()` trigger `public.users` row बनाता है; NestJS duplicate user row नहीं बनाएगा।
- `user_security_log` और `login_history` append-only हैं; update/delete attempts reject होंगे।
- Work email, employee code और membership uniqueness database constraints के साथ consistent रहें.
- Secrets, raw tokens और sensitive audit data response/log में नहीं आएंगे.

## Tests required before slice approval

- Auth bootstrap and inactive-account tests.
- OAuth callback replay, session revocation और direct authenticated-DML denial tests.
- Cross-user and cross-company negative read/write tests.
- Owner/admin permission matrix tests.
- Duplicate company/member command tests.
- Member deactivation with unresolved relationship tests.
- Concurrent membership/company update tests with deterministic lock order.
- Transaction rollback proves no partial business/audit/outbox state.
- RLS/trusted-client boundary and error-envelope tests.
- `handle_new_user()` trigger-created user row और successful/failed `login_history` audit tests.

## Explicit exclusions

- Jobs, candidates, applications, referrals, interviews, messages और notifications.
- New subscription/provider behavior.
- New SQL tables, events, queue names या API paths without an approved contract/decision.
- Direct browser writes to Supabase.

## Exit gate

```text
Scope review PASS
API paths/DTOs frozen
SQL objects mapped
Authorization matrix tested
Transaction + concurrency tests pass
Independent agent review PASS
```
