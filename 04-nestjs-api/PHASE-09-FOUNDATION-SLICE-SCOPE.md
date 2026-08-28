# Phase 09 — Foundation Slice Scope

यह Phase 09 का पहला implementation hand-off है। यह पूरा NestJS business API नहीं है; इसका उद्देश्य सुरक्षित और testable आधार बनाना है जिस पर domain modules बाद में जुड़ेंगे।

## Build order

```text
1. Project/bootstrap
   ↓
2. Config + secret validation
   ↓
3. Errors + validation
   ↓
4. Auth/request context
   ↓
5. UserContextClient / SystemClient
   ↓
6. Transaction + observability
   ↓
7. Health + graceful shutdown
   ↓
8. Foundation tests and independent review
```

## Boundary

Foundation में identity, company, candidate, job, application, referral, interview, messaging या notification का business behavior implement नहीं होगा। उन modules के लिए Phase 08 plan और उनके contract/gate लागू रहेंगे।

## Expected deliverables

- `04-nestjs-api/04-nestjs-api-app/` में NestJS source और test structure.
- `.env.example` जिसमें केवल variable names और safe placeholders हों.
- Config schema जो missing/invalid production settings पर startup fail करे.
- Safe logger/redactor और request correlation middleware/interceptor.
- Auth guard/request context abstraction.
- अलग user-context तथा trusted system database adapters.
- Transaction abstraction with rollback tests.
- Health/readiness controllers and shutdown hooks.
- Unit/integration/security test suites and a short implementation report.

## Do not do in this slice

- `service_role` secret commit या log नहीं करना.
- New SQL table/function/event/queue invent नहीं करना.
- Generic idempotency table in memory या ad-hoc बनाना नहीं.
- Cloud Tasks/FastAPI को open transaction के अंदर call नहीं करना.
- G-1 से पहले event producer बनाना नहीं.
- Deferred provider/product decision को silently choose नहीं करना.

## Handoff result

Implementation agent को पहले केवल Foundation slice पर काम करना है। वह business modules या Phase 10 जैसी अगली scope अपने-आप शुरू नहीं करेगा। हर phase-end पर files, tests, blockers और deviations report होंगे।
