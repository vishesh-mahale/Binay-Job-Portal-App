# Job Editing After Applications -- Corner Case Design

> This document contains both finalized rules and review prompts. Sections that
> ask an unresolved question are not implementation authority until the related
> product decision is approved. Current executable truth remains `05_jobs.sql`,
> `09_applications.sql` and the finalized background-worker documents.

## Problem

A recruiter publishes a job with Angular skills. After candidates apply,
the recruiter changes the requirement to React.

## Field Categories

### Administrative

-   vacancies
-   expires_at
-   is_featured
-   is_urgent
-   views_count
-   applications_count

Action: Update directly. No AI regeneration.

### Business

-   salary_min/max
-   location
-   work_mode
-   employment_type

Action: Update directly. AI regeneration only if business rules require
it.

### Semantic

-   title
-   description
-   requirements
-   responsibilities
-   preferred_qualifications
-   job_skills

These change the meaning of the job.

## Decision

### If applications_count = 0

-   Update job
-   Regenerate Ideal Candidate JSON
-   Regenerate Embedding
-   Refresh search data

### If applications_count \> 0 and semantic fields changed

Show warning: 'This job already has applicants. Editing core
requirements may affect existing applications.'

Options: - Clone as New Job (Recommended) - Continue Editing

If Continue: - Update job - Insert outbox event in the same transaction - Audit log

## NestJS

-   Detect changed fields
-   Categorize changes
-   Check applications_count
-   Insert the versioned job-AI regeneration outbox event if required
-   Store audit log

## Next.js

-   Show warning dialog
-   Call correct API based on user choice

## Recommendation

Prefer Clone Job for major semantic changes after applications exist.



यह सवाल बहुत अच्छा है। सच कहूँ तो **बड़े Job Portal (Naukri, LinkedIn Jobs, Indeed, Greenhouse, Lever)** बनाने में 80% काम CRUD नहीं होता, बल्कि ऐसे ही **corner cases** handle करने में होता है।

तुमने जो Angular → React वाला case पकड़ा, वह **Enterprise-level corner case** था। ऐसे और भी कई cases हैं जिन्हें पहले से design कर लेना चाहिए।

---

# 1. Job Edit After Applications (⭐⭐⭐⭐⭐)

**तुमने already identify कर लिया।**

Example:

```
Angular

↓

React
```

**Decision:**

* Warning
* Clone Job Recommended
* Audit Log

---

# 2. Job Expired While Candidate Is Applying (⭐⭐⭐⭐⭐)

Candidate ने Apply button दबाया।

उसी समय

HR ने Job Close कर दी।

अब क्या होगा?

### Solution

Apply API में हमेशा check होगा

```
status == published

AND

expires_at > NOW()
```

अगर नहीं

```
409

Job is no longer accepting applications.
```

---

# 3. Duplicate Apply (⭐⭐⭐⭐⭐)

Candidate

5 बार Apply कर देता है।

### Solution

```
UNIQUE

(candidate_id, job_id)
```

---

# 4. Resume Updated After Applying (⭐⭐⭐⭐)

Candidate ने Apply किया।

फिर Resume बदल दिया।

Question

Recruiter कौन सा Resume देखे?

### Production

Application के समय

Resume Snapshot

save करो।

---

# 5. Job Deleted After Applications (⭐⭐⭐⭐⭐)

HR

Delete

दबा देता है।

1000 Applicants हैं।

### Never

Hard Delete

### Always

Soft Delete

---

# 6. Company Branch Deactivated

Job

Mumbai Branch

से linked है।

फिर

Branch inactive हो गई। Ordinary job/member workflows branch को hard-delete नहीं
करेंगे।

Job?

Applicant?

Analytics?

### Solution

Snapshot fields

already हैं

```
location_city

location_country
```

इसलिए

history safe रहेगी।

Existing job की denormalized location snapshot historical display के लिए safe
रहेगी। New assignment/publish flow inactive branch select नहीं करेगा।

---

# 7. AI Service Down

Configured AI provider

Timeout

500 Error

### Solution

Job Publish

हो जाए

Outbox → Dispatcher → Google Cloud Tasks → Cloud Run FastAPI

Retry

Later

---

# 8. Embedding Failed

JSONB

बन गया

Embedding fail

### Solution

```
embedding_status

pending

completed

failed
```

तुमने

already

बना रखा है।

---

# 9. Duplicate Job Posting

HR

5 बार

Same Job

Post कर देता है।

### Solution

Similarity

check

before publish

---

# 10. Salary Changed After 500 Applicants

पहले

```
20 LPA
```

फिर

```
10 LPA
```

Applicants

complain

करेंगे।

### Solution

Warning

Audit Log

---

# 11. Candidate Applying While Job Editing

HR

Save

Candidate

Apply

एक ही समय

### Solution

Transaction

*

Row Lock

---

# 12. Job Skill Deleted

Admin

Angular

Inactive

कर देता है।

Existing Jobs?

### Solution

Never

Delete

Mark

Inactive

---

# 13. Company Verification Removed

Company

Verified

Job Published

फिर

Verification

Failed

### Decision

Current Jobs

Hide?

Pause?

Keep?

Policy

define करनी होगी।

---

# 14. AI Model Changed

पहले

Gemini

Embedding

V1

फिर

Gemini

Embedding

V2

पुरानी Jobs?

### Solution

Reviewed background re-embedding campaign

---

# 15. Search Index Out of Sync

Embedding

updated

Search

updated

लेकिन

Trigger

fail

### Solution

Outbox/processed-event reconciliation और explicit replay/rebuild job. Nightly
full rebuild correctness का primary mechanism नहीं है।

---

# 16. Job Cloned

Clone

करते समय

क्या

copy होगा?

Applicants?

Views?

AI?

### Recommendation

Copy

Only

Job Data

Not

Analytics

---

# 17. Multiple HR Editing Same Job

HR1

Title

change

HR2

Skills

change

Same

Time

### Solution

Optimistic Locking

या

Version

column

---

# 18. Company Subscription Expired

Paid

Job

Running

Subscription

Expired

### Decision

Pause?

Keep?

Hide?

---

# 19. Candidate Blacklisted

Candidate

Already Applied

Later

Blacklisted

### Decision

Keep

Application

or

Hide?

---

# 20. Job Imported From Excel

500 Jobs

Import

AI

500 Times?

### Solution

Batch Queue

---

# मेरी सलाह

मैं इस पूरे project के लिए एक document बनाऊँगा:

> **"Job Portal Corner Cases & Enterprise Business Rules.md"**

इसमें लगभग **70–100 real-world corner cases** होंगे, जैसे:

* Job Management
* Applications
* Resume
* AI
* Search
* Notifications
* Company
* Billing
* Authentication
* Security
* Concurrency
* Analytics
* Audit
* Admin
* Multi-company
* Resume Parsing
* Interview Scheduling
* Email/Webhooks
* Background Jobs

यह document development शुरू होने से पहले बना लिया जाए तो बाद में बहुत सारे production bugs और redesign से बचा जा सकता है। मुझे लगता है कि आपके जैसे AI-powered Job Portal के लिए यह सबसे valuable architecture documents में से एक होगा।
