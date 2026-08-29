# Interview API — Decision Recommendation (Pre-Freeze)

यह document coding नहीं करता। इसका उद्देश्य छह खुले decisions के लिए स्पष्ट,
कम-जटिल और repository-compatible recommendation देना है। जहाँ business approval
जरूरी है वहाँ `USER DECISION REQUIRED` लिखा है।

## Recommended decisions

### 1. Routes — Option C (दोनों scopes)

```text
POST  /api/v1/companies/:companyId/applications/:applicationId/interviews
GET   /api/v1/companies/:companyId/interviews
GET   /api/v1/companies/:companyId/interviews/:interviewId
PATCH /api/v1/companies/:companyId/interviews/:interviewId
POST  /api/v1/companies/:companyId/interviews/:interviewId/cancel

GET   /api/v1/me/interviews
GET   /api/v1/me/interviews/:interviewId
POST  /api/v1/me/interviews/:interviewId/confirm
POST  /api/v1/me/interviews/:interviewId/decline
```

Company routes scheduling/management के लिए हैं। `/me` routes candidate के अपने
interviews के लिए हैं। Candidate company route से arbitrary schedule mutation नहीं
कर सकता।

### 2. Actors और authorization

- Schedule/reschedule/cancel: active same-company owner/employer/HR, subject to the
  final company authorization policy.
- Assigned interviewer: उसी company का active `company_members` member होना अनिवार्य।
- Candidate: केवल अपने interview को confirm या decline कर सकता है।
- Complete/no-show और feedback: assigned interviewer या authorized company HR/owner।
- Admin: existing global admin policy के अनुसार।

**महत्वपूर्ण:** baseline में कोई canonical interview permission key नहीं है। इसलिए
`manage_interviews` जैसा key code में invent नहीं होगा। यह point user decision है:
मौजूदा role + active membership पर्याप्त है, या reviewed JSONB permission key/schema
change चाहिए।

### 3. Status policy

Baseline enum के exact values:

```text
scheduled, confirmed, rescheduled, completed, cancelled, no_show
```

Recommended transitions:

```text
scheduled   -> confirmed | rescheduled | cancelled | no_show
confirmed   -> rescheduled | completed | cancelled | no_show
rescheduled -> confirmed | completed | cancelled | no_show
completed / cancelled / no_show -> terminal
```

Reschedule पुरानी row को overwrite नहीं करेगा। नई row बनेगी और उसका
`rescheduled_from` पुरानी interview को point करेगा। NestJS matrix enforce करेगा,
क्योंकि baseline में interview transition function नहीं है।

### 4. Time policy

- Input: ISO-8601 timestamp with explicit offset और valid IANA timezone।
- Storage: existing `TIMESTAMPTZ`; timezone string भी preserve होगी।
- Past slot reject होगा।
- Minimum lead time: **1 घंटा**। इससे कम समय वाले slots reject होंगे।
- Invalid/non-existent DST local time reject होगा; ambiguous DST time में explicit
  offset अनिवार्य होगा।

### 5. Notifications और integrations

- Interview create/reschedule/cancel/confirm के लिए event contracts पहले approve होंगे;
  बिना contract कोई event name या dispatcher route invent नहीं होगा।
- Calendar provider और automatic video-room creation future scope रहेंगे।
- Current API केवल manually supplied meeting link स्वीकार करेगा, यदि final DTO इसे
  अनुमति दे।
- Reminder mechanism को existing approved scheduler/worker contract मिलने तक gated
  रखा जाएगा।

### 6. Concurrency और idempotency

- Booking transaction में schedule block row lock होगी।
- Existing GIST exclusion और `schedule_block_id` uniqueness duplicate/overlap रोकेंगे।
- Conflict पर safe `409` response; partial interview/participant rows नहीं बचेंगी।
- Baseline में persisted idempotency key नहीं है। इसलिए initial implementation में
  `schedule_block_id` natural idempotency guard रहेगा; अलग idempotency column जोड़ना
  **USER DECISION REQUIRED** है।

## Freeze checklist

Coding शुरू करने से पहले user को केवल ये दो business choices confirm करनी हैं:

1. क्या मौजूदा role + active membership interview authorization के लिए पर्याप्त है?
2. क्या `schedule_block_id` natural idempotency पर्याप्त है?

बाकी recommendations schema और existing architecture से directly grounded हैं।
