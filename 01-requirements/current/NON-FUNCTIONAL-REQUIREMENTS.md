# Non-Functional Requirements

[← Requirements index](../README.md) · [Main project](../../README.md)

## 1. Availability and resilience — APPROVED

- Database commit के बाद accepted background work silently lose नहीं होना चाहिए।
- External provider/service temporary failure retryable हो।
- Duplicate event/task delivery business result duplicate न बनाए।
- Permanent failure auditable और replayable हो।
- One component outage processing delay कर सकती है, committed user data नहीं मिटाए।

Exact outbox/queue implementation ADR और component contracts में define होगी।

## 2. Scale — APPROVED TARGET

- System लगभग 1000 near-simultaneous resume uploads safely accept/store/queue कर सके।
- इसका अर्थ 1000 expensive AI calls एक साथ चलाना नहीं है। Processing controlled
  concurrency, backpressure और provider limits follow करेगी।
- API instances, background workers और search components independently scale कर सकें।
- List/search endpoints pagination और bounded queries use करें।

Load-test workload, file sizes और success/latency thresholds FastAPI/infrastructure
phase में measurable contract के रूप में freeze होंगे।

## 3. Performance — APPROVED DIRECTION

- Normal API requests deep parsing/embedding का wait न करें।
- Common search/filter queries indexes और query plans से verified हों।
- UI progress/status asynchronous processing reflect करे।
- Large uploads streaming/direct-storage pattern use करें; whole file unnecessary
  memory buffering avoid हो।

Exact SLO/percentile numbers अभी `NEEDS_DECISION` हैं।

## 4. Security and privacy — APPROVED

- TLS-encrypted communication;
- secure Supabase authentication/session handling;
- NestJS primary authorization और database RLS defense-in-depth;
- tenant/company/resource ownership checks;
- private document storage और short-lived authorized access;
- raw passwords/tokens/API keys कभी application DB/log/docs में नहीं;
- guest/referral tokens hashed और expiring;
- upload MIME/signature/size/malware validation;
- rate limiting और abuse prevention;
- audit/security logging;
- least-privilege server/worker roles;
- sensitive candidate/contact data का purpose-limited access और retention।

Applicable legal retention/privacy rules deployment jurisdiction/client decision के
साथ separately approve होंगी।

## 5. Data integrity and auditability — APPROVED

- Foreign keys, uniqueness और lifecycle invariants database में जहाँ practical हों।
- Historical evidence/snapshots/events append-only या controlled immutable हों।
- Editable canonical state soft-delete/version semantics follow करे।
- Multi-row business operation atomic transaction हो।
- Derived search/embedding data source of truth न बने और rebuildable हो।
- User/system actor, timestamps और relevant source/version traceable हों।

## 6. AI quality and cost controls — APPROVED DIRECTION

- Provider calls timeouts, bounded retries और usage monitoring use करें।
- Structured output schema validation mandatory हो।
- Job और candidate similarity vectors compatible embedding space use करें।
- Model/provider/version metadata store हो जहाँ result reproducibility पर असर पड़ता है।
- AI cost monitor और concurrency/rate limits configured हों।
- Provider switch possible हो, लेकिन untested automatic fallback semantic quality
  silently न बदले।

“Zero infrastructure cost for more than one year” guarantee approved requirement
नहीं है। Goal cost-efficient architecture और measurable budget alerts है।

## 7. Maintainability and agent-readiness — APPROVED

- हर component का clear ownership, README, contract और tests हों।
- Shared API/event/task schemas root contracts में versioned हों।
- Architecture choices ADRs में हों।
- Duplicate executable schema/contract copies न हों।
- Outdated source new repository में migrate न हो।
- Docs/code conflict पर agent guess नहीं करे; conflict report करे।

## 8. Observability — APPROVED DIRECTION

- Correlation/request/event IDs across API, outbox, task और worker;
- structured logs without sensitive payload leakage;
- queue depth, oldest pending, retry/dead-letter, worker latency/error, parsing
  success और projection lag metrics;
- security/auth failures और cost anomalies alerts;
- health/readiness endpoints for deployed services।

## 9. Accessibility and usability — PLANNED

- Responsive interfaces और keyboard/screen-reader-friendly controls;
- clear validation/error/progress states;
- minimal onboarding और explicit candidate consent;
- recruiter match results में source/trust/explanation जहाँ relevant हो।

Exact WCAG target UI phase में approve होगा।
