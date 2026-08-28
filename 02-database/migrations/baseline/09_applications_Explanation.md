# 09 Applications — Detailed Hinglish Explanation

## 1. Is file ka kaam

`09_applications.sql` candidate/guest application, submitted documents, frozen
snapshots, status timeline, guest-account claim, saved jobs, saved candidates aur
referrals रखती है.

```text
Live candidate profile
        ↓ Apply
Job application + frozen submitted snapshot
        ↓
Recruiter workflow / AI matching / interview
```

## 2. `job_applications`

One row = one person/email ka one job par application.

### Registered example

```json
{
  "job_id": "job-java-101",
  "candidate_id": "candidate-rahul",
  "user_id": "user-rahul",
  "is_guest": false,
  "guest_upload_session_id": null,
  "status": "applied"
}
```

Identity NestJS auth se derive karega; frontend ownership IDs decide नहीं करेगा.

### Guest example

```json
{
  "job_id": "job-java-101",
  "candidate_id": null,
  "user_id": null,
  "is_guest": true,
  "guest_upload_session_id": "guest-session-1",
  "guest_name": "Rahul Sharma",
  "guest_email": "Rahul@Example.com",
  "guest_email_normalized": "rahul@example.com",
  "status": "applied"
}
```

One registered candidate/job and one guest normalized-email/job duplicate blocked.
`guest_email_normalized` lowercase-enforced `TEXT` है। `CITEXT` नहीं रखने से DB
actual lowercase value store होना verify करती है, केवल case-insensitive equality नहीं।
Registered application में सभी guest-only fields—including `guest_phone`—`NULL`
रहते हैं।

## 3. Apply transaction

### Registered candidate

```text
BEGIN
  lock/check published job
  derive candidate/user from authenticated identity
  insert job_applications
  require every document to be active and uploaded_by_user_id = application.user_id
  attach application_documents
  load confirmed canonical profile + selected application resume parse (if ready)
  normalize/deduplicate facts with canonical source priority
  insert submitted snapshot version 1 + selected resume_document_id
  insert initial application_status_history
  insert application.submitted outbox event
COMMIT
```

Selected application resume का parse available नहीं है तो apply request parsing के लिए block नहीं होगी। उस case
में submitted snapshot transaction के समय उपलब्ध canonical/submitted facts freeze करेगी और selected
resume document identity preserve करेगी। बाद में parsing/enrichment के लिए नया immutable
`parsed`/`enriched` snapshot version insert हो सकता है; `submitted` snapshot कभी rewrite नहीं होगी।

Any step fail → application half-created नहीं होगी.

Application हमेशा `applied` status से create होगी। बनने के बाद job/applicant/
guest identity immutable है; correction के नाम पर historical application दूसरी
job या user को transfer नहीं की जा सकती।

### Guest candidate

```text
BEGIN
  lock guest_upload_sessions row (FOR UPDATE)
  require same job + active + unexpired + not revoked
  insert guest job_applications row
  attach only active documents from the exact same session
  insert submitted snapshot version 1
  insert initial status history
  insert application.submitted outbox event
  consume_guest_upload_session(session_id, application_id)
COMMIT
```

Validation और consumption अलग transactions में नहीं होंगे। Row lock concurrent
requests को same session reuse करने से रोकता है।

## 4. `application_status_history`

Current status `job_applications.status` mein; immutable timeline history table mein.

Status direct update नहीं होगा। NestJS controlled DB function call करेगा:

```text
change_application_status(...)
→ current application row lock
→ current → next transition validation
→ job_applications.status update
→ application_status_history insert
→ application.status.changed outbox event
→ COMMIT
```

Terminal statuses जैसे `rejected`, `withdrawn`, `offer_accepted` और
`offer_declined` reverse transition नहीं कर सकते। इसलिए fake history और
`rejected → shortlisted` जैसे changes normal write path में impossible हैं।
`rejected` transition में वही reason history और current application के
`rejection_reason` दोनों में लिखा जाएगा।

Example:

```json
{
  "from_status": "applied",
  "to_status": "under_review",
  "changed_by": "hr-user-id",
  "change_reason": "Initial resume screening passed"
}
```

Status update + history + outbox same transaction.

`metadata` हमेशा JSON object होगी; array/string payload reject होगा। Initial history में
`from_status = NULL`, `to_status = applied` रहेगा और same from/to transition store नहीं होगी।

## 5. `application_documents`

Application ke saath submitted resume/cover letter/certificate relation:

```text
application_id + document_id + document_role
```

Guest application ka document exact same `guest_upload_session_id` se originate
होना चाहिए। Registered application का document उसी `user_id` ने upload किया होना
चाहिए। दोनों cases में soft-deleted document attach नहीं हो सकता। Trigger गलत
ownership/session attachment block करता है।

Document links append-only हैं:

```text
Existing link UPDATE/DELETE ❌
Later supporting document INSERT ✅
```

## 6. `application_profile_snapshots`

Apply-time frozen data. Live profile later change ho sakta hai; snapshot नहीं.

| Type | Meaning |
|---|---|
| `submitted` | Candidate/guest ne exactly kya submit kiya; one only |
| `parsed` | Submitted resume ki parsed representation |
| `enriched` | AI match/enrichment output version |
| `reviewed` | Optional recruiter-reviewed version |

Example:

```json
{
  "snapshot_type": "submitted",
  "snapshot_version": 1,
  "schema_version": "application-profile-v1",
  "source_profile_revision": 8,
  "snapshot_data": {
    "title": "Java Developer",
    "skills": ["Java", "Spring Boot"],
    "experienceYears": 4.2
  },
  "generated_by": "candidate"
}
```

Registered candidate के submitted snapshot में `source_profile_revision` और चुने हुए
`resume_document_id` से source state record होगी। `snapshot_data` JSON object होगी और
canonical + selected-resume facts के duplicate होने पर confirmed canonical fact को priority मिलेगी।

Selected application resume latest active profile resume हो सकती है, लेकिन candidate application-only
resume भी चुन सकता है। Application snapshot हमेशा उस application में वास्तव में चुने गए document को
freeze करेगी; global recruiter-search projection केवल active profile resume policy follow करेगी।

All snapshots immutable. Enriched result change:

```text
enriched v1 update ❌
enriched v2 insert ✅
```

## 7. `guest_candidate_claims`

Guest later signup करे तो original application registered row mein rewrite नहीं होती.

```text
Guest application
→ claim token
→ authenticated email verification
→ candidate profile ownership verification
→ pending → verified → merged
```

Claim row records historical link. Candidate/user composite FK mismatch रोकती है.

Allowed lifecycle:

```text
pending → verified → merged
pending → expired / revoked / rejected
verified → revoked / rejected
```

`merged`, `expired`, `revoked`, `rejected` terminal हैं। Claim बनने के बाद
application, normalized email, token hash और expiry immutable हैं। एक application
पर maximum one pending/verified/merged claim हो सकती है।
Claimant user/candidate references `RESTRICT` हैं, ताकि physical deletion से
historical verified/merged identity disappear न हो।

## 8. `saved_jobs`

Simple personal bookmark:

```text
user_id + job_id unique
notes optional
is_archived flag
updated_at tracks edits/archive changes
```

Saved job application नहीं है.

## 8A. `saved_candidates`

Recruiter candidate search/profile se private, non-job-specific bookmark create
करता है. Row owner `recruiter_user_id` होता है; `company_id` tenant boundary के
लिए रहता है. Same recruiter और same candidate का केवल एक record हो सकता है,
जबकि दूसरा HR उसी candidate को अपनी private list में अलग से save कर सकता है.

```text
recruiter_user_id + candidate_id unique
job_id नहीं है
private_note optional है
```

Save/unsave NestJS authorization और trusted transaction path से होंगे. Search और
profile responses `is_saved` दे सकते हैं. यह bookmark अपने-आप application,
shortlist या outbox event नहीं बनाता.

## 9. Manual referrals

Referral application नहीं बनाती. Any active registered user manual candidate
details enter करके invitation भेज सकता है.

```text
referral_batches
    ↓ many
referral_invitations
    ↓ candidate applies
job_applications
```

### `referral_batches`

One manual form submission. Example 50 entered candidates:

```json
{
  "total_entries": 50,
  "valid_entries": 46,
  "invalid_entries": 1,
  "duplicate_entries": 3,
  "queued_entries": 46,
  "sent_entries": 44,
  "failed_entries": 2,
  "status": "partially_failed"
}
```

Lifecycle:

```text
draft → ready → processing → completed / partially_failed
draft / ready / processing → cancelled
```

Reverse transition, जैसे `completed → processing`, blocked है। Counters का exact
meaning:

- `queued_entries`: कम-से-कम एक बार queued हुई unique invitations (cumulative)
- `sent_entries`: कम-से-कम एक बार successfully sent unique invitations (cumulative)
- `failed_entries`: अभी terminal `failed` state में invitations
- `send_attempt_count`: actual retries/attempts; batch failed counter नहीं

Counters independently bounded हैं; cumulative sent और current failed counts को
add करके valid count से compare नहीं किया जाता।

### `referral_invitations`

One row per valid candidate:

```json
{
  "referred_name": "Amit Verma",
  "referred_email": "Amit@Example.com",
  "referred_email_normalized": "amit@example.com",
  "invite_token_hash": "hashed-token",
  "status": "sent",
  "application_id": null,
  "expires_at": "future timestamp"
}
```

Lifecycle:

```text
pending → queued → sent → opened → applied
                     ├→ declined
                     ├→ expired
                     └→ failed → queued retry
```

Raw invitation token email URL mein once जाता है; DB में hash only.

Creation के बाद batch/job/referrer/email/token/expiry identity immutable है।
Resend generic identity update या नया duplicate invitation नहीं बनाता; existing
invitation की delivery attempt fields update होती हैं।

`pending` state में name/phone typo correction allowed है। `queued` होते ही
contact freeze हो जाता है। `application_id` और `referred_candidate_id` केवल
atomic `applied` transition में NULL से assign हो सकते हैं और फिर immutable हैं।

Reissue policy:

```text
Active/temporary failed → same invitation retry
Expired/cancelled       → new batch + invitation + token
Applied/declined        → no reissue
```

Permanent failure को पहले `cancelled`/`expired` किया जाएगा। Partial unique index
expired/cancelled history preserve करके नया invite allow करता है।

नई invitation की initial `pending` row clean होगी: delivery/open/application/
failure/cancellation timestamps `NULL`, attempts `0` और delivery error `NULL`।

### `referral_rewards`

Invitation delivery से अलग optional payment lifecycle:

```text
not_eligible → pending_eligibility → eligible → approved → paid
```

Reward amount referrer input नहीं; platform/company policy तय करेगी.

Allowed stage से `cancelled` हो सकता है, लेकिन `paid` terminal है।
`invitation_id` immutable है। Flexible payload:

```text
reward_type     = cash / points / gift / certificate / future type
reward_amount   = cash/points के लिए required
reward_metadata = gift/certificate/future details का JSON
```

Generic direct status UPDATE नहीं; controlled transition guard financial state
को reverse/reassociate होने से रोकता है।
Approval के बाद type, amount, currency और metadata freeze होते हैं; paid row पूरी
तरह immutable है।
Approved/paid reward का approver audit identity है, इसलिए `approved_by` reference
physical user deletion पर `RESTRICT` करती है।

Reward state exact-field constraint future data पहले से भरने नहीं देती:

```text
not_eligible / pending_eligibility → lifecycle/payment fields empty
eligible                           → only eligible_at present
approved                           → eligibility + approval fields present
paid                               → eligibility + approval + payment fields present
cancelled                          → cancelled_at present, payment fields empty
```

सभी lifecycle rows canonical initial status से ही INSERT होती हैं:

```text
application=applied, claim=pending, batch=draft,
invitation=pending, reward=not_eligible
```

## 10. Referral candidate applies

```text
Candidate opens valid invitation
→ chooses Guest Apply or Login/Register & Apply
→ NestJS verifies token/job/email/expiry
→ application + snapshot + history created
→ invitation.application_id linked
→ invitation status applied
→ outbox events
```

Direct application without invitation use/confirmation automatically referral
credit नहीं लेती.

## 11. AI match kab hota hai?

```text
Application submitted
→ outbox event
→ matching worker reads job + submitted snapshot
→ score/details
→ job_applications AI summary fields
→ immutable enriched snapshot version
```

Application-time matching frozen submitted state पर होनी चाहिए, changing live
profile पर नहीं.

## 12. Recruiter workflow

Recruiter authorized company/job context mein applications read/update करता है.
Candidate canonical profile directly edit नहीं करता.

```text
Application review
→ shortlist/reject/screen
→ status history
→ interview flow (`10_interviews.sql`)
```

## 13. Kaun kisko call karta hai?

| Caller | Target | Purpose |
|---|---|---|
| Next.js | NestJS Applications API | Apply/status/list |
| NestJS | Application tables | Atomic registered/guest application transaction |
| NestJS | `change_application_status()` | Status + history + outbox atomically |
| Matching worker | FastAPI/AI | Job-snapshot scoring |
| Recruiter API | Status/history | Authorized workflow update |
| Guest user | Claim API | Later account linking |
| Referrer | Referral API | Manual invitation batch |
| Email worker | Candidate email | Secure invitation delivery |

Normal browser roles application, claim, referral और reward lifecycle tables में
direct write नहीं कर सकते। Next.js हमेशा NestJS APIs call करेगा; service role key
server-only रहेगी।

## 14. One-line memory rule

> `09` batati hai kisne kis job par kya submit kiya aur us application ka outcome
> kya hua; live profile बदलने पर भी submitted history नहीं बदलती.
