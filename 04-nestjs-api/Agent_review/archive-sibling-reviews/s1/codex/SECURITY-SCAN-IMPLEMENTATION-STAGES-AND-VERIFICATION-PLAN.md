# Security Scan और First-Resume Flow — Staged Implementation Plan

## Purpose

यह document first resume upload से parsed review form तक के flow को staged तरीके से
finalize, verify और implement करने का plan है। हर stage के बाद independent agent review
होगा। अगले stage में तभी जाएँगे जब current stage का exit criterion पूरा हो।

```text
Security decision
    ↓
Contracts
    ↓
NestJS requirements/API sync
    ↓
Phase 5 requirements freeze
    ↓
API catalog
    ↓
Architecture + implementation plan
    ↓
Coding + tests
```

## Stage 1 — Security-scan decision freeze

### Final direction

- NestJS upload request में fast validation करेगा:
  auth/ownership, size, MIME, extension, magic bytes, checksum और duplicate check।
- Full malware scan upload HTTP request में synchronous नहीं होगा।
- File private storage में `security_scan_status = pending` के साथ जाएगी।
- `security.scan.requested` outbox event बनेगा।
- Dispatcher → `security-scan-queue` → FastAPI का अलग security-scan handler।
- केवल verified `clean` document के बाद `resume.parse.requested` बनेगा।
- FastAPI parser clean status को दोबारा verify करेगा; यह दूसरा antivirus scan नहीं है।
- Candidate को पहले upload acknowledgement, फिर meaningful status, फिर parsed review form मिलेगा।
- Candidate confirmation से पहले canonical profile update नहीं होगी।

### Human decision

Local, pre-prod और production सभी environments में **ClamAV** provider direction
रहेगी। Local में pinned ClamAV Docker container, pre-prod/production में वही
provider/runtime policy चलेगी। Provider abstraction के पीछे रखने से future में
managed provider बदला जा सकेगा। Deterministic mock केवल automated tests के लिए
allowed होगा; production bypass/fail-open allowed नहीं होगा।

### Agent gate

Agents verify करें कि यह direction SQL, contracts, Dispatcher route और FastAPI trust
boundary से compatible है।

### Exit criterion

```text
Scanner location, async behavior, clean-only parse और failure policy approved
```

## Stage 2 — Contract finalization

Verify/create and freeze:

- `security.scan.requested` event contract
- `security-scan-task.v1.json` task payload contract
- `resume.parse.requested` event contract
- `candidate.resume.parsed.v1.json` output event contract
- Event envelope और Cloud Task payload boundary
- JSON Schema draft/version consistency
- `aggregate_id` semantics

### Exit criterion

```text
हर dispatcher route के लिए trigger event और task payload unambiguous
```

## Stage 3 — NestJS API requirements sync

API catalog में इन use cases को दर्ज करें:

```text
POST /resumes/upload
GET  /resumes/:id/status
GET  /resumes/:id/parsed-data
POST /resumes/:id/confirm
```

हर API के लिए लिखें:

- actor और authorization
- request/response DTO
- validation
- tables read/write
- transaction boundary
- outbox event
- idempotency
- rate limit
- errors
- SSE status behavior
- acceptance criteria

### Exit criterion

```text
Upload → scan → parse → review → confirm का हर step API catalog में traceable
```

## Stage 4 — Phase 5 Final Requirements Freeze

Phase 0–4 documents में final decisions sync करें और final requirements freeze करें:

```text
Upload
→ Security scan
→ Parse
→ Review/Edit
→ Candidate confirmation
→ Canonical profile transaction
```

इस stage के बाद कोई requirement silently add/remove नहीं होगी। नई बात के लिए explicit
decision/change record होगा।

### Exit criterion

```text
FINAL-REQUIREMENTS.md approved
All gaps/conflicts either resolved or explicitly tracked
```

## Stage 5 — API catalog

हर endpoint को requirement ID से map करें। Catalog में transaction, DB functions,
outbox, worker, security, idempotency, errors और tests शामिल हों।

### Exit criterion

```text
कोई required feature बिना API/use-case mapping के न बचे
```

## Stage 6 — Architecture और implementation plan

अब detailed implementation plan बने:

- NestJS modules/controllers/services
- FastAPI security-scan module/provider interface
- FastAPI resume parser boundary
- Dispatcher route और Cloud Tasks queues
- DB guarded clean→parse transaction
- SSE/status recovery
- retry/dead-letter/recovery sweeper
- secrets/OIDC/IAM
- local, integration, concurrency और E2E tests

### Exit criterion

```text
Implementation plan approved और सभी dependencies ordered
```

## Stage 7 — Coding और verification

Implementation order:

1. NestJS upload validation और storage transaction
2. Security-scan task contract और FastAPI handler
3. ClamAV provider integration
4. Guarded clean/infected/failed DB transitions
5. Clean→parse outbox handoff
6. Status API और SSE nudge
7. Parsed-data API और review/confirm API
8. Unit/integration/failure/concurrency/E2E tests

हर step के बाद:

- changed files report
- tests and exact result
- schema/contract diff
- security review
- independent agent verification

## Important non-negotiable rules

- Full antivirus scan upload request में नहीं चलेगा।
- Scanner call खुले PostgreSQL transaction के अंदर नहीं होगा।
- Verified clean के बिना parsing नहीं होगी।
- Parsed AI output canonical profile को silently overwrite नहीं करेगा।
- Browser को trusted/service credentials नहीं मिलेंगे।
- SSE केवल live optimization है; DB status + REST recovery authoritative हैं।
- Provider बदलने पर event/queue/API flow नहीं बदलना चाहिए।

## Current status

```text
Architecture direction: APPROVED
Stage 1: Four architecture decisions approved; implementation/runtime verification gates remain
Stage 2: Contract drafts and security-path compatibility implemented; producer compatibility, ClamAV runtime and live E2E gates remain
Stage 3: API catalog sync pending
Phase 5 requirements freeze: NOT STARTED
Coding: अभी शुरू नहीं करनी
```
