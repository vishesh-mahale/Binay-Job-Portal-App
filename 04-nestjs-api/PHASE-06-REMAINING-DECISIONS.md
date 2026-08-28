# Phase 06 — Remaining API Catalog Decisions

Status: `APPROVED DIRECTION — REVALIDATION REQUIRED — CODING NOT AUTHORIZED`

यह ledger केवल उन points को रखता है जिन्हें Phase 06 catalog freeze से पहले consciously decide
करना है। कोई default silently assume नहीं किया गया है।

## DEC-06-01 — Public error vocabulary — APPROVED DIRECTION

**Approved direction:** Stage-03 consolidated DTO review की vocabulary adopt करें. Full decision is
recorded in `DECISION-06-API-ERROR-VOCABULARY-HINGLISH.md`.

```text
VALIDATION_ERROR          400
UNAUTHORIZED              401
FORBIDDEN                 403
NOT_FOUND                 404
GUEST_SESSION_INVALID     403
RESUME_LIMIT_REACHED      409
SCAN_PENDING              409
SCAN_FAILED               409
INFECTED_FILE             422
PARSING_PENDING           409
PARSING_FAILED            422
STALE_REVISION            409
IDEMPOTENCY_CONFLICT      409
DEPENDENCY_UNAVAILABLE    503
RATE_LIMITED              429
INTERNAL_ERROR            500
```

`CONFLICT`, `EXPIRED` और `CURSOR_INVALID` को अभी frozen public codes न माना जाए। यदि इन्हें
रखना हो तो अलग approval और HTTP mapping चाहिए।

## DEC-06-02 — Exact public paths and DTO timing

**Recommended boundary:** जिन paths/DTOs को source documents ने freeze नहीं किया है, उन्हें Phase 06
में `TBD` रखते हुए Phase 07 architecture/API design में finalize करें। किसी path को केवल catalog
पूरा दिखाने के लिए invent न करें।

## DEC-06-03 — Gate G-1 envelope reconciliation

`outbox_events` envelope, producer event contracts और dispatcher task envelope को implementation से
पहले एक approved mapping में reconcile करना है। इसके बिना event producer code शुरू नहीं होगा।

## DEC-06-04 — Notification email/template scope

`REQ-NOTIFY-002` और `REQ-NOTIFY-003` required product scope हैं, लेकिन provider, template schema,
email contract और `notification.email.requested` route अभी phased हैं। इन्हें catalog में tracked
deferred entries के रूप में रखा गया है; current in-app notification flow इन पर निर्भर नहीं है।

## DEC-06-05 — Saved jobs

`saved_jobs` table मौजूद है, लेकिन current frozen requirement ledger में इसका dedicated `REQ-ID`
नहीं है। Upstream requirement ownership तय होने तक नया API entry invent नहीं किया जाएगा।

## DEC-06-06 — Message idempotency persistence

Messaging table में client-message-id column नहीं है। Exact persisted idempotency mechanism Phase 07
architecture में तय होगा; catalog में client message id को frozen database field न माना जाए।

## Gate

Phase 06 को freeze करने के लिए DEC-06-01 की vocabulary approval और ऊपर के deferred boundaries की
explicit acceptance आवश्यक है। तब तक:

```text
API CATALOG FROZEN: NO
NESTJS IMPLEMENTATION AUTHORIZED: NO
```
