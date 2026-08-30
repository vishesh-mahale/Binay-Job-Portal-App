# Codex Consolidated Review — Commit `381701c`

**Reviewers:** Codex, FreeBuf, OpenCode  
**Commit verified:** `381701cf9d7f5244379a3e05c4642c3bf03f1894`  
**Repository state:** clean; reviewers ne source code modify nahi kiya.

## Final verdict

**BLOCKED — required fixes ke bina next production/release gate par nahi jana hai.**

Commit build hota hai aur reported unit tests pass hote hain, lekin teen independent reviews aur current-code cross-check se kuch real executable defects mile hain. Isliye Phase 09-A ko `VERIFIED & COMPLETE` kehna abhi overstatement hai.

## Consensus findings

| ID | Severity | Finding | Evidence | Required action |
|---|---|---|---|---|
| C-01 | BLOCKER | Real NestJS bootstrap me `ValidationPipe` ke required packages missing hain. | `src/main.ts` me `ValidationPipe`; `package.json` me `class-validator`/`class-transformer` nahi. | Dependencies add/lock karo, DTO decorators lagao, real bootstrap + HTTP validation test add karo. |
| C-02 | BLOCKER | `UserContextClient` JWT claims set karta hai, lekin restricted PostgreSQL role establish nahi karta; same pool trusted role use karta hai. | `src/clients.ts`, `src/database.ts`, `17_rls.sql`. | Actual restricted user-context transaction/role path implement karo aur real cross-user/cross-tenant RLS tests chalao. Verified JWT ke bina claims DB ko trust na karayein. |
| C-03 | HIGH | Valid JWT ke baad suspended/deleted/locked account request kar sakta hai; active-account guard missing hai. | `src/auth.ts`, `app.module.ts`, Phase-08 requirements. | Every protected request par current account state/lock check aur negative tests add karo. |
| C-04 | HIGH | Issuer/audience optional hain; implementation HS256 shared-secret hai, real JWKS nahi. | `src/config.ts`, `src/auth.ts`, `src/security/jwt-verifier.ts`. | Issuer/audience deploy environments me mandatory karo, wrong issuer/audience tests add karo, docs me JWKS wording correct karo ya real JWKS adapter implement karo. |
| C-05 | HIGH | Company update owner ke liye hamesha fail hota hai kyunki `get()` response me `owner_id` nahi hai. | `src/companies.ts`: `current.owner_id` check, response field list me `owner_id` absent. | Internal ownership query/field use karo, response me expose mat karo; owner-success/member-denial tests add karo. |
| C-06 | HIGH | Company create `RETURNING *` se internal/sensitive fields response me leak kar sakta hai. | `src/companies.ts` create query. | Create/read/update sab me same explicit safe response mapper/allowlist use karo. |
| C-07 | HIGH | Candidate search relevance score wrong parameter (`$2` recruiter ID) se calculate hota hai; query `$3` hai. | `src/candidate-search-query.ts`. | Rank expression ko actual search-query parameter par fix karo; ranking test add karo. |
| C-08 | MEDIUM | Saved candidate uniqueness recruiter+candidate hai, company-scoped route ke saath semantic conflict hai. | `src/saved-candidates.ts`, `09_applications.sql`, API catalog. | Recruiter-global vs recruiter+company decision freeze karke unique key, conflict path aur privacy tests align karo. |
| C-09 | MEDIUM | Guest applications company list/detail me hard-coded `is_guest = FALSE` se exclude hoti hain. | `src/applications.ts`; guest application is current scope. | HR visibility contract explicitly freeze karo; in-scope hone par safe guest projection/test add karo. |
| C-10 | MEDIUM | Daily expiry function bounded batch (100) process karti hai; ek daily run backlog chhod sakta hai. | `15_infrastructure.sql` expiry function/schedule. | All due rows safely drain karo ya approved repeat policy do; 101+ due-job test add karo. |
| C-11 | MEDIUM | Rate-limit middleware, real RLS/transaction integration, concurrency/failure tests aur clean shutdown verification incomplete hain. | Package/app wiring, current test reports, dispatcher pending gates. | Relevant phase me implement/test karo; unit green ko production proof na mano. |
| C-12 | MEDIUM | Secret Manager rotation, least-privilege dispatcher role, queue/IAM re-check, ClamAV runtime, CI/CD aur live release gates open hain. | `05-outbox-dispatcher-nestjs/IMPLEMENTATION-PENDING.md`. | Release gate se pehle complete karo; secrets ko repo/logs me kabhi na rakho. |

## Findings जिन्हें consolidate करते समय reject किया गया

- OpenCode ka interview scheduling “trigger violation” blocker **valid nahi**: schedule block update insert se pehle hota hai aur same transaction me trigger ko matching values milti hain.
- FreeBuf ke self-add membership, debug logging aur future `no_show_at` suggestions useful ho sakte hain, lekin current release blockers nahi hain.
- `17_rls.sql` me har table ke liye browser DML policy na hona apne aap bug nahi; service-owned/default-deny design approved hai. Problem C-02 effective user-context DB role ka hai.
- Historical “100% production-ready” claims evidence ke bina accept nahi kiye gaye.

## Tracker correction

`IMPLEMENTATION-TRACKER-HINGLISH.md` me Phase 09-A ko abhi `VERIFIED & COMPLETE` nahi mark karna chahiye. C-01–C-04 close hone tak status:

```text
Phase 09-A: IN PROGRESS — BLOCKED ON RUNTIME/AUTH VERIFICATION
```

## Antigravity ke liye next work order

1. C-01: bootstrap/validation dependencies and real startup test.
2. C-02: genuine restricted RLS user-context path and database negative tests.
3. C-03/C-04: active-account enforcement and mandatory JWT issuer/audience.
4. C-05/C-06/C-07: company response/update and candidate ranking defects.
5. C-08/C-09/C-10: contract/visibility/expiry reconciliation and tests.
6. Re-run complete build, unit, integration and security-negative suites without forced-exit/open-handle warnings.
7. Create a new commit; then FreeBuf, OpenCode and Codex review that exact new commit read-only.

**No source-code fix was applied by Codex in this review.**
