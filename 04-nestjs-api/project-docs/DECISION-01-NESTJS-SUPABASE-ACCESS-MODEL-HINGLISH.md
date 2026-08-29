# Decision 01 - NestJS ka Supabase Database Access Model

**Status:** APPROVED / FROZEN - corrected controlled-hybrid model

## 1. Issue kya hai?

NestJS API ko Supabase PostgreSQL se data read/write karna hai. Hume decide karna hai ki NestJS database ko kis identity ke saath access karega:

```text
1. User JWT + RLS
2. Backend trusted role
3. Controlled hybrid model
```

Ye decision important hai kyunki isse ownership security, RLS behavior, worker access, transaction code, testing aur secret management affect honge.

## 2. Option A - User JWT + RLS

```text
Candidate/HR login
        ↓
Next.js ko user JWT milta hai
        ↓
Next.js JWT NestJS ko bhejta hai
        ↓
NestJS Supabase query ke saath user JWT pass karta hai
        ↓
PostgreSQL RLS policies auth.uid() ke basis par access allow/deny karti hain
```

Example:

- Candidate apna profile read/update kar sakta hai.
- Candidate doosre candidate ka private profile read nahi kar sakta.
- HR ko sirf authorized company/job/application context ka data milta hai.

**Benefit:** Database ownership rule khud enforce karta hai.

**Risk/complexity:** User JWT ko request se database transaction tak safely propagate karna padega. Har system/worker operation user context ke bina nahi chal sakta.

## 3. Option B - Backend Trusted Role

```text
Next.js
   ↓ user JWT
NestJS authentication + authorization check
   ↓
NestJS server-only trusted/service role se Supabase query
   ↓
RLS bypass; NestJS ownership/policy enforce karta hai
```

**Benefit:** Transactions, admin workflows, outbox aur internal operations simple hote hain.

**Risk:** Agar NestJS authorization mein bug hua, to RLS second safety barrier nahi dega. Isliye har endpoint par identity, role, company membership, ownership aur tenant checks mandatory honge.

**Security rule:** Trusted/service credential browser, Next.js client, logs ya task payload mein kabhi expose nahi hoga.

## 4. Option C - Controlled Hybrid

```text
User-facing request
   → User JWT + RLS

System/worker/outbox/admin operation
   → Server-only trusted role
```

Expected mapping:

| Operation | Proposed access |
|---|---|
| Candidate apna profile READ kare | User JWT + RLS |
| Candidate apna profile UPDATE/WRITE kare | NestJS guards/ownership → trusted server role (17_rls.sql me authenticated ko DML grants nahi; line 151) |
| HR authorized candidate/application data read kare | User JWT + RLS (jahan select policies exist) ya NestJS safe DTO |
| Candidate profile projection rebuild ho | Trusted server role |
| FastAPI AI result commit kare | Trusted server role |
| Outbox claim/lease/recovery ho | Trusted server role |
| Controlled admin/system cleanup ho | Trusted server role |

**Benefit:** User data ke liye database-level RLS aur internal workflows ke liye reliable server transactions dono milte hain.

**Risk:** Do access paths maintain karne honge. Har repository/use-case ko clearly declare karna hoga ki woh user-context path hai ya system path.

## 5. Current architecture constraints

- Browser ko Supabase `service_role` nahi mileगा.
- `17_rls.sql` ownership/security boundary ka authority source hai.
- NestJS main business layer hai.
- Dispatcher aur FastAPI background services ko user JWT available nahi hota.
- Outbox claim, worker result commit aur projection update system operations hain.
- External API calls open DB transaction ke andar nahi hongi.

## 6. Evidence-based recommended direction (approval pending)

Current executable `17_rls.sql` ka actual design ye hai:

- `anon`/`authenticated` ko direct business-table DML grants nahi diye gaye.
- Selected personal/catalog reads ke liye limited `authenticated` SELECT grants aur RLS policies hain.
- Business writes aur approved system functions `service_role` ko restricted hain.
- File header explicitly bolta hai ki NestJS public API hai aur privileged writes browser/Next.js se nahi honge.

Isliye current baseline ke saath recommended model **Option C - Controlled Hybrid (corrected)** hai. Yahan “hybrid” ka matlab ye nahi hai ki har user-facing table User JWT + RLS se access hogi. Sirf wahi reads RLS path par jayengi jinke liye explicit authenticated grants/policies موجود hain.

```text
Option C - Controlled Hybrid (limited RLS reads + trusted server writes)

Personal read where an explicit RLS SELECT policy exists:
Next.js JWT -> NestJS user-context read -> authenticated RLS path

Business read/write or transaction:
Next.js JWT -> NestJS authentication/authorization
           -> server-only trusted database path
           -> atomic business write + history/audit + outbox
```

Clarification for applications: candidate self-read can use the existing `applications_candidate_read` RLS path where the NestJS adapter intentionally propagates user context. HR/employer application reads remain NestJS trusted-path reads with explicit company/job authorization. The API must choose and document the path per use-case; it must not mix clients implicitly.

Background services bhi server-only trusted connection use karenge:

```text
Dispatcher / FastAPI / projection / outbox functions
   → server-only trusted role
```

RLS remove nahi hogi. Existing RLS limited reads aur default-deny defense-in-depth ke roop mein rahegi. Current baseline mein RLS NestJS business-write authorization ka primary path nahi hai.

**Future expansion:** Kisi naye table ko User JWT + RLS path par tabhi add karenge jab explicit grant/policy, separate client boundary aur cross-tenant tests approve/complete hon. Missing policies ko silently invent nahi karna hai.

### Mandatory client-boundary rule

NestJS mein do explicitly separated adapters/clients honge:

```text
UserContextClient  -> only approved user-context reads with RLS
SystemClient       -> trusted business transactions/workers
```

`SystemClient` user-facing repositories mein accidentally injectable nahi hona chahiye. Code review, dependency injection tokens aur integration tests is separation ko enforce karenge.

### OD-1 production hardening item

Current phase mein approved server-side trusted access use ho sakta hai. Production hardening ke liye future mein dedicated least-privilege database LOGIN role evaluate kiya jayega, instead of broad `service_role`/BYPASSRLS access. Is role ko abhi invent nahi karna; grants, functions, Secret Manager binding aur rollout tests ke saath separate ADR/migration mein define karna होगा.

`OD-1` is an explicit security hardening item, not a reason to add speculative RLS policies or block current requirement consolidation.

**Approval record:** User/architect approval received on 2026-08-23. Independent agent reviews were evidence inputs only; the executable baseline and explicit access-boundary rules are authoritative.

## 7. Independent reviewer se exact questions

Reviewer se in questions ka evidence-based answer maango:

1. Kya `17_rls.sql` ki current policies user JWT based access ko correctly support karti hain?
2. Kya NestJS ke sab user-facing reads/writes ko user JWT ke saath safely execute karna practical hai?
3. Kya outbox dispatcher, FastAPI worker aur projection writes ke liye trusted server role unavoidable hai?
4. Kya hybrid model mein koi operation accidentally RLS bypass kar sakta hai?
5. Kya trusted-role path ke liye explicit NestJS policy/ownership checks aur integration tests sufficient honge?
6. Kya is recommendation ko final production access model freeze karna chahiye? Agar nahi, exact alternative aur reason do.

## 8. Decision record template

```text
Chosen option: Option C - Controlled Hybrid (limited RLS reads + trusted server writes)
Reason: Current 17_rls.sql allows only selected authenticated reads, intentionally blocks direct authenticated DML, and restricts approved system functions to server-side access.
User-facing access path: Explicitly allowed personal/catalog reads may use authenticated RLS; business reads/writes go through NestJS guards/policy checks and server-only trusted transactions.
System/worker access path: Dispatcher/FastAPI/outbox/projection -> server-only trusted role.
RLS expectation: Existing limited reads/default-deny remain active; RLS is not the primary NestJS write path.
Trusted-role restrictions: Server-only, separate system client, never browser/logs/task payloads; no unreviewed use in user repositories.
Secret handling: Secret Manager/Cloud Run secret binding; no plaintext credentials in source or payloads.
Required tests: Cross-tenant negative API tests, role/ownership tests, rollback/idempotency tests, direct authenticated DML denial, system-client separation tests.
Future expansion: Additional RLS read paths only after explicit policies/grants and dual-path tests.
OD-1: Dedicated least-privilege production DB role to be evaluated in a separate ADR/migration.
Required access tests: RLS cross-tenant negative reads; NestJS guard cross-tenant negative writes; direct authenticated write-denial; UserContextClient/SystemClient separation.
Approved by:
Date:
```

**This access-model decision is approved/frozen. Phase 5 may use it as the authority; unrelated open decisions in Phase 3 remain separate blockers.**
