# Stage 1 — Four Security-Scan Decisions: Consolidated Result

Date: 2026-08-25
Status: `FOUR DECISIONS USER-APPROVED — STAGE 1 FREEZE GATES PENDING`

## Scope

यह file `s1/stage1/4questions andwer.md` में दिए गए Antigravity और FreeBuf answers,
Stage-1 agent reports और Codex के independent repository cross-check को consolidate
करती है। कोई code, SQL या contract इस pass में modify नहीं किया गया है।

## Repository evidence and authoritative boundary

- `02-database/migrations/baseline/06_documents.sql` में `security_scan_status`,
  `security_scan_result` और scan-queue index मौजूद हैं।
- `contracts/events/security-scan-requested.v1.json` upload के बाद का outbox event
  define करता है।
- `PD-002-ACTIVE-RESUME-SEARCH.md` और `NESTJS-IMPLEMENTATION-GUIDE.md` clean scan के
  बाद parsing तथा live status/recovery की दिशा define करते हैं।
- Dispatcher route registered होना FastAPI handler implemented होने का proof नहीं है।
  हर implementation claim executable code से verify होगा।

## Consolidated end-to-end boundary

```text
Next.js
  ↓
NestJS upload validation + private storage + DB/outbox transaction
  ↓ HTTP 202
Outbox Dispatcher → security-scan-queue
  ↓
FastAPI dedicated security-scan handler → ClamAV provider
  ↓
clean → guarded DB transaction → resume.parse.requested
infected/failed → parsing blocked + retry/dead-letter policy
```

Full scanner upload HTTP request को block नहीं करेगा और scanner call खुले PostgreSQL
transaction के अंदर नहीं होगी।

## Agent recommendation comparison

| Decision | Antigravity | FreeBuf | Codex conclusion |
|---|---|---|---|
| ClamAV location | Separate Cloud Run service | Same FastAPI Cloud Run container | Current scope में FastAPI worker का dedicated scanner module/provider; separate service को अभी freeze नहीं करेंगे |
| Task payload | `document_id` + bucket/path + metadata | Only `document_id` | Only `aggregate_id/document_id`; worker DB से storage metadata पढ़े |
| Clean transition owner | FastAPI scan handler | FastAPI scan handler | FastAPI scan handler; scanner call transaction के बाहर, result/handoff एक transaction में |
| Result JSON | Large clean/infected objects | Standardized schema incl. error | Versioned compact schema; status और verdict अलग रखें; raw content/PII नहीं |

## Decision 1 — ClamAV deployment

### Final recommendation

```text
FastAPI AI Worker
  └── dedicated security_scan module
        └── ScannerProvider interface
              ├── ClamAVScannerProvider (local, pre-prod, production)
              └── MockScanner (automated unit/contract tests only)
```

Local, pre-prod और production में एक ही ClamAV provider direction रखें। Local में
ClamAV Docker container से चलेगा और production में वही pinned provider/runtime
configuration के साथ चलेगा। पहले implementation में ClamAV को इसी FastAPI worker
service के भीतर dedicated provider/module के रूप में रखें। अभी अलग
`clamav-scanner-service` बनाना freeze नहीं किया जाएगा, क्योंकि उससे नया service,
IAM, deployment और network path जुड़ता है।

यह recommendation तभी लागू होगी जब resource/load test पास हों। यदि AI और scanner
workload एक-दूसरे को प्रभावित करें, तो वही provider contract रखते हुए scanner को
अलग private Cloud Run service में निकाला जा सकेगा।

### Mandatory operational rules

- ClamAV image/package version सभी environments में pin होगी; `latest` नहीं।
- Signature updates (`freshclam` या approved update process) monitored होंगे।
- Memory/CPU और scan timeout load test से तय होंगे।
- Mock scanner normal local/pre-prod/production flow में selectable नहीं होगा; केवल
  automated tests में explicit test dependency के रूप में रहेगा।
- Scanner unavailable होने पर fail-open नहीं होगा।
- ClamAV software free/open-source है; Cloud Run resources, signature updates और
  operations का cost अलग रहेगा।

### Status

Direction approved; exact resource sizing और deployment configuration Stage 6/7
implementation planning में verify होंगे।

## Decision 2 — Security-scan task payload

### Final recommendation

Task payload में केवल uniform task identity रहे:

```json
{
  "schema_version": 1,
  "event_id": "<uuid>",
  "aggregate_id": "<uploaded_document_uuid>",
  "trace_id": "<uuid>"
}
```

`aggregate_id` ही `document_id` है। `storage_bucket`, `storage_path`, signed URL,
file bytes, credentials या raw resume content task payload में नहीं जाएगा।

Worker `uploaded_documents` से authoritative storage metadata पढ़ेगा और private
server-side credentials से object fetch करेगा। इससे stale/forged path और signed URL
expiry का risk नहीं रहेगा।

### Status

यह decision repository के existing uniform task payload और payload-opacity rule से
supported है। Stage 2 में `contracts/tasks/security-scan-task.v1.json` बनाकर registry
में event contract की जगह task contract reference करना होगा।

## Decision 3 — Clean-scan atomic transition owner

### Final recommendation

Owner: **FastAPI dedicated security-scan handler**। NestJS callback और Dispatcher में
business transition नहीं जाएगी।

Flow:

```text
Task received
  ↓
processed_events duplicate check / document claim
  ↓
Private object read + scanner call (DB transaction के बाहर)
  ↓
BEGIN
  guarded uploaded_documents status/result update
  अगर clean:
      resume_parsing_jobs insert
      resume.parse.requested outbox insert
  processed_events insert
COMMIT
```

Guard यह सुनिश्चित करेगा कि एक ही document के लिए duplicate scan clean-to-parse
handoff दोबारा न बनाए। Exact SQL function/guard और `resume_parsing_jobs` required
fields Stage 2 contract/implementation plan में executable schema से तय होंगे; कोई
function name अभी invent नहीं किया जाएगा।

### Failure behavior

- `clean` → parse handoff
- `infected` → parsing blocked, document terminal security outcome
- timeout/unavailable → retryable `failed`, infected नहीं
- retry exhaustion → approved recovery/dead-letter path

## Decision 4 — `security_scan_result` JSON shape

### Final recommendation

`security_scan_status` database lifecycle का authoritative field रहेगा। JSONB केवल
auditable scanner metadata रखेगा:

```json
{
  "schema_version": 1,
  "verdict": "clean",
  "scanner": {
    "provider": "clamav",
    "engine_version": "<pinned-version>",
    "signature_version": "<signature-version>"
  },
  "scanned_at": "2026-08-25T12:00:00Z",
  "duration_ms": 342,
  "file_size_bytes": 1048576,
  "checksum_sha256": "<sha256>",
  "threats": [],
  "error": null
}
```

Allowed `verdict` values:

```text
clean | infected | error
```

Rules:

- `security_scan_status = clean` ⇒ `verdict = clean`, `threats = []`
- `security_scan_status = infected` ⇒ `verdict = infected`, threat names only;
  raw file content नहीं
- `security_scan_status = failed` ⇒ `verdict = error`, bounded `error_code` और
  safe message; secrets, paths और PII नहीं
- `security_scan_result` में resume text, credentials या signed URLs नहीं होंगे
- Exact JSON Schema Stage 2 में `security-scan-result.v1.json` के रूप में freeze होगा

## What is approved now

```text
Async scan                    ✅
FastAPI dedicated scan owner   ✅
Clean-before-parse             ✅
Document-ID-only task payload ✅
Fail-closed behavior           ✅
Versioned audit result shape   ✅ direction
ClamAV provider abstraction    ✅
```

## User approval record

User ने चारों consolidated decisions approve किए हैं:

1. Local/pre-prod/production में ClamAV provider direction
2. Document-ID-only security-scan task payload
3. FastAPI security-scan handler द्वारा clean-to-parse ownership
4. Versioned `security_scan_result` audit structure

यह approval architecture decision को freeze करने के लिए है। Contract creation,
registry correction, recovery ownership और implementation gates अभी बाकी हैं।

## Still required before Stage 1 freeze

1. User approval of the four recommendations in this file.
2. Stage 2 task contract creation and registry reference correction.
3. Existing `storage_url` event-contract field को document-ID-only task boundary के
   साथ align करना।
4. Stale `scanning` recovery और retry-exhaustion ownership लिखना।
5. Queue provisioning artifact/evidence verify करना।
6. Dedicated FastAPI handler/provider implementation को Stage 7 task के रूप में
   track करना; अभी implementation को “done” नहीं कहना।

## Final Codex verdict

Agents का core technical consensus सही है:

```text
FastAPI handler owns the clean→parse transaction.
Task payload must not carry signed URLs or storage paths.
```

लेकिन ClamAV को separate service या same container के रूप में बिना load/ops evidence
के “100% production-ready” कहना सही नहीं है। Current recommendation same FastAPI
service के dedicated provider से शुरू करने की है, with a contract-compatible future
extraction path.

## Non-negotiable security and reliability rules

1. `security_scan_status != clean` होने पर parsing शुरू नहीं होगी।
2. Scanner timeout/unavailable को infected नहीं माना जाएगा; retryable failure होगा।
3. Parser database से clean status re-check करेगा; यह दूसरा antivirus scan नहीं है।
4. Duplicate scan task idempotent रहेगा और clean-to-parse handoff दोबारा नहीं बनेगा।
5. Browser को service-role key, signed URL, token या raw resume content task payload में
   नहीं मिलेगा।
6. SSE केवल live update है; database status और REST recovery authoritative रहेंगे।
7. Parsed result candidate confirmation से पहले canonical profile को silently update
   नहीं करेगा।
8. Scan result/logs में secrets, credentials, raw file content या unnecessary PII नहीं
   आएगी।

## Stage-1 verification checklist

- [ ] `06_documents.sql` states/transitions और scan queue behavior compatible
- [ ] Event contract और dedicated task contract boundary स्पष्ट
- [ ] Dispatcher route/queue और FastAPI trust boundary verified
- [ ] ClamAV provider, pinned versions, resource limits और signature updates defined
- [ ] Retry, idempotency, stale recovery और dead-letter behavior defined
- [ ] PII/secrets/logging rules verified
- [ ] Existing code claims versus actual executable code cross-checked

## Stage-1 freeze gate

Stage 1 को `FROZEN` कहने से पहले ये items पूरे होने चाहिए:

1. Four recommendations पर user approval recorded हो।
2. `contracts/tasks/security-scan-task.v1.json` और registry reference plan हो।
3. Existing `storage_url` event-contract field को document-ID-only task boundary के
   साथ align करने का resolution दर्ज हो।
4. Stale `scanning` recovery और retry-exhaustion ownership दर्ज हो।
5. Queue provisioning और OIDC/private-worker prerequisites verify हों।
6. Dedicated FastAPI handler/provider को implementation-pending के रूप में track किया
   गया हो; उसे “done” न कहा जाए।

इन gates के बाद Stage 2 contract finalization शुरू होगी।

## Merged audit crosswalk (previous Codex consolidation)

पुरानी `stage-01-CONSOLIDATED-STAGE-01-SECURITY-SCAN-DECISION.md` की audit
findings इस final file में preserve हैं। नीचे उसका gap-to-decision crosswalk है:

| Previous gap | Final treatment |
|---|---|
| GAP-S1-01 — FastAPI security-scan handler missing | Stage 7 implementation task; अभी “done” नहीं |
| GAP-S1-02 — Event contract used as task contract | Stage 2 में dedicated task contract और registry fix |
| GAP-S1-03 — Signed URL/storage payload conflict | Document-ID-only task payload approved direction |
| GAP-S1-04 — Clean→parse transition owner | FastAPI scan handler; scanner बाहर, guarded DB transaction अंदर |
| GAP-S1-05 — Stale `scanning` recovery | Retry/recovery ownership Stage 1 freeze gate में pending |
| GAP-S1-06 — Retry exhaustion owner | Explicit recovery/dead-letter decision pending |
| GAP-S1-07 — Idempotency ordering | Scan result/handoff और `processed_events` एक transaction में |
| GAP-S1-08 — Storage compensation | Orphan-object cleanup policy implementation planning में |
| GAP-S1-09 — ClamAV deployment/provider | Same FastAPI provider direction; resource/load evidence pending |
| GAP-S1-10 — Scan result audit shape | Versioned JSON direction; Stage 2 schema contract |
| GAP-S1-11 — Parsed output contract missing | `candidate.resume.parsed.v1.json` Stage 2 में बनेगा |
| GAP-S1-12 — UI state mapping | API-layer mapping; DB enums में invented `review_ready` नहीं |

### Preserved verified facts

- Database scan states और `security_scan_result` JSONB support मौजूद है।
- Dispatcher security route registered है, लेकिन route registration handler existence
  का proof नहीं है।
- Parser clean status को database से re-check करता है और pending/infected states को
  fail-closed रखता है।
- Existing worker में leases, `processed_events`, OIDC और PII redaction patterns
  मौजूद हैं; security-scan handler/provider फिर भी अलग से implement होना बाकी है।
- SSE live optimization है और REST/database authoritative recovery है।

इस appendix का उद्देश्य previous audit evidence को खोने से बचाना है; authoritative
decisions इसी merged document के ऊपर वाले sections में हैं।

यह file user approval के बाद Stage-1 decision document में sync की जाएगी। उसके बाद
Stage 2 contract finalization शुरू होगा।
