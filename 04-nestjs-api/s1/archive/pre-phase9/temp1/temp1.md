# Next Decision — Notification Processing Architecture

## यह सवाल किन cases के लिए है?

यह decision केवल job expiry के लिए नहीं है। यह सभी future/current notifications के common processing path के लिए है:

- Job expired notification
- Candidate application received
- Application status changed
- Interview scheduled/rescheduled/cancelled
- New chat/message alert
- Resume parsing या profile processing complete
- Future email notification

## मुख्य सवाल

`notifications` table में notification row कौन बनाएगा?

### Option 1 — Outbox → Cloud Tasks → NestJS Notification Consumer

```text
Business event
   ↓
outbox_events
   ↓
Outbox Dispatcher
   ↓
notification-queue
   ↓
NestJS Notification Consumer
   ↓
notifications table
```

### Option 2 — Outbox → Direct NestJS Processor

```text
outbox_events
   ↓
NestJS Notification Processor
   ↓
notifications table
```

### Option 3 — PostgreSQL Function Direct Insert

```text
Database function / pg_cron
   ↓
notifications table
```

## Current job-expiry exception

Job expiry का approved simple flow अभी अलग है:

```text
Daily 12:05 AM (Asia/Kolkata)
   ↓
Supabase pg_cron
   ↓
expire_due_jobs()
   ├── jobs.status = expired
   └── in-app notifications row
```

यह decision बाकी notification cases के common architecture के लिए है।
