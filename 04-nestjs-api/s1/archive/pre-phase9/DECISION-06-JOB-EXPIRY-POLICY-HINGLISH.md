# Decision 06 — Job Expiry Policy

**Status:** `FINAL — SIMPLE DAILY DATABASE SWEEP`

## Final decision

Automatic expiry current feature है। Candidate-facing query guard और daily physical expiry sweep दोनों लागू होंगे।

```text
status = published
deleted_at IS NULL
AND (expires_at IS NULL OR expires_at > NOW())
```

Apply transaction में यही check दोबारा लागू होगा।

## Final runtime flow

Database mein physical transition:

```text
published/paused → expired
```

```text
हर दिन 12:05 AM (Asia/Kolkata)
        ↓
Supabase pg_cron
        ↓
PostgreSQL expire_due_jobs() function
        ├── published/paused due jobs → expired
        └── in-app notifications table में row
```

Expiry notification के लिए Cloud Scheduler, NestJS cron, Cloud Tasks या Outbox Dispatcher का उपयोग नहीं होगा।

## Scope and trade-off

Agar HR dashboard, analytics, audit ya expiry notification ke liye actual `expired` status zaroori ho, tab review hoga:

```text
Google Cloud Scheduler
        ↓
OIDC-protected NestJS internal endpoint
        ↓
NestJS JobsModule transaction
        ↓
expired jobs ka physical status update
```

Candidate query में `expires_at > NOW()` guard रहेगा, इसलिए job expiry time के बाद candidate को तुरंत छिप जाएगी। Database status और in-app notification daily 12:05 AM sweep के बाद update होंगे। Exact-time notification इस decision का हिस्सा नहीं है।

Expiry function को status update और in-app notification insert atomic transaction में करना होगा। Email future में अलग approved outbox/email flow से जोड़ी जाएगी।

## Revisit checklist

- `expires_at IS NULL` ka meaning: recommended = never expires
- `published` aur `paused` jobs expire hongi ya nahi
- sweep cadence (recommended 15 minutes)
- audit/history requirement
- employer notification requirement
- status-change event/contract ki zarurat

**Reminder:** यह decision final है। Implementation से पहले function permissions, timezone और failure monitoring को test plan में cover करना है।
