# Codex Recommendation - Job/Application Transition Policy

**Status:** RECOMMENDED DRAFT - human/product approval ke baad hi freeze hoga

## 1. Core policy

Job aur application status ko enum order ke basis par automatically transition nahi
karna chahiye. NestJS mein explicit transition maps, actor guards aur tests honge.
Invalid transition fail-closed hoga.

## 2. Recommended job policy

```text
draft -> pending_approval -> published
published -> paused
paused -> published
published -> closed / expired / archived
paused -> closed / expired / archived
```

Recommended terminal states:

```text
closed, expired, archived
```

Terminal job reopen nahi hoga. Reposted vacancy ko naya `job_id` milega, jo
`PD-003-APPLICATION-HISTORY.md` ki one-application-per-job policy se consistent hai.

`expired` automatic system transition ho sakta hai; manual close/archive authorized
company workflow se hoga. Exact actors product approval ke baad API Catalog mein
freeze honge.

## 3. Recommended application policy

Baseline `change_application_status(...)` ke existing allowed transitions ko source
of truth maana jayega. NestJS uske bahar transition invent nahi karega.

Recommended high-level flow:

```text
applied -> under_review -> screening -> shortlisted
shortlisted -> interview_scheduled -> interview_completed
interview_completed -> selected -> offer_extended
offer_extended -> offer_accepted
```

Terminal states recommended:

```text
offer_accepted, offer_declined, rejected, withdrawn
```

`on_hold` temporary state rahega aur authorized HR workflow se review/screening/
shortlist/interview flow mein return ho sakega. Candidate ko apni application
withdraw karne ki permission policy approval ke baad define hogi; HR candidate ki
withdrawal ko reverse nahi karega.

## 4. Actor recommendation

| Action | Recommended actor |
|---|---|
| Job draft/edit | authorized company owner/HR |
| Job approval/publish | company owner/primary HR or approved admin policy |
| Job pause/close/archive | authorized company owner/HR |
| Job expiry | system |
| Application withdraw | candidate/application owner |
| Review/screen/shortlist/reject | authorized HR/recruiter |
| Interview states | interview workflow + authorized HR |
| Select/offer | authorized HR/company workflow |
| Offer accept/decline | candidate |

Ye actor mapping recommendation hai, final product approval ke bina frozen nahi hai.

## 5. Transaction and audit rules

Application status ke liye existing `change_application_status(...)` canonical path
rahega. Is transaction mein:

```text
row lock
-> current status validate
-> actor/permission validate
-> application update
-> application_status_history insert
-> rejection reason/metadata validate
-> approved outbox event insert
-> COMMIT
```

Job status ke liye bhi equivalent authorized NestJS command/service path hona chahiye;
direct ad-hoc UPDATE allowed nahi hona chahiye. Iske exact DB function ki zarurat hai
ya nahi, ye SQL audit ke baad decide hoga.

## 6. Important unresolved decisions

- Job approval/publish actors
- Rejected/withdrawn reopen policy
- Candidate withdrawal cutoff
- Exact notification event contracts
- Exact HTTP status codes and API paths
- Job status history table/event, agar baseline mein missing ho

In points ko approve kiye bina is recommendation ko final architecture decision nahi
maana jayega.

