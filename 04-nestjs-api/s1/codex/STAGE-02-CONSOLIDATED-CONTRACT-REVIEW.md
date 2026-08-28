# Stage 2 — Consolidated Contract Review

> **Historical review record.** This document captures the pre-implementation review
> state. It is superseded for current status by
> `STAGE-02-FINAL-CONTRACT-REVIEW.md`; do not interpret the older “missing” findings
> below as current repository state without checking that final review and the code.

Date: 2026-08-26
Status: `APPROVED WITH CHANGES — CONTRACT FREEZE NOT READY`

## Reviewed agent reports

- `antigravity-STAGE-02-CONTRACT-REVIEW.md`
- `freebuf-STAGE-02-CONTRACT-REVIEW.md`
- `kilo-STAGE-02-CONTRACT-REVIEW.md`
- `opencode-STAGE-02-CONTRACT-REVIEW.md`
- `qoder-STAGE-02-CONTRACT-REVIEW.md`

## 1. Agent verdict summary

| Agent | Verdict | Main conclusion |
|---|---|---|
| Antigravity | Approved with changes | Missing task contract, output contract और schema alignment |
| FreeBuf | Approved with changes | Architecture sound; two critical contract files missing |
| Kilo | Not approved | Event/task mismatch, storage conflict, queue artifact और boundary confusion |
| OpenCode | Approved with changes | Task contract, output/result schemas और queue artifact required |
| Qoder | Approved with changes | Same gaps plus projection output route loop risk और contract tests |

## 2. Codex independent verdict

Inventory और agent evidence सही हैं, लेकिन **Stage 2 contracts अभी freeze नहीं होने
चाहिए**। Existing producer code अभी absent/partial है और dispatcher security route
गलत contract reference कर रही है। पहले contract decisions और boundary corrections
record होंगे; फिर actual files edit होंगी।

## 3. Verified repository facts

1. Dispatcher `payload.builder.ts` flat uniform task payload बनाता है:

```json
{
  "schema_version": 1,
  "event_id": "<uuid>",
  "aggregate_id": "<uuid>",
  "trace_id": "<uuid>"
}
```

2. `contracts/tasks/security-scan-task.v1.json` अभी missing है।
3. Registry security route event contract को task contract की तरह reference करती है।
4. `security-scan-requested.v1.json` में `payload.storage_url` required है।
5. `candidate.resume.parsed.v1.json` missing है, जबकि worker event emit करता है।
6. `contracts/schemas/` area और security result schema अभी missing हैं।
7. JSON Schema drafts mixed हैं: draft-07 और 2020-12 दोनों मौजूद हैं।
8. `security-scan-queue` provisioning artifact repository में missing है।
9. FastAPI में `SecurityScanTaskPayload` और dedicated security-scan handler अभी
   implementation-pending हैं।
10. `candidate.projection.rebuilt` FastAPI output event है, फिर भी dispatcher registry
    में उसी projection endpoint पर input route की तरह registered है। यह potential
    chained-event/rebuild loop risk है।

## 4. Final Codex decisions (now frozen)

### Decision A — Security-scan task contract — FINAL

Create:

```text
contracts/tasks/security-scan-task.v1.json
```

इसका payload existing uniform task contract जैसा होगा। `storage_url`, bucket/path,
signed URL, token या file content task payload में नहीं होगा। Worker `aggregate_id`
से database में storage metadata पढ़ेगा।

### Decision B — `storage_url` event field — FINAL

Signed URL को persistent outbox event या task payload में नहीं रखना है। इस repository में
producer अभी released/frozen नहीं है, इसलिए existing draft `security-scan-requested.v1.json`
को explicit reviewed amendment के रूप में document-identity-only payload पर बदला जाएगा;
नया v2 event type अभी आवश्यक नहीं है। यह silent edit नहीं होगा—इस decision record और
compatibility test के साथ होगा।

### Decision C — Parsed output event — FINAL

Create:

```text
contracts/events/candidate-resume-parsed.v1.json
```

Required fields केवल actual worker code से derive होंगे:

```text
aggregate_type = candidate
aggregate_id   = candidate_id
event_type     = candidate.resume.parsed
payload        = candidate_id, reason, trace_id (जहाँ code वास्तव में emit करे)
```

Guest/no-candidate cases में event guarantee assume नहीं करनी है। Database और REST
authoritative recovery रहेंगे।

### Decision D — Security result schema — FINAL

Create a reusable schema area:

```text
contracts/schemas/security-scan-result.v1.json
```

Shape में `schema_version`, `verdict`, scanner/provider/version, timestamp, duration,
checksum, bounded threats और bounded error metadata होंगे। Raw resume content, secrets,
credentials और unnecessary PII forbidden होंगे। Database `security_scan_status`
authoritative रहेगा।

### Decision E — JSON Schema convention — FINAL

नए contracts के लिए JSON Schema Draft 2020-12 convention document करें। Existing
draft-07 contracts को इस pass में mass-edit नहीं करेंगे; producer freeze के बाद reviewed
versioned migration होगी। Silent v1 mutation नहीं होगी।

### Decision F — Dispatcher route boundary — FINAL

1. `security.scan.requested` को dedicated task contract reference करना होगा।
2. `candidate.projection.rebuilt` FastAPI का downstream output event है, नया projection
   trigger नहीं। इसे dispatcher input registry से हटाया जाएगा, ताकि projection loop न बने।
   `candidate.profile.changed` ही projection rebuild का approved input रहेगा।
3. Registry comments में “handler verified” claim actual code से match करना होगा।

### Decision G — Queue provisioning — FINAL

`security-scan-queue` का queue config, retry/deadline/rate policy और deployment script
में provisioning artifact add/verify करना होगा। Live GCP state को repository artifact
का substitute नहीं माना जाएगा।

## 5. Required Stage-2 deliverables after decision freeze

1. `contracts/tasks/security-scan-task.v1.json`
2. `contracts/events/candidate-resume-parsed.v1.json`
3. `contracts/schemas/security-scan-result.v1.json`
4. `contracts/schemas/README.md` या `contracts/README.md` में schemas area documentation
5. Registry task-contract reference correction
6. `storage_url` event treatment का approved amendment
7. `candidate.projection.rebuilt` route intent resolution
8. JSON Schema convention record
9. Security queue provisioning artifact
10. Dispatcher/worker/contract validation tests
11. Producer-consumer compatibility matrix

## 6. What must not be done yet

- Existing contracts को blindly overwrite नहीं करना
- `schema_version` silently बदलना नहीं
- `storage_url` को task payload में add नहीं करना
- `candidate.resume.parsed` fields invent नहीं करना
- Missing worker handler को implemented नहीं कहना
- Stage 2 को frozen नहीं कहना जब तक required deliverables और reviews complete न हों

## 7. Final status

```text
Inventory: VERIFIED
Architecture: SOUND
Contract decisions: FROZEN
Contract drafts: CREATED (compatibility review pending)
Dispatcher/worker code changes: NOT STARTED
Required implementation work: RECORDED ABOVE
Agent review: COMPLETE
Stage 2 decision freeze: READY
Stage 2 implementation freeze: NOT READY (tests and registry/worker alignment pending)
```

अगला approved action: पहले user decision record और contract drafts तैयार करना, फिर
उन drafts को दोबारा independent agent review करवाना। उसके बाद ही actual contract और
registry files modify होंगी।
