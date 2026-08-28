# Interview API — Final Policy Freeze

**Status: FROZEN FOR IMPLEMENTATION**

यह freeze मौजूदा database schema और approved architecture पर आधारित है।

## Final decisions

1. **Authorization:** active same-company membership और existing user role boundary
   पर्याप्त है। अलग `manage_interviews` permission key या नया schema field नहीं जोड़ा जाएगा।
   Schedule/reschedule/cancel company के active owner/employer/HR करेंगे; assigned
   interviewer same-company active member होना चाहिए। Candidate केवल अपनी interview
   confirm/decline करेगा।
2. **Minimum lead time:** 1 घंटा। इससे कम समय वाले slots reject होंगे।
3. **Idempotency:** `schedule_block_id` natural idempotency guard रहेगा। नई idempotency
   column नहीं जोड़ी जाएगी। Existing uniqueness और locking duplicate booking रोकेंगे।
4. **Status:** `scheduled`, `confirmed`, `rescheduled`, `completed`, `cancelled`,
   `no_show`; terminal states `completed`, `cancelled`, `no_show` हैं।
5. **Reschedule:** नई interview row बनेगी और `rescheduled_from` पुरानी row को point करेगा।
6. **Time:** ISO-8601 + explicit offset input, `TIMESTAMPTZ` storage, valid IANA timezone;
   past और invalid DST times reject होंगे।

## Still gated (not invented)

- Interview notification/reminder event contracts
- Calendar/video provider integration
- `interview.summary.requested` worker contract

इनके लिए approved contract मिलने तक कोई event name, queue route या worker behavior code
में नहीं जोड़ा जाएगा।

## Implementation start point

अब interview scheduling, reads, confirmation, decline, reschedule और cancellation के
transaction-safe NestJS endpoints implement किए जा सकते हैं। हर mutation में scope
checks, schedule-block locking, audit और approved outbox behavior लागू होगा।
