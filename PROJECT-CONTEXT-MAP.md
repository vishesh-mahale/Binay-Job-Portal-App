# Binay Job Portal App — Project Context Map

[← Main README](README.md) · [Migration plan](MIGRATION-PLAN-HINGLISH.md) · [Coverage audit](MIGRATION-COVERAGE-AUDIT.md)

## 1. Purpose

यह file किसी developer या AI agent को जल्दी बताती है कि project क्या बना रहा है, final architecture क्या
है, कौन-सी documentation authority है और implementation शुरू करने से पहले क्या पढ़ना है। यह detailed
requirements/schema/service guides का replacement नहीं है; यह सही source तक navigation map है।

## 2. Repository transition status

```text
Binay-App
  = पुराना migration source/reference
  = final verification तक delete नहीं होगा
  = new implementation authority नहीं

Binay-Job-Portal-App
  = clean target repository
  = requirements और database migration complete
  = remaining application/services one-by-one audit/build होंगे
```

Current Supabase database testing environment है, production deployment नहीं। Old repository के numeric
SQL `01–18` review होकर new repository के `02-database/migrations/baseline/` में exact-copy migrate हो
चुके हैं। Clean Supabase testing database पर complete `01–18` rerun pass हुआ: 82 public tables और सभी
82 पर RLS enabled verify हुआ। Critical tables/functions/triggers भी present मिले। Detailed behavioral,
cross-user/cross-company RLS और service integration tests implementation के साथ अभी बाकी हैं। Production
freeze से पहले baseline SQL correct करके intended test DB को explicitly reset/rerun किया जा सकता है।

## 3. किस सवाल के लिए कौन authority है?

एक universal priority list अलग concerns को गलत तरीके से mix कर सकती है। इस map का rule:

| Question | Primary authority |
|---|---|
| Product क्या करना चाहिए? | Approved requirements और product decisions under `01-requirements/` |
| Architecture क्यों/कैसे चुनी? | Accepted ADRs और `docs/architecture/` guides |
| API/event/task payload क्या है? | Versioned root `contracts/` |
| Database actually क्या create करती है? | Target environment पर applied SQL और `02-database/migrations/baseline/` |
| Service implementation क्या करती है? | Owning component code + tests |
| Human explanation | Owning README/schema/service guide; executable truth का replacement नहीं |
| Old research/reviews | Input only; current source के against verify करना mandatory |

Conflict मिलने पर silently guess न करें। Requirement, ADR, contract, SQL, deployed test state और code का
exact conflict report करें।

## 4. Final folder map

```text
01-requirements/
02-database/
03-nextjs-web/                 # folder/code/docs बनना बाकी
04-nestjs-api/                 # guide migrated; code/tests बाकी
05-outbox-dispatcher-nestjs/  # component बनना बाकी
06-google-cloud-tasks/         # queue/IAM config बनना बाकी
07-fastapi-ai-worker/          # old code audit/refine/migrate करना बाकी
docs/architecture/
docs/adr/
docs/research/
contracts/
```

## 5. Current component status

| Component | Status | Start document |
|---|---|---|
| Requirements | Source migration/refinement complete; implementation validation continues | [Requirements README](01-requirements/README.md) |
| Database | `01–18` baseline + explanations + candidate-to-HR flow migrated; clean execution and 82/82 RLS coverage passed | [Database README](02-database/README.md) |
| Next.js | Folder/code/docs pending | Root plan only |
| NestJS API | Implementation guide migrated; application code pending | [NestJS README](04-nestjs-api/README.md) |
| Background architecture | Full guides migrated | [Architecture guide](docs/architecture/background-processing/BACKGROUND-WORKER-ARCHITECTURE-OPTIONS-HINGLISH.md) |
| Outbox Dispatcher | Architecture/plan ready; component code/config pending | [Implementation plan](docs/architecture/background-processing/BACKGROUND-WORKER-IMPLEMENTATION-PLAN-HINGLISH.md) |
| Google Cloud Tasks | Architecture/plan ready; queue/IAM config pending | Same implementation plan |
| FastAPI AI worker | Old code/reference inventory अभी audit होना है; clean component pending | Same implementation plan + AI research |

## 6. Current system architecture

```text
Next.js
   |
   v
NestJS API
   | auth + validation + authorization
   | BEGIN
   | business rows + audit/history + outbox_events
   | COMMIT
   v
Supabase PostgreSQL/Auth/private Storage
   |
   | outbox INSERT webhook (primary wake-up)
   v
NestJS Outbox Dispatcher on Cloud Run
   | claim bounded batch: FOR UPDATE SKIP LOCKED
   | deterministic task name
   v
Google Cloud Tasks Queue
   | rate limit + bounded retry + Google OIDC
   v
Private Cloud Run FastAPI Worker
   | parsing / OCR / AI / embeddings / projections
   v
Supabase worker-owned transaction
   | immutable result/evidence/projection
   | processed_events
   | optional chained outbox event

 Google Cloud Scheduler (`dev-outbox-recovery-sweep`)
   -> slow due/stuck recovery check only
   -> normal delivery path नहीं
```

Primary wake-up Supabase asynchronous Database Webhook है। Old NestJS post-commit wake-up final
correctness path नहीं है। Dispatcher lightweight separate NestJS/TypeScript service है। Cloud Tasks
Google-managed queue है; FastAPI private Cloud Run worker है।

## 7. Database file order और ownership

```text
01_extensions.sql
02_enums.sql
03_users_auth.sql
04_companies.sql
05_jobs.sql
06_documents.sql
07_resume_processing.sql
08_candidates.sql
09_applications.sql
10_interviews.sql
11_messaging.sql
12_notifications.sql
13_analytics.sql
14_subscriptions.sql
15_infrastructure.sql
16_indexes.sql
17_rls.sql
18_feedback.sql
```

[Production schema blueprint](02-database/schema-docs/PRODUCTION-SCHEMA-BLUEPRINT.md) domain ownership,
immutability और lifecycle rules explain करती है। Applied SQL actual schema state बताती है।

Current database verification:

```text
Baseline files present     = 18/18
Clean ordered execution    = passed
Public base tables         = 82
RLS-enabled tables         = 82
Missing critical objects   = none in completed smoke checks
```

[Candidate-to-HR visibility test flow](02-database/flows/CANDIDATE-TO-HR-VISIBILITY-TEST-HINGLISH.md)
fresh candidate/HR test data, projection, authorized search और browser-denial behavior के detailed
tests track करती है। उसके checkboxes clean rerun के बाद intentionally open हैं।

Database migration complete होने का अर्थ हर product feature implemented होना नहीं है। Current requirement
में recruiter saved-candidate bookmarks अभी approved baseline में missing हैं; यह old-file migration नहीं,
अलग reviewed schema/API/RLS implementation item है। Behavioral authorization और worker integration tests
भी code उपलब्ध होने पर complete होंगे।

## 8. Account और signup chain

Current role model single application role per account है:

```text
candidate | employer | hr | admin
```

Referral अलग role नहीं; eligible active authenticated user capability है। Current `user_roles` table
active नहीं है। Signup chain:

```text
Next.js -> NestJS signup -> Supabase auth.users
  -> on_auth_user_created / public.handle_new_user()
  -> public.users
  -> candidate role पर create_empty_candidate_profile()
  -> candidate_profiles
```

NestJS trigger-owned `public.users`/initial candidate row duplicate insert नहीं करेगी।

## 9. Job और candidate search

```text
Exact relational filters
+ PostgreSQL FTS
+ targeted pg_trgm
+ compatible pgvector semantic signal
-> explicit authorized hybrid ranking
```

Job `search_vector` DB triggers से relevant job/skill changes पर refresh होती है। Job AI profile/embedding
background worker बनाता है। Candidate source केवल `candidate_profiles` नहीं, canonical aggregate है:

- profile, skills, experiences, educations, projects;
- certifications, languages, awards और links।

Worker `candidate_search_profiles` में filters, `searchable_text`, `search_vector` और embedding rebuild
करता है। Stale revision newer projection overwrite नहीं कर सकती। Job/candidate/query embeddings compare
करने के लिए same compatible model/version/dimension/preprocessing contract चाहिए।

[Search strategy](02-database/schema-docs/SEARCH-STRATEGY.md) और
[query/index guide](02-database/schema-docs/supabase-query-index-use-approach.md) पढ़ें।

## 10. Resume और active-profile policy

```text
private upload -> uploaded_documents
-> security scan
-> resume_parsing_jobs
-> immutable parsed result/artifacts/evidence
-> approved downstream projection/merge action
```

AI output canonical profile silently overwrite नहीं करती। Candidate “Use as active profile resume” चुनता
है तो latest active resume parsed facts clearly-labelled searchable evidence की तरह projection enrich कर
सकते हैं; canonical facts editable/confirmed रहेंगी। Application-only/inactive resume global recruiter
search को affect नहीं करेगा। Exact policy:
[PD-002](01-requirements/product-decisions/PD-002-ACTIVE-RESUME-SEARCH.md)।

## 11. Applications

Registered:

```text
authenticated candidate + job
-> job_applications
-> same-user active application_documents
-> immutable submitted snapshot
-> initial status history
-> outbox event
```

Guest:

```text
active job-scoped guest upload session (locked)
-> same-session documents + guest application
-> immutable submitted snapshot + history + outbox
-> consume_guest_upload_session() in same transaction
-> optional verified guest_candidate_claim later
```

One candidate/normalized guest identity per `job_id` one application। Repost new `job_id`। Historical
application identity/snapshot/document links rewrite नहीं होंगे। Status changes controlled DB function से
current state + history + outbox atomically करती हैं।

## 12. Manual referral

[Full approved requirement](01-requirements/current/MANUAL-REFERRAL-REQUIREMENT.md)

```text
eligible active user manually enters candidate rows
-> one referral batch
-> valid referral invitations + hashed tokens + email outbox
-> recipient independently ignore/decline/Guest Apply/Register-and-Apply
-> application केवल recipient action के बाद
-> optional separate reward lifecycle
```

Invitation account, profile, document या application pre-create नहीं करती। Current production scope manual
entry है; CSV/ATS/contact import future scope है।

## 13. RLS और service boundaries

- Next.js privileged business writes सीधे Supabase पर नहीं करेगी; NestJS API use करेगी।
- NestJS authorization primary business policy; RLS defense in depth।
- Private storage path public URL नहीं; authorized signed access।
- Raw guest/referral tokens store/log नहीं; hashes only।
- Service role RLS bypass करती है, इसलिए server/worker least privilege और checks mandatory।
- Restricted FastAPI केवल worker-owned results/evidence/projections, `processed_events` और approved chained
  outbox events लिख सकती है; canonical merge rules bypass नहीं करेगी।

## 14. Old FastAPI code status

Old repo में:

- `Fast-Api/Fast-API-Service`: learning/in-memory CRUD reference, production component नहीं।
- `Fast-Api/Fast-API-Service-AI`: partial resume-parser reference; final worker contract नहीं।

Old AI service synchronous/stub/incomplete behavior को new `07-fastapi-ai-worker` में blindly copy नहीं
करना है। Database job claim/lease, Cloud Tasks OIDC, idempotency, immutable writes, processed events,
provider contracts और tests के अनुसार refine होगा।

## 15. Security warning

Old repository scan में potential hard-coded credential assignments वाली files मिली हैं। Values यहाँ
copy/print नहीं की गईं। FastAPI migration से पहले:

```text
identify without exposing
-> rotate/revoke as potentially compromised
-> tracked files/history से remove
-> secret manager/runtime environment use
-> automated secret scanning enable
```

किसी password, API key, service-role key, token या personal resume को new repository में migrate/commit
नहीं करना है।

## 16. Mandatory pre-change checklist

1. Root README, this map और `AGENTS.md` पढ़ें।
2. Relevant component README और linked approved requirement/decision पढ़ें।
3. Owning SQL/code/tests inspect करें; explanation को executable truth न समझें।
4. Source migration पर section/table/example coverage audit करें।
5. Original filename retain करें; rename से पहले user confirmation लें।
6. Testing और production migration lifecycle अलग रखें।
7. Secrets/sensitive data tool output, docs, logs या commits में expose न करें।
8. Change के साथ owning docs/contracts/tests/navigation sync करें।
9. Conflict पर guess नहीं; exact mismatch report करें।

## 17. Old context-map coverage audit

| Old section | Current treatment |
|---|---|
| Purpose/source-of-truth | Preserved और concern-specific authority model से corrected |
| Current system shape | Preserved और complete webhook/Dispatcher/Queue diagram में expanded |
| Database order/ownership | Exact `01–18` order preserved; detailed ownership blueprint linked |
| Repository/database status | Updated to completed baseline migration, clean execution and 82/82 RLS verification |
| Signup chain/account model | Preserved; prohibited terminology और active-role facts corrected |
| Job/search/resume flows | Preserved और current hybrid search/active-resume policy से expanded |
| Application/referral flows | Preserved |
| RLS/service boundaries | Preserved/expanded |
| FastAPI code status | Preserved as old-reference warning, not current component truth |
| Critical security finding | Preserved after value-safe scan; remediation explicit |
| Stale-material warning | Replaced by new repository classification/research/coverage links |
| Mandatory checklist | Preserved/expanded with filename and information-loss rules |

Old hard-coded paths और obsolete document names intentionally current links से replace किए गए। कोई useful
architecture flow silently remove नहीं किया गया।
