# Registered Application API — Consolidated Decision

**Status:** `RECOMMENDATION READY — CODE START ONLY AFTER HUMAN FREEZE`

Yeh document `APPLICATION-API-OPEN-DECISIONS.md` aur Antigravity, FreeBuf, aur OpenCode ke reviews ko repository ke executable SQL, existing guest flow, API catalog aur event contract ke against consolidate karta hai. Kisi agent ke “approved” claim ko bina evidence accept nahi kiya gaya.

## 1. Agent review comparison

| Decision | Antigravity | FreeBuf | OpenCode | Consolidated position |
|---|---|---|---|---|
| Route | Job-nested recommend, human freeze | Company-nested vs candidate route, human freeze | Job-nested recommend | **Recommend `POST /api/v1/jobs/:jobId/apply`**; company id request se trust nahi hoga |
| Resume/DTO | `resume_document_id`, cover letter, answers, consent | Library resume simplest; application-only needs decision | Same fields; consent audit-only | **One pre-uploaded owned document reference**, optional cover letter/answers, required consent acknowledgement; inline multipart apply nahi |
| Snapshot | Full immutable profile snapshot | Exact JSON shape human decision | Full canonical profile | **Full canonical facts + source revision + selected document reference**; exact field list implementation contract mein freeze hogi |
| Idempotency | Header replay + DB uniqueness | DB uniqueness, replay policy open | DB uniqueness only, return existing recommended | **DB uniqueness is current authority; duplicate same candidate/job returns existing application. No unpersisted Idempotency-Key promise.** |
| Event | Existing contract; dispatcher phased gap | Existing contract | Existing contract; no route currently | **Emit existing `application.submitted` v1 atomically; dispatcher route remains phased/expected gap** |
| Job eligibility | Published + not expired; paused ineligible | Paused policy open | Paused include recommended | **Only `published`, not deleted, and not expired. Paused/closed/expired reject. Confidential jobs remain eligible; masking is read presentation.** |

## 2. Evidence-based final recommendation

### 2.1 Public route and identity

```text
POST /api/v1/jobs/:jobId/apply
```

- Authenticated candidate JWT se `user_id` aur `candidate_id` derive honge; body/path mein candidate id accept nahi hoga.
- `jobId` ko transaction ke andar re-read karke company/job ownership boundary verify hogi.
- Company id ko client se authoritative nahi maana jayega; job row se derive hoga.

### 2.2 Request contract

```text
SubmitApplicationDto
  document_id: UUID                 required
  cover_letter?: string             optional
  answers_to_screening_questions?: JSON array
  consent: true                     required acknowledgement
```

- `document_id` pehle upload kiye gaye document ko refer karega. Document candidate/user ka owned document hona chahiye aur approved document-origin/security rules pass karne chahiye.
- Library resume aur application-only resume dono is reference se support ho sakte hain; difference document ke approved role/origin se validate hoga. Apply endpoint khud file upload ya parsing synchronously nahi karega.
- Consent ka dedicated column baseline mein nahi hai; isliye NestJS validation ke saath audit metadata mein acknowledgement record karna hoga, bina naya column invent kiye.
- Screening answers JSON array honge aur job ke actual screening questions ke against validate kiye jayenge. Unknown question ids reject honge.
- Raw resume bytes/parsed content response mein nahi jayega.

### 2.3 Eligibility

Apply transaction ke andar condition:

```text
job.status = 'published'
AND job.deleted_at IS NULL
AND (job.expires_at IS NULL OR job.expires_at > NOW())
```

`paused`, `closed`, `expired`, `draft`, `pending_approval`, aur `archived` jobs reject honge. Yeh existing guest apply predicate aur Decision-07 ke hard eligibility rule se align karta hai. `is_confidential` apply ko block nahi karta; company masking sirf response/search presentation ka concern hai.

### 2.4 Atomic transaction

Ek hi DB transaction mein, external API call ke bina:

1. JWT-derived candidate/user aur eligible job lock/re-read.
2. `job_applications` row insert (`is_guest = false`, status baseline default `applied`).
3. `application_documents` link insert.
4. `application_profile_snapshots` mein immutable `submitted` snapshot insert.
5. `application_status_history` initial `applied` row insert.
6. `audit_logs` row insert.
7. Existing `application.submitted` v1 outbox event insert.
8. Commit; uske baad asynchronous delivery.

Failure par transaction rollback hoga. Apply canonical candidate profile ko mutate nahi karega aur parsing/AI completion ka wait nahi karega.

### 2.5 Snapshot rule

Snapshot mein submission-time canonical profile facts, `source_profile_revision`, selected `resume_document_id`, submission metadata aur schema version honge. Facts ko current canonical tables se read karke JSONB mein copy kiya jayega; baad ke profile/resume edits snapshot ko change nahi karenge. Baseline ka immutable trigger aur one-submitted-snapshot unique index is rule ko enforce karte hain.

Exact JSON keys implementation se pehle API contract mein freeze karne honge; kisi guessed column/key ko silently add nahi kiya jayega.

### 2.6 Duplicate/idempotency behavior

Baseline unique index `(job_id, candidate_id) WHERE is_guest = FALSE` authoritative deduplication hai.

- Same candidate ka same job par second submit existing application ko safely return karega (idempotent replay), naya snapshot/outbox nahi banega.
- Concurrent requests mein unique-violation catch karke existing row read ki jayegi.
- Jab tak `job_applications` mein persisted idempotency key ka reviewed schema nahi hai, API ko aisa `Idempotency-Key` replay contract advertise nahi karna chahiye jo DB mein store hi na ho.

### 2.7 Event and dispatcher boundary

Existing `contracts/events/application-submitted.v1.json` hi use hoga:

- `aggregate_type = job_application`
- `aggregate_id = job_application.id`
- `payload.is_guest = false`
- `payload.candidate_id` populated
- `payload.snapshot_id` populated
- `submitted_at` aur top-level `occurred_at` valid timestamps

`application.submitted` ka dispatcher route abhi phased gap hai. Is event ko invent karke kisi naye consumer/queue par route nahi karna; unknown route fail-closed behavior ke saath documented rahega jab tak G-1/consumer ownership freeze na ho.

## 3. Non-negotiable tests before implementation sign-off

- Successful registered apply with owned library document.
- Application-only pre-uploaded document path, if enabled in final DTO policy.
- Expired, paused, closed, draft aur deleted job rejection.
- Confidential published job apply succeeds.
- Cross-candidate document/application rejection.
- Duplicate and concurrent same candidate/job requests produce one application, one snapshot, one outbox event.
- Snapshot remains unchanged after candidate profile edit.
- Screening-question validation and consent validation.
- Transaction rollback leaves no partial business/snapshot/history/outbox rows.
- Event validates against `application-submitted.v1.json`, including `snapshot_id` and `occurred_at`.
- No raw resume/PII content in response or task payload.

## 4. Remaining human freeze items

1. Approve exact route spelling (`/apply` versus `/applications`). Recommendation: `/apply`.
2. Approve exact registered snapshot JSON schema and maximum payload size.
3. Confirm consent acknowledgement wording/audit metadata shape.
4. Confirm whether application-only documents are allowed in the registered flow; if yes, they must be pre-uploaded and owned before apply.
5. Confirm that paused jobs are not eligible (recommendation above follows current published-only behavior).
6. Decide when `application.submitted` gets a dispatcher/consumer route; until then it remains an expected phased gap.

**Current conclusion:** Database foundation and event contract exist, but registered application coding should begin only after these six items are recorded as approved in the API catalog/requirements freeze.
