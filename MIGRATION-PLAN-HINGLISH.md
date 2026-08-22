# Binay Job Portal — Clean Repository Migration Plan

[← Main project README](README.md)

## 1. हम यह काम क्यों कर रहे हैं?

पुराने `Binay-App` folder में current requirements, पुराने reviews, duplicate
explanations, reference projects, experiments और production-oriented files mix हो
गए हैं। इससे किसी नए developer या AI agent के लिए यह तय करना कठिन होता है कि:

- current requirement कौन-सी है;
- कौन-सा architecture final है;
- कौन-सी file केवल पुराना reference है;
- किस code को requirement के against validate करना है।

इसलिए नया `Binay-Job-Portal-App` clean और navigable repository होगा।

## 2. सबसे important migration rule

```text
Binay-App
= पुराना working/reference source
= migration पूरी होने तक delete नहीं होगा

Binay-Job-Portal-App
= नया clean project
= केवल reviewed और approved content आएगा
```

शुरुआत में old files को source से move/delete नहीं करेंगे। Relevant information को
पहले review करके clean destination में copy/refine करेंगे।

## 3. Final planned folder structure

```text
Binay-Job-Portal-App/
├── README.md
├── AGENTS.md
├── MIGRATION-PLAN-HINGLISH.md
│
├── 01-requirements/
│   ├── current/
│   ├── future/
│   ├── product-decisions/
│   └── README.md
│
├── 02-database/
│   ├── migrations/
│   │   ├── baseline/
│   │   └── changes/
│   ├── schema-docs/
│   ├── supabase-config/
│   ├── seeds/
│   ├── tests/
│   ├── flows/
│   └── README.md
│
├── 03-nextjs-web/
│   ├── src/
│   ├── tests/
│   ├── docs/
│   └── README.md
│
├── 04-nestjs-api/
│   ├── src/
│   ├── tests/
│   ├── docs/
│   └── README.md
│
├── 05-outbox-dispatcher-nestjs/
│   ├── src/
│   ├── tests/
│   ├── docs/
│   └── README.md
│
├── 06-google-cloud-tasks/
│   ├── queue-config/
│   ├── iam/
│   ├── deployment/
│   └── README.md
│
├── 07-fastapi-ai-worker/
│   ├── app/
│   ├── tests/
│   ├── docs/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── README.md
│
├── docs/
│   ├── adr/
│   └── architecture/
│
└── contracts/
    ├── api/
    ├── events/
    ├── tasks/
    └── README.md
```

Folders पहले से खाली बनाकर नहीं भरेंगे। जिस component पर काम शुरू होगा, उसी समय
उसका folder और README बनाएँगे।

## 4. हर component के लिए same step-by-step process

```text
Step 1: Binay-App में relevant source files identify करना
Step 1A: Original filename retain करना; rename चाहिए तो user confirmation लेना
Step 2: Current, duplicate, outdated और future content classify करना
Step 3: Source के हर section/table/example की coverage list बनाना
Step 4: Executable code/schema से facts verify करना
Step 5: Clean requirement और architecture documents लिखना
Step 6: Coverage में हर item को preserved/updated/moved/rejected-with-reason map करना
Step 7: Required code/schema destination में copy/refine करना
Step 8: Internal cross-file और information-loss validation करना
Step 9: दूसरे agent से independent review करवाना
Step 10: Tests/run करके behavior verify करना
Step 11: Component completion checklist close करना
Step 12: Root README में final links update करना
```

एक component complete और verified होने के बाद ही अगला component शुरू होगा।

## 5. Component order

```text
1. Requirements
2. Database
3. Next.js Web
4. NestJS API
5. NestJS Outbox Dispatcher
6. Google Cloud Tasks Queue configuration
7. FastAPI AI Worker
```

Requirements पहले आएँगी ताकि बाकी हर service को उन्हीं approved requirements के
against implement और validate किया जा सके। Database उसके बाद आएगा क्योंकि NestJS,
FastAPI और search/background flows उसके contract पर depend करते हैं।

Cross-cutting ADRs और contracts संबंधित component के साथ बनेंगे; इन्हें अलग service
नहीं माना जाएगा।

## 6. Source-of-truth और conflict rule

```text
Approved product requirement
→ Approved ADR और shared contract
→ Executable migration/application code
→ Automated/manual tests
→ Explanatory documentation
```

यह intent-to-implementation order है। Deployed database की actual operational state
उसकी successfully applied migrations बताती हैं। अगर requirement, ADR, contract,
deployed schema या code में conflict मिले तो agent अपनी तरफ से guess नहीं करेगा;
वह exact conflict report करके decision माँगेगा। पुराना `Binay-App` केवल reference
और migration evidence है, नई repository का authority नहीं।

Database में duplicate SQL truth नहीं रखेंगे:

```text
02-database/migrations
= authoritative executable history

migrations/baseline
= verified existing 01–18 Supabase baseline

migrations/changes
= production baseline freeze/deployment के बाद ordered forward-only changes

02-database/schema-docs
= human explanations/diagrams; executable SQL की duplicate copy नहीं
```

## 7. Documentation navigation standard

```text
Root README
→ Component README
→ Detailed document
```

Root README में सभी component READMEs के links होंगे। Component README में उस
component की requirements, architecture, flows, code और tests के links होंगे। हर
deep document में वापसी navigation होगी:

```markdown
[← Component README](../README.md) · [Main project](../../README.md)
```

## 8. हर component README का standard format

हर service/component README में ये sections होंगे:

1. Purpose
2. Responsibilities
3. What this component does not own
4. Inputs and outputs
5. Database tables used
6. Main flow diagram
7. Environment/configuration
8. Security and authorization rules
9. Failure and retry handling
10. How to run
11. How to test
12. Current limitations
13. Future requirements
14. Authoritative source links

## 9. Service boundaries

### NestJS API

Main business API, authentication, authorization और transactional workflows।

### Next.js Web

UI और browser experience; privileged service-role database access नहीं।

### Outbox Dispatcher — NestJS

Pending outbox events को reliably claim करके appropriate Google Cloud Tasks Queue
में publish करेगा। AI work नहीं करेगा। Responsibility stable है; wake mechanism
ADR/configuration में documented होगा। Current finalized mechanism:

```text
Primary wake          = Supabase asynchronous INSERT webhook
Recovery wake         = Google Cloud Scheduler का 10-minute due/stuck check
Post-commit wake-up   = required/primary path नहीं
```

### Google Cloud Tasks Queue

यह हमारा coded service नहीं, Google-managed queue है। इसके folder में queue
configuration, rate/concurrency limits, retries, IAM/OIDC और deployment instructions
होंगी।

### FastAPI AI Worker

Resume parsing, OCR/AI, candidate/job embeddings और worker-owned result/projection
writes। Candidate canonical facts को approved merge policy के बाहर overwrite नहीं
करेगा।

### Supabase

Supabase अलग application-service folder नहीं होगा। संबंधित ownership के अनुसार:

```text
Database schema/RLS/Cron/config
→ 02-database

Webhook to Dispatcher configuration
→ 05-outbox-dispatcher-nestjs और 02-database/supabase-config

Cloud Tasks IAM/config
→ 06-google-cloud-tasks
```

## 10. क्या सीधे copy नहीं करना है?

- पुराने ChatGPT/agent reviews;
- removed tables/columns वाली explanations;
- duplicate architecture documents;
- third-party cloned repositories;
- generated caches और IDE metadata;
- personal resumes या credentials;
- unverified sample code;
- secrets/API keys/tokens।

Useful knowledge हो तो उसे approved destination document में merge करके original
reference को बाद में retire करेंगे।

`OUTDATED` classification का कोई destination folder नहीं होगा:

```text
CURRENT               → 01-requirements/current
FUTURE                → 01-requirements/future
PRODUCT DECISION      → 01-requirements/product-decisions
ARCHITECTURE DECISION → docs/adr
OUTDATED              → new repository में migrate नहीं होगा
```

## 11. Shared contracts

NestJS API, Dispatcher, Cloud Tasks और FastAPI के बीच exchange होने वाला data किसी
एक service की private documentation नहीं होगा:

```text
contracts/api     → OpenAPI/API request-response contracts
contracts/events  → outbox event names, versions और payload schemas
contracts/tasks   → Cloud Tasks HTTP payload, auth और response rules
```

जहाँ practical हो contract machine-readable OpenAPI/JSON Schema होगा और उसके साथ
short explanation रहेगी। Breaking change के लिए नया contract version चाहिए।

## 12. Architecture Decision Records (ADR)

Requirement बताती है **क्या चाहिए**; ADR बताती है technical approach **क्यों चुनी**।

```text
ADR: Supabase PostgreSQL
ADR: PostgreSQL FTS + pgvector
ADR: Transactional outbox
ADR: Supabase webhook + Google Cloud Scheduler recovery
ADR: Google Cloud Tasks Queue
ADR: Separate FastAPI AI worker
```

हर ADR का status `proposed / accepted / superseded / rejected` होगा। Accepted ADR
बदलने पर नया ADR पुराने को supersede करेगा; history silently rewrite नहीं होगी।

## 13. दूसरे agent से validation कैसे होगी?

हर component इतना self-contained होगा कि दूसरे agent को केवल यह देना पड़े:

```text
Component README
+ linked requirements/decisions
+ component code
+ related database contract
+ tests
```

Review questions:

- क्या implementation approved requirement पूरी करती है?
- क्या service boundary violate हो रही है?
- क्या security, retry और idempotency rules लागू हैं?
- क्या docs और code sync में हैं?
- क्या tests expected flow prove करते हैं?

## 14. पुराना Binay-App कब delete होगा?

केवल तब जब:

- सभी seven areas migrate और validate हो जाएँ;
- root README के सभी links काम करें;
- कोई authoritative requirement केवल old folder में न बचे;
- production code और tests नए repository से चलें;
- Git history/backup सुरक्षित हो;
- final cross-repository search में unresolved references न मिलें;
- project owner final deletion approve करे।

तब भी पहले recoverable backup/archive verify करेंगे, उसके बाद ही old folder remove
करेंगे।

## 15. अगला छोटा step

`01-requirements/` clean migration complete होने के बाद independent review कराया
जाएगा। Review findings resolve और requirement set approve होने तक `02-database/`
start नहीं होगा। अगला component database है, लेकिन केवल explicit approval के बाद।
