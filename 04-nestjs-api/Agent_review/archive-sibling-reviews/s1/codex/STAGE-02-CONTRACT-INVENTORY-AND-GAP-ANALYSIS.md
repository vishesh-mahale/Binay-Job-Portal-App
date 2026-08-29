# Stage 2 — Contract Inventory और Gap Analysis

Status: `DRAFT — AGENT REVIEW PENDING`
Date: 2026-08-25

## उद्देश्य

First-resume security scan और parsing flow से जुड़े event/task/output contracts को
audit करना। इस draft में existing files और gaps record हैं; अभी कोई contract edit
नहीं किया गया है।

## Authority

1. `AGENTS.md`
2. Approved Stage-1 consolidated decision
3. Executable database baseline (`06_documents.sql`, `07_resume_processing.sql`, `15_infrastructure.sql`)
4. `contracts/` files
5. Dispatcher और FastAPI executable code

## Existing contract inventory

### Event contracts

| Contract | Current observation | Status |
|---|---|---|
| `security-scan-requested.v1.json` | Full outbox envelope; `payload.storage_url` required | Needs alignment |
| `resume-parse-requested.v1.json` | Existing event contract; draft-07 and flat task-like fields | Needs envelope review |
| `candidate-profile-changed.v1.json` | Existing candidate event | Verify producer/task boundary |
| `candidate-projection-rebuilt.v1.json` | Existing event contract | Verify route/consumer boundary |
| `candidate-resume-parsed.v1.json` | Missing, जबकि worker output event documented/emitted | Required gap |

### Task contracts

Existing task contracts uniform payload pattern use करते हैं:

```json
{
  "schema_version": 1,
  "event_id": "<uuid>",
  "aggregate_id": "<uuid>",
  "trace_id": "<uuid>"
}
```

Existing task files:

- `resume-parse-task.v1.json`
- `candidate-projection-task.v1.json`
- `job-enrich-task.v1.json`
- `match-analyze-task.v1.json`
- `interview-summary-task.v1.json`
- `job-screening-questions-task.v1.json`

Missing task contract:

```text
contracts/tasks/security-scan-task.v1.json
```

## Dispatcher registry mismatch

Current security route:

```text
event_type:   security.scan.requested
queue:        security-scan-queue
endpoint:     /internal/tasks/security/scan
taskContract: contracts/events/security-scan-requested.v1.json
```

यह बाकी routes के pattern से अलग है। Dispatcher Cloud Task में uniform task payload
भेजता है, इसलिए event contract को task contract की तरह reference नहीं करना चाहिए।

Proposed correction, अभी approval pending:

```text
taskContract: contracts/tasks/security-scan-task.v1.json
```

## Storage payload conflict

Stage-1 decision के अनुसार task payload में केवल `aggregate_id/document_id` रहेगा।
लेकिन current event contract में required `payload.storage_url` है। Signed URL/path
security और expiry concerns create करता है। Proposed direction:

```text
Task payload: document_id/aggregate_id only
Worker: uploaded_documents से storage metadata पढ़े
Worker: trusted server-side credentials से private object fetch करे
```

Event contract में `storage_url` का final treatment Stage 2 review और approval के बाद
तय होगा। अभी existing file modify नहीं होगी।

## Envelope और schema-version gap

Current affected contracts में JSON Schema draft versions अलग हैं:

- `security-scan-requested.v1.json` — draft 2020-12
- `resume-parse-requested.v1.json` — draft-07

Stage 2 में एक approved convention चुननी होगी। Breaking change होने पर silent
mutation नहीं; नया version contract बनाना होगा।

## Aggregate ID semantics

Security scan event का aggregate uploaded document UUID होना चाहिए:

```text
aggregate_type = uploaded_document
aggregate_id   = uploaded_documents.id
```

Task payload में यही `aggregate_id` worker के लिए document identity होगा। इसे
`AGGREGATE-ID-SEMANTICS.md` और producer contract से cross-check करना होगा।

## Output और result-schema gaps

FastAPI resume parsing flow से `candidate.resume.parsed` output event का reference
मिलता है, लेकिन shared contract file missing है:

```text
contracts/events/candidate-resume-parsed.v1.json
```

Stage-1 recommended `security_scan_result` shape में `schema_version`, `verdict`,
scanner/provider/version, timestamp, duration, checksum, threats और bounded error
metadata होंगे। Exact validation schema proposed है:

```text
contracts/schemas/security-scan-result.v1.json
```

Location और naming अभी agent review तथा user approval के बाद final होंगे।

## Queue और worker verification gaps

- `security-scan-queue` का repository provisioning artifact verify/add करना होगा।
- Registry में `/internal/tasks/security/scan` route है, लेकिन FastAPI handler/provider
  अभी implementation-pending हैं।
- OIDC/private worker boundary deployment rules से verify करनी होगी।
- Task contract बनने के बाद dispatcher route tests update होंगे।

## Proposed Stage-2 deliverables

1. `contracts/tasks/security-scan-task.v1.json`
2. Revised/frozen security event contract treatment
3. `contracts/events/candidate-resume-parsed.v1.json`
4. `contracts/schemas/security-scan-result.v1.json`
5. JSON Schema draft/version convention record
6. Dispatcher registry reference correction
7. Contract validation tests
8. Producer/consumer compatibility matrix

## Explicit non-goals

- FastAPI scanner handler implement नहीं करना
- ClamAV code या Dockerfile modify नहीं करना
- NestJS upload API implement नहीं करना
- Database migration modify नहीं करना
- Existing contract को बिना approval overwrite नहीं करना

## Agent review questions

1. क्या task payload केवल `aggregate_id/document_id` होना चाहिए?
2. `storage_url` event contract में रहे, optional हो या हटे—backward compatibility कैसे रखी जाए?
3. कौन-सा JSON Schema draft/version convention अपनाना चाहिए?
4. `candidate.resume.parsed.v1.json` के required fields code/DB से कौन-से सिद्ध होते हैं?
5. `security_scan_result.v1.json` की सही location और shape क्या हो?
6. क्या security-scan queue provisioning repo में missing है?
7. Registry और task contracts में कोई अन्य mismatch है?
8. क्या कोई requirement, event या contract silently छूट गया है?

## Current verdict

```text
Inventory: COMPLETE FOR REVIEW
Contract changes: NOT STARTED
Agent verification: PENDING
User approval: PENDING
```

Agents की reports consolidate और user approval के बाद ही actual contract files update
होंगी।
