# Decision 03 - `application.submitted` Event Contract

**Status:** APPROVED / FROZEN - domain contract; notification route phased

## Final decision

Registered aur guest application submit hone par NestJS same PostgreSQL transaction mein ye rows write karega:

```text
job_applications
application_profile_snapshots
initial application_status_history
application.submitted outbox event (v1)
COMMIT
```

Contract:

```text
contracts/events/application-submitted.v1.json
event_type = application.submitted
aggregate_type = job_application
aggregate_id = job_applications.id
```

## Consumer/routing boundary

- Analytics event ko NestJS same application transaction mein idempotently record kar sakta hai.
- AI matching ke liye alag `match.analyze.requested` event use hoga; `application.submitted` ko match endpoint par route nahi karna.
- Notification worker/queue/endpoint contract abhi approved nahi hai, isliye `application.submitted` ka dispatcher route abhi register nahi hoga.
- Unrouted event behavior fail-closed aur observable rahega; notification phase mein route add hoga.

## Payload/security rule

Contract payload mein raw guest email ya resume content nahi jayega. Sensitive contact data authorized server-side consumer `application_id` se fetch karega. Event/task logs mein PII, secrets ya signed URLs nahi honge.

## Acceptance criteria

1. Registered aur guest apply dono mein event business rows ke saath same transaction mein create ho.
2. Transaction rollback par application, snapshot, history aur event mein se koi partial row na bache.
3. Duplicate request se duplicate application/event na bane.
4. Dispatcher `application.submitted` ko current phase mein guessed queue par route na kare.
5. Matching ke liye explicit `match.analyze.requested` event hi publish ho.
6. Consumer/event processing `processed_events`/approved idempotency rules follow kare.

**GAP-012:** Domain contract resolved. Notification routing remains an expected phased gap.
