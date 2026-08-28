# Interview API — Verified Decision Record

**Status:** `VERIFIED BASELINE — IMPLEMENTATION POLICY STILL REQUIRED`

यह record केवल repository में मौजूद schema/code evidence पर आधारित है। कोई नया
permission key, event contract या database function invent नहीं किया गया है।

## 1. Verified status contract

`02-database/migrations/baseline/02_enums.sql` में `interview_status` के exact values हैं:

```text
scheduled, confirmed, rescheduled, completed, cancelled, no_show
```

Baseline में interview status बदलने के लिए कोई approved `change_interview_status()`
function नहीं मिली। इसलिए transition validation NestJS command/service में होगी,
जब तक future reviewed SQL function अलग से approve न हो।

Recommended allowed transitions (implementation से पहले freeze करना होगा):

```text
scheduled   -> confirmed | rescheduled | cancelled | no_show
confirmed   -> rescheduled | completed | cancelled | no_show
rescheduled -> confirmed | completed | cancelled | no_show
completed / cancelled / no_show -> कोई transition नहीं (terminal)
```

Reschedule में पुरानी row overwrite नहीं होगी; `interviews.rescheduled_from` के
जरिए नई interview row बनेगी।

## 2. Verified actor/permission facts

- `user_role` enum में `candidate`, `employer`, `hr`, `admin` मौजूद हैं।
- `interviewers` को same-company `company_members` से bind करने वाला FK मौजूद है।
- `company_members.permissions` nullable JSONB override है; schema में कोई canonical
  `manage_interviews` या equivalent key defined नहीं है।
- इसलिए implementation में permission key का नाम guess नहीं किया जाएगा। Final policy
  को या तो मौजूदा role + active same-company membership पर आधारित रखना होगा, या
  reviewed permission-key decision/schema change approve करना होगा।
- Candidate केवल अपनी interview पर confirm/decline कर सकता है; schedule mutation
  company-side authorized actor तक सीमित रहेगी।

## 3. Verified database safety

- Schedule block में `TIMESTAMPTZ`, lock fields और company/application scope guards हैं।
- Interviewer overlap रोकने के लिए GIST exclusion constraint और booked block uniqueness
  मौजूद है।
- Interview, participant, audit और approved outbox writes एक transaction में होने चाहिए;
  Cloud/HTTP calls transaction के अंदर नहीं होंगे।

## 4. अभी invent नहीं किए जाएंगे

- कोई नया permission key
- `interview.*` event/task contract
- Calendar/video provider integration
- `interview.summary.requested` worker flow
- Minimum lead-time: **1 घंटा** (user decision)
- Idempotency column जो baseline में नहीं है

## 5. Coding gate

Coding शुरू करने से पहले निम्न policy values लिखित रूप से freeze हों:

1. Exact route paths.
2. Role/membership actor matrix और permission-key policy।
3. ऊपर का transition matrix और terminal behavior।
4. Past-slot, lead-time और timezone/DST rules।
5. Notification/reminder event ownership।
6. Idempotency policy।

इनमें से unresolved item को code में placeholder या guessed behavior से solve नहीं
किया जाएगा।
