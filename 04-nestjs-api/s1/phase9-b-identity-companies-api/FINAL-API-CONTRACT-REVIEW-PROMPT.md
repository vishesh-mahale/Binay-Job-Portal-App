# Final API Contract Review Prompt — Phase 09-B

Repository: `C:\Users\ADMIN\OneDrive\Desktop\Vishesh\Binay-Job-Portal-App`

Review these files against `AGENTS.md`, Phase 05 requirements, Phase 06 API catalog, SQL baseline `03_users_auth.sql` and `04_companies.sql`, `17_rls.sql`, Decision-01, Decision-06, and the contracts directory:

- `04-nestjs-api/PHASE-09-B-API-CONTRACT-PROPOSAL.md`
- `04-nestjs-api/PHASE-09-B-API-CONTRACT-FREEZE.md`
- `04-nestjs-api/PHASE-09-B-API-CONTRACT-DECISIONS-HINGLISH.md`
- `04-nestjs-api/PHASE-09-B-DTO-FIELD-MAPPING-WORKSHEET.md`
- `04-nestjs-api/PHASE-09-B-DTO-CLASS-CATALOG.md`

Audit every proposed operation:

- auth signup/login/verification/profile read
- realtime presence session read/revoke
- company create/read/update
- branch/department/team create/update/deactivate
- registered-user membership invite/accept
- member deactivate/leave/rejoin
- single-owner and ownership-transfer protections

Rules:

- Blindly agree mat karo; exact SQL/document evidence cite karo.
- DTO fields ko exact SQL columns se map karo; API `session_id` ka mapping `user_sessions.id` ke saath explicit verify karo.
- Proposed DTO class names ko implementation naming proposal samjho; unsupported class fields ya endpoints approve mat karo.
- Freeze worksheet ke membership invite/deactivate/leave rows aur owner/admin derivation ke latest direct updates ko verify karo; override notes ko sufficient proof mat samjho.
- Koi table, column, role, endpoint, event, permission ya DTO field invent mat karo.
- D1–D8 decisions ko approved current-scope rules ke रूप में verify karo.
- `public.users` creation trigger-owned hai; NestJS duplicate insert nahi karega.
- UserContextClient sirf approved personal/catalog RLS reads ke liye; company/membership trusted path + explicit authorization.
- External provider calls DB transaction ke andar nahi.
- Unapproved outbox event/contract assume nahi karna.
- Check karo ki कोई important endpoint, actor, error, idempotency, audit या acceptance rule छूटा तो नहीं.

Report include karo:

1. Verdict: PASS / PASS WITH MINOR FIXES / CONDITIONAL / BLOCKED
2. Per-endpoint table: path, method, actor, permission, client boundary, DTO evidence, errors, idempotency, transaction, audit/outbox
3. SQL/requirements conflicts
4. Missing or invented behavior
5. Exact fixes required before freeze
6. Final readiness: READY FOR CONTRACT FREEZE or NOT READY

No code or SQL changes. Report save karo:

`04-nestjs-api/s1/phase9-b-identity-companies-api/final-contract-review/<agent-name>-review.md`

Revalidation note: D1–D8 decisions are now resolved for the current scope. Pay special attention to the updated freeze worksheet, the removal of the separate bootstrap endpoint, SQL-backed DTO names (`head_member_id` / `lead_member_id`), and the owner/admin-approved rejoin flow.
