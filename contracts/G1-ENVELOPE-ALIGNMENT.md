# G-1(b): Existing Contract Envelope Alignment

> **Status: RESOLVED & IMPLEMENTED for `job.ai.enrichment.requested`**
>
> The producer (`04-nestjs-api`) emits full outbox envelope for `job.ai.enrichment.requested` during publication transitions (`draft` $\rightarrow$ `published` and `pending_approval` $\rightarrow$ `published`).
> The dispatcher forwards the uniform task payload (`schema_version`, `event_id`, `aggregate_id`, `trace_id`) to FastAPI worker.

---

## Current State (Phase 1 Contracts — Draft-07, Flat Envelope)

| Contract File | Schema | Required Fields | Missing Outbox Fields |
|---|---|---|---|
| `resume-parse-requested.v1.json` | draft-07 | `schema_version`, `event_id`, `aggregate_id`, `trace_id` | `aggregate_type`, `event_type`, `payload`, `occurred_at` |
| `candidate-projection-task.v1.json` | 2020-12 | `schema_version`, `event_id`, `aggregate_id`, `trace_id` | `aggregate_type`, `event_type`, `payload`, `occurred_at` |
| `job-enrich-task.v1.json` | 2020-12 | `schema_version`, `event_id`, `aggregate_id`, `trace_id` | `aggregate_type`, `event_type`, `payload`, `occurred_at` |

**Note:** `candidate-projection-task.v1.json` and `job-enrich-task.v1.json` are TASK contracts
(what the dispatcher sends to FastAPI), not TRIGGER EVENT contracts (what 04-nestjs-api emits
to outbox). The Phase 1 trigger event contracts for these 3 routes don't exist yet in
`contracts/events/` — only the task contracts exist in `contracts/tasks/`.

---

## Target State (Aligned with Outbox Envelope)

Phase 2 trigger event contracts (created) use the full outbox envelope:

```json
{
  "schema_version": 1,
  "event_id": "<uuid>",
  "aggregate_type": "<entity_type>",
  "aggregate_id": "<uuid>",
  "event_type": "<domain.event.action>",
  "payload": { /* route-specific fields */ },
  "occurred_at": "<ISO-8601>"
}
```

Phase 1 trigger event contracts (to be created/aligned):

| Event Type | `aggregate_type` | `aggregate_id` | `payload` fields |
|---|---|---|---|
| `resume.parse.requested` | `resume_parsing_job` | Parsing job UUID | `document_id`, `requested_by` |
| `candidate.profile.changed` | `candidate` | Candidate UUID | `candidate_id`, `change_type` |
| `job.ai.enrichment.requested` | `job` | Job UUID | `job_id`, `company_id` |

---

## Why This Is Blocked

1. **Producer discipline**: 04-nestjs-api must emit these exact fields. Without producer code,
   we can't verify the contract is correct.
2. **Dispatcher is envelope-agnostic**: The dispatcher forwards `aggregate_id` generically
   without parsing `payload` content. The dispatcher code works regardless of envelope format.
3. **E2E integration requires alignment**: When 04-nestjs-api starts emitting events, the
   contracts must match exactly for the FastAPI worker to process them correctly.

---

## Action Items (When 04-nestjs-api Trigger Contracts Freeze)

1. Create 3 Phase 1 trigger event contracts in `contracts/events/`:
   - `resume-parse-requested.v1.json` (full envelope)
   - `candidate-profile-changed.v1.json` (full envelope)
   - `job-ai-enrichment-requested.v1.json` (full envelope)
2. Align `aggregate_type` + `aggregate_id` semantics per `AGGREGATE-ID-SEMANTICS.md`
3. Freeze `payload` field names with producer (04-nestjs-api) team
4. Update FastAPI worker to validate incoming task payloads against new contracts
5. Run E2E integration test: producer → outbox → dispatcher → FastAPI worker

---

## Impact on Dispatcher

**NONE** — the dispatcher is payload-opaque. This alignment is for:
- Producer contract clarity
- Consumer (FastAPI worker) validation
- E2E integration verification
- Documentation accuracy

---

## Related Gates

- **G-1(a)**: DONE — Phase 2 trigger contracts created (DRAFT)
- **G-1(a.1)**: IMPLEMENTED — security.scan.requested contract, task contract,
  Pydantic payload model and dedicated handler are present; ClamAV/runtime and
  compatibility tests remain required before production freeze.
- **G-1(b)**: RESOLVED & IMPLEMENTED for `job.ai.enrichment.requested` — trigger contract `contracts/events/job-ai-enrichment-requested.v1.json` is frozen with full envelope (`schema_version: 1`, `event_id`, `aggregate_type: 'job'`, `aggregate_id`, `event_type: 'job.ai.enrichment.requested'`, `correlation_id`, `payload`, `occurred_at`).
- **G-2**: DONE — aggregate_id semantics documented

---

## Last Updated

Phase 2 implementation (August 2026)
