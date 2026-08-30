# NestJS API: Requirements se Implementation tak Final Plan

**Status:** Pre-coding planning approved

**Current decision:** Abhi `04-nestjs-api` ka code start nahi hoga. Pehle repository ki saari relevant requirements ko discover, consolidate, trace aur freeze kiya jayega. Is file ka purpose kisi bhi doosre agent ko same process follow karwana hai.

## 1. Is plan ka goal

`04-nestjs-api` application ka central business layer hoga. Iske through Next.js UI, Supabase Auth/Database/Storage, Outbox Dispatcher aur FastAPI AI Worker ke beech business flow chalega.

Hamare goals:

- koi feature ya API requirement miss na ho;
- duplicate documents se contradictory behavior na aaye;
- database, contracts, dispatcher aur FastAPI ke saath exact traceability rahe;
- security, transaction, idempotency, retry aur audit rules coding se pehle clear hon;
- unresolved decision ko agent apni taraf se invent na kare.

## 2. Authority order

Conflict hone par agent is priority order ko follow kare:

1. `AGENTS.md` ke working/security rules.
2. Current approved architecture decisions aur ADRs.
3. Executable database baseline: `02-database/migrations/` files 01–18. `19_supabase_webhook_prerequisites.sql` ko schema/business baseline nahi, operational webhook prerequisite/fallback ke roop mein classify karo.
4. Shared contracts: `contracts/`.
5. Existing executable code aur tests in `05-outbox-dispatcher-nestjs/` and `07-fastapi-ai-worker/`.
6. Current requirement and schema explanation documents.
7. Old `Binay-App` repository, old reviews, drafts and examples — sirf reference/evidence, authority nahi.

Important:

- Missing requirement invent nahi karni hai.
- Conflict ko silently resolve nahi karna hai.
- Exact file/section reference ke saath conflict report karna hai.
- Testing database ke liye baseline SQL intentionally correct/rebuild ki ja sakti hai; production deployment ke baad changes forward-only migrations se honge.

## 3. End-to-end workflow

```text
All requirement sources
        |
        v
Phase 0: Source inventory + authority map
        |
        v
Phase 1: Detailed requirements consolidation
        |
        v
Phase 2: Requirement traceability matrix
        |
        v
Phase 3: Gap + conflict analysis
        |
        v
Phase 4: State machines + transaction rules
        |
        v
Human decisions / approvals
        |
        v
Phase 5: Final requirements freeze
        |
        v
Phase 6: Complete API catalog
        |
        v
Phase 7: NestJS architecture design
        |
        v
Phase 8: Detailed implementation plan
        |
        v
Independent agent reviews
        |
        v
Final plan freeze
        |
        v
Phase 9: Coding
```

Kisi bhi phase ko skip karke coding start nahi karni hai.

## 4. Phase 0 — Source inventory

### Kaam

Repository scan karke har relevant source ko list karo. Har file ko authority/classification do:

- current authoritative;
- executable contract;
- explanatory/supporting;
- research/reference;
- outdated/conflicting;
- future requirement.

### Minimum areas

- `01-requirements/`;
- `01-requirements/source-inputs/CLIENT-REQUIRED-FUTURE-CATEGORIZED.md` (client discussion ka category-wise feature ledger);
- `01-requirements/source-inputs/REQUIREMENT.txt` (master product/business requirement input: roles, workflows, security, scale, AI, search, applications, referrals, notifications and analytics);
- `01-requirements/current/PRODUCT-REQUIREMENTS.md` (curated/current product requirements; source-inputs se refined rules, approved directions, planned scope aur product decisions ke links);
- `02-database/migrations/` and `02-database/schema-docs/`;
- `02-database/flows/` and `02-database/RLS-REVIEW-CHECKLIST.md`;
- `contracts/`;
- `docs/adr/` and `docs/architecture/` (approved decisions and architecture evidence);
- `04-nestjs-api/` existing docs/readme (agar present);
- `04-nestjs-api/project-docs/NESTJS-IMPLEMENTATION-GUIDE.md` (current architecture aur transaction-rule input; iski section-by-section coverage audit mandatory hai);
- `05-outbox-dispatcher-nestjs/`;
- `07-fastapi-ai-worker/`;
- root `README.md`, `PROJECT-CONTEXT-MAP.md`, `MIGRATION-PLAN-HINGLISH.md`;
- background processing, webhook, Cloud Tasks, security and deployment documents;
- `19-EASY-GUIDE-DEV-PROD-WEBHOOK-SECRET-SETUP.md` (webhook, secret binding aur Dev/Prod operational setup);
- `02-database/migrations/baseline/17_rls.sql` (explicit authorization/RLS executable source);
- `contracts/` ka versioning convention, existing `v1` files aur producer-consumer compatibility evidence;
- `Agent_review/` ke existing audit/review reports (sirf evidence/review input; authority nahi);
- `AGENTS.md`.

### Deliverable

`04-nestjs-api/project-docs/PHASE-00-REQUIREMENTS-SOURCES.md`

Isme path, purpose, authority, last-known status aur related domain mention hoga. Koi source silently ignore nahi hoga.

Phase 0 inventory mein `docs/adr/`, `docs/architecture/`, webhook setup guide, `17_rls.sql`, `02-database/flows/`, `RLS-REVIEW-CHECKLIST.md`, contract-versioning convention aur existing `Agent_review/` reports ko alag rows ke roop mein record karna mandatory hai. Inmein se kisi ko sirf generic “security/contract docs” ke andar hide nahi karna hai.

### `CLIENT-REQUIRED-FUTURE-CATEGORIZED.md` handling rule

`CLIENT-REQUIRED-FUTURE-CATEGORIZED.md` ab client-input feature ledger ka maintained category-wise version hai. Is file ko silently rewrite ya delete nahi karna hai.

- Jis feature ke saath `<----------------->` marker hai, use initial classification mein `FUTURE` mark karo.
- `New features introduced` section ke features ko initial classification mein `REQUIRED` mark karo, kyunki client ne unhe current scope mein add kiya tha.
- Ye initial classification final decision nahi hai. Phase 1/3 mein har item ko latest client decision, approved architecture, SQL support, contracts aur security rules ke against verify karo.
- Agar later client discussion ne kisi marked future feature ko current scope mein la diya ho, uska status `REQUIRED` update karo aur exact source reference likho.
- Agar koi feature current requirement se conflict kare, use `CONFLICT`/`NEEDS_CLARIFICATION` mark karo; agent apni taraf se silently remove ya implement nahi karega.
- Consolidated document mein original wording/reference preserve rahega, lekin implementation ke liye stable `REQ-*` ID assign ki jayegi.

`NESTJS-IMPLEMENTATION-GUIDE.md` ko generic supporting note samajhkar skip nahi karna hai. Phase 1 consolidation mein uski har meaningful section ko `preserved`, `updated`, `moved` ya `not carried forward` classify karo. `not carried forward` hone par exact reason aur replacement reference likho.

## 5. Phase 1 — Detailed requirements consolidation

Phase 1 source-level consolidation hai, final acceptance/API specification nahi. Isliye Phase 1 table mein related fields ko compact form mein combine kiya ja sakta hai (for example DB + API + async impact), lekin information omit nahi hogi. `User flow`, `Security`, `Idempotency`, `Rate limit`, `Audit requirement` aur per-requirement `Acceptance criteria` Phase 2 traceability matrix mein separately mandatory honge. Phase 1 mein unke unresolved/source references preserve karna hoga.

Har requirement ko stable ID do, for example:

```text
REQ-AUTH-001
REQ-CANDIDATE-001
REQ-JOB-001
REQ-APPLICATION-001
REQ-REFERRAL-001
REQ-RESUME-001
REQ-SEARCH-001
REQ-NOTIFICATION-001
REQ-ADMIN-001
REQ-COMPANY-001
REQ-INTERVIEW-001
REQ-ANALYTICS-001
REQ-AI-001
REQ-ONBOARDING-001
REQ-SAVED-CANDIDATE-001
```

Har item mein ye fields mandatory hon:

| Field | Kya likhna hai |
|---|---|
| Requirement ID | Stable unique ID |
| Feature/domain | Kis business area ka part hai |
| Actor | Candidate, recruiter, employer, admin, service, worker |
| Business rule | User ko kya behavior milna chahiye |
| User flow | Start se end tak steps |
| Source | Exact file aur section/heading |
| DB objects | Tables, columns, functions, indexes |
| API need | Expected NestJS endpoint/use case |
| Async behavior | Outbox event, dispatcher route, worker consumer |
| Security | Auth, role, ownership, RLS, PII rule |
| Idempotency | Duplicate request/event ka behavior |
| Rate limit | Request frequency, burst aur abuse-control rule |
| Audit requirement | Kaunsi audit/security history mandatory hai |
| Acceptance criteria | Phase 2 mein per-requirement testable success/failure conditions |
| Status | `REQUIRED`, `FUTURE`, `REJECTED`, `NEEDS_CLARIFICATION`, `CONFLICT` |

Phase 1 richer working labels use kar sakta hai, lekin canonical mapping mandatory hai:

```text
APPROVED / APPROVED DIRECTION / PLANNED CURRENT -> REQUIRED
FUTURE                                           -> FUTURE
NEEDS_DECISION                                  -> NEEDS_CLARIFICATION
GAP                                              -> REQUIRED + unresolved implementation gap
REJECTED                                        -> REJECTED
CONFLICT                                        -> CONFLICT
```

Phase 2 matrix mein canonical status ke saath optional detail label retain kiya ja sakta hai.

### Deliverable

`04-nestjs-api/project-docs/PHASE-01-REQUIREMENTS-CONSOLIDATION.md`

Approved source ka full meaning preserve rahega. Summary banate waqt original rules, examples aur acceptance criteria delete nahi honge.

## 6. Phase 2 — Traceability matrix

Har requirement ko implementation surface se map karo. Is phase mein Phase 1 ke compact fields ko mandatory traceable fields mein expand karo. Readability ke liye fields ko normalized grouped columns/policy references mein present kiya ja sakta hai; 16 physical visual columns mandatory nahi hain, lekin har field ka value ya explicit `TBD/NEEDS_DECISION` per requirement traceable hona chahiye:

| Requirement | Flow + business rule | Source | DB/API/transaction/event/consumer mapping | Security + idempotency + rate/audit controls | Acceptance criteria/tests | Status |
|---|---|---|---|---|---|---|---|---|---|

Matrix mein ye gaps explicitly mark karo:

- requirement hai, DB support missing;
- DB table/function hai, requirement source missing;
- API behavior hai, contract missing;
- event hai, dispatcher route/worker consumer missing;
- security/ownership rule hai, RLS/API guard missing;
- acceptance test missing;
- duplicate ya contradictory source.

Dispatcher routing phased hai. Current dispatcher Phase-1 implementation mein sirf approved/implemented routes (jaise `candidate.projection.rebuilt`) available ho sakte hain. Baaki valid event contracts ko matrix mein `EXPECTED PHASED GAP` mark karo; unhe automatic blocker ya missing architecture mat samjho. Har unrouted event ke liye owner phase aur fail-closed behavior record karo.

### Deliverable

`04-nestjs-api/project-docs/PHASE-02-REQUIREMENTS-TRACEABILITY-MATRIX.md`

## 7. Phase 3 — Gap aur conflict analysis

Har gap/conflict ke liye:

```text
Issue ID
Exact source references
Observed behavior/rule
Conflict ya missing dependency
Impact
Possible options
Recommended option
Required human decision
Resolution status
```

Agent ko “probably”, “assume”, ya silent workaround use nahi karna hai. Jo decision user/product owner se chahiye, use approval list mein rakho.

### Deliverable

`04-nestjs-api/project-docs/PHASE-03-GAP-CONFLICT-ANALYSIS.md`

## 8. Phase 4 — State machines aur transaction rules

API catalog se pehle lifecycle freeze karo. Minimum state machines:

- user signup, verification, activation and account status;
- company membership, owner transfer, deactivate/rejoin;
- candidate canonical profile revision and manual edits;
- document upload, parsing job and parsing result;
- registered application and guest application;
- application status/history/snapshot;
- guest claim;
- referral batch/invitation/reissue/reward;
- outbox event and processing/idempotency;
- notification and messaging lifecycle.

Har state transition ke liye likho:

- allowed previous → next states;
- actor/service allowed;
- required columns/timestamps;
- DB transaction boundary;
- outbox event;
- retry/idempotency behavior;
- invalid transition error;
- audit requirement.

### Transaction template

```text
BEGIN
  validate auth/ownership/business rule
  lock/read required rows
  write canonical business rows
  write history/audit rows
  write outbox_events in same transaction
COMMIT
post-commit async delivery/processing
```

Cloud Tasks, FastAPI, email ya external API ko open DB transaction ke andar call nahi karna hai.

### Deliverable

`04-nestjs-api/project-docs/PHASE-04-STATE-MACHINES-AND-TRANSACTIONS.md`

## 9. Phase 5 — Final requirements freeze

Gap/conflict decisions ke baad final document banega:

`04-nestjs-api/project-docs/PHASE-05-FINAL-REQUIREMENTS.md`

Is document mein sirf approved current production scope hoga. Future aur unresolved items clearly separate honge. Kisi old document ko silently delete nahi karna; uska classification aur replacement reference maintain karna hai.

Freeze se pehle checklist:

- har required feature ka requirement ID hai;
- har requirement ka source hai;
- har DB write ka owner clear hai;
- har async event ka contract/consumer clear hai;
- auth/RLS/ownership clear hai;
- negative/error behavior clear hai;
- no unresolved `CONFLICT` item silently left;
- user/product-owner decisions recorded.

## 10. Phase 6 — API catalog

### Deliverable

`04-nestjs-api/project-docs/PHASE-06-API-CATALOG.md`

Final requirements freeze ke baad hi API catalog banao. Har endpoint/use case ke liye:

```text
API ID / Requirement ID
HTTP method + path
Actor and permission
Request DTO and validation
Response DTO
Tables/functions read
Tables/functions written
Transaction boundary
Outbox event(s)
Async consumer
Idempotency key/rule
Rate limit
Audit/security event
Error codes
Acceptance tests
```

Catalog mein sirf HTTP routes nahi, internal service commands/use cases bhi include hon jahan direct UI API nahi hoti.

### Realtime transport decision

Candidate parsing/projection, application status, notifications aur messaging jaise live updates ke liye Phase 6/7 mein explicit ADR banana hoga:

```text
WebSocket vs SSE vs Supabase Realtime/Broadcast
```

ADR mein direction, authentication, reconnect, authorization, event filtering, backpressure, fallback aur testing rules freeze honge. Agent transport apni taraf se silently select nahi karega.

### Contract versioning decision

`contracts/` ke API/event/task payloads ke liye versioning strategy bhi document hogi:

- version field aur file naming convention;
- backward/forward compatibility rule;
- producer-consumer rollout order;
- deprecation/support window;
- breaking change ke liye new contract version;
- contract tests aur ownership.

Existing contract ko silently mutate karke old consumers break nahi kiye jayenge.

## 11. Phase 7 — Scalable NestJS architecture design

### Deliverable

`04-nestjs-api/project-docs/PHASE-07-ARCHITECTURE.md`

Architecture requirements se derive hogi, pehle impose nahi ki jayegi. Design document mein final bounded contexts, module ownership aur dependency direction define karo.

### Supabase database access decision (mandatory)

Phase 7 mein explicit decision record karna mandatory hai; agent apni taraf se access model assume nahi karega:

```text
Option A: per-user JWT / authenticated DB session
  - RLS database level par ownership enforce karegi
  - user context DB tak propagate karna hoga

Option B: trusted backend service-role/database role
  - RLS bypass ho sakti hai
  - NestJS guards, ownership checks, approved DB functions aur audit controls mandatory honge
```

Final design mein ye clearly likha hoga:

- kaunse request paths user JWT context use karte hain;
- kaunse trusted service paths use karte hain;
- service-role secret browser ko kabhi nahi milega;
- RLS aur API authorization ki ownership boundary kya hai;
- background workers ke liye alag database role/credential policy kya hai.

Decision ko `NEEDS_CLARIFICATION` rakhna allowed hai, lekin coding se pehle resolve karna hoga.

Likely areas ko scan se verify karo (blindly assume nahi):

```text
identity/auth
users
companies/memberships
candidates
jobs
applications
referrals
resume/documents
interviews
messaging/notifications
search
admin/analytics/subscriptions
```

Shared layers:

```text
modules/
infrastructure/database, storage, auth, outbox
common/guards, validation, errors, observability
```

Rules:

- module direct doosre module ke tables mutate na kare;
- ownership module/use-case ke paas rahe;
- DB transaction boundary explicit ho;
- repositories approved SQL/functions/contracts ke against hon;
- outbox publisher/worker logic main API mein duplicate na ho;
- secrets/PII logs ya task payload mein na aaye.

## 12. Phase 8 — Implementation plan

### Deliverable

`04-nestjs-api/project-docs/PHASE-08-IMPLEMENTATION-PLAN.md`

Implementation plan dependency order mein ho. Har phase ke liye:

- scope and requirement IDs;
- dependencies;
- modules/files;
- endpoints/use cases;
- DB tables/functions;
- transaction rules;
- events/contracts;
- auth/RLS/security;
- unit/integration/E2E tests;
- rollback/operational notes;
- measurable exit criteria.

Implementation plan ko final requirements aur API catalog se trace karna mandatory hai.

## 13. Independent review gate

Doosra agent review karte waqt woh previous agent ke “complete/final” claim par trust na kare. Reviewer ko independently:

1. authority files read karni hain;
2. source inventory verify karni hai;
3. requirement IDs aur traceability check karni hai;
4. DB/contracts/code consistency check karni hai;
5. missing APIs, events, security rules aur tests identify karne hain;
6. exact file/section evidence dena hai;
7. report ko `Agent_review/` mein save karna hai.

Review report mein `PASS`, `GAP`, `CONFLICT`, `NEEDS_DECISION` classification use ho.

## 14. Coding start gate

Coding tabhi start hogi jab ye sab approved hon:

- `PHASE-00-REQUIREMENTS-SOURCES.md`;
- `PHASE-01-REQUIREMENTS-CONSOLIDATION.md`;
- `PHASE-02-REQUIREMENTS-TRACEABILITY-MATRIX.md`;
- `PHASE-03-GAP-CONFLICT-ANALYSIS.md`;
- `PHASE-04-STATE-MACHINES-AND-TRANSACTIONS.md`;
- gap/conflict decisions;
- state machines and transaction rules;
- `PHASE-05-FINAL-REQUIREMENTS.md`;
- `PHASE-06-API-CATALOG.md`;
- `PHASE-07-ARCHITECTURE.md`;
- `PHASE-08-IMPLEMENTATION-PLAN.md`;
- complete API catalog;
- architecture design;
- implementation plan;
- independent review report.

Jab tak koi material blocker, unresolved conflict, missing contract ya missing DB behavior ho, status **NOT READY FOR IMPLEMENTATION** rahega.

Sab gates pass hone par exact status likha jayega:

```text
READY FOR IMPLEMENTATION
```

## 15. Agent ko diya ja sakne wala task boundary

Current next task sirf ye hai:

```text
Phase 0 + Phase 1 complete karo.
Source inventory aur detailed requirements consolidation banao.
API catalog, architecture, implementation plan ya code abhi mat banao.
Missing/conflicting items ko report karo; guess mat karo.
```

## 16. Final principle

Is project mein “short summary” ko original requirement ka replacement nahi maana jayega. Har important rule, example, acceptance criterion aur source reference preserved rahega. Simplification sirf navigation ke liye hogi; information loss ke liye nahi.
