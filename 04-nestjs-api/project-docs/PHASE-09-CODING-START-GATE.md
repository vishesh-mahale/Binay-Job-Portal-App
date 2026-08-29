# Phase 09 — NestJS Coding Start Gate

Status: `FOUNDATION SLICE AUTHORIZED — FULL BUSINESS IMPLEMENTATION CONDITIONAL`

यह gate Phase 08 के approved implementation plan के बाद बनाया गया है। इसका मतलब है कि अब NestJS API का **shared foundation/scaffolding** शुरू किया जा सकता है। इसका मतलब यह नहीं है कि हर business endpoint या हर event producer बिना अगले gates के implement किया जा सकता है।

## 1. Authority

Implementation का क्रम और boundaries इन documents से तय होंगे:

1. [`AGENTS.md`](../AGENTS.md)
2. [`PHASE-05-FINAL-REQUIREMENTS.md`](PHASE-05-FINAL-REQUIREMENTS.md)
3. [`PHASE-06-API-CATALOG.md`](PHASE-06-API-CATALOG.md)
4. [`PHASE-07-ARCHITECTURE.md`](PHASE-07-ARCHITECTURE.md)
5. [`PHASE-08-IMPLEMENTATION-PLAN.md`](PHASE-08-IMPLEMENTATION-PLAN.md)
6. Approved decisions and executable database baseline `02-database/migrations/baseline/01–18`.

`Binay-App` reference-only है। किसी missing behavior को अनुमान से नहीं जोड़ा जाएगा।

## 2. Phase 08 completion evidence

- Requirements source inventory, consolidation, traceability, gap analysis और state-machine phases complete हैं।
- API catalog frozen है।
- Architecture approved है।
- Implementation plan independent revalidation के बाद approved है।
- Phase 08 final revalidation reports `s1/phase8/` में उपलब्ध हैं।

## 3. अभी authorized Foundation slice

Phase 09 के पहले slice में केवल ये shared capabilities बनाई जा सकती हैं:

- NestJS application bootstrap और environment validation.
- Structured error envelope और approved API error vocabulary.
- Authentication token verification और request user context.
- `UserContextClient` और server-only `SystemClient` का अलग dependency boundary.
- Trusted database connection/pool और transaction wrapper.
- Health/readiness checks.
- Request correlation, structured logging, metrics hooks और safe redaction.
- Common validation, authorization guard interfaces और graceful shutdown.
- Foundation unit tests, configuration tests, security-boundary tests और database connectivity tests.

Foundation code में कोई business endpoint, invented table, event, queue, provider या generic in-memory idempotency guarantee नहीं जोड़ी जाएगी।

## 4. Conditional gates for business modules

| Gate | Requirement | Effect |
|---|---|---|
| G-1 | Shared event envelope/producer reconciliation | किसी event producer को implement करने से पहले close करना होगा। |
| Generic idempotency | Durable key, fingerprint, response reference और retention के लिए approved forward migration/design | Generic command idempotency पर निर्भर endpoint तब तक नहीं बनेगा; existing domain keys ही use होंगे। |
| Provider/product decisions | AI provider, email/template, subscription और configurable referral gaps | संबंधित modules deferred/TBD रहेंगे; fake adapter नहीं बनेगा। |
| Phase-09 SLO gate | Throughput, p95, error rate, memory और queue-lag thresholds | Load test pass होने तक production readiness claim नहीं होगा। |
| Contract gate | हर producer payload अपने versioned JSON Schema से validate होगा | Contract से बाहर payload पर implementation रुकेगी। |

## 5. Mandatory implementation rules

- Browser कभी Supabase trusted credential नहीं पाएगा।
- User-context reads और system/trusted writes के clients अलग injectable boundaries में रहेंगे।
- Business transaction में external Cloud Tasks, FastAPI, email या realtime network call नहीं होगा।
- Business row, audit/history और approved outbox event एक ही transaction में होंगे।
- Unknown/unrouted event fail-closed रहेगा।
- Expected revision, idempotency और deterministic lock-order rules Phase 08 matrix के अनुसार लागू होंगे।
- Logs में tokens, passwords, PII, raw resume text, signed URLs या secrets नहीं होंगे।
- हर meaningful code/schema change के साथ owning tests, contracts/ADR और README navigation sync की जाएगी।

## 6. Exit criteria for Foundation slice

Foundation slice तभी complete माना जाएगा जब:

- clean install/build/typecheck pass हो;
- configuration fail-fast और secret-redaction tests pass हों;
- JWT/request-context और trusted-client separation tests pass हों;
- transaction rollback/no-external-call-in-transaction test pass हो;
- liveness/readiness और graceful shutdown tests pass हों;
- unit/integration/security test results recorded हों;
- independent review report में कोई unresolved high-severity finding न हो।

## 7. Current status

```text
PHASE 09 FOUNDATION SLICE: IMPLEMENTED — INDEPENDENT REVALIDATION PENDING
CURRENT STATE: FOUNDATION TESTS PASS; CLEAN STANDALONE INSTALL AND INDEPENDENT REVIEW PENDING
FULL BUSINESS ENDPOINT CODING: CONDITIONAL ON G-1 / DOMAIN GATES
PRODUCTION READY: NO — TESTS AND DEPLOYMENT GATES REMAIN
```
