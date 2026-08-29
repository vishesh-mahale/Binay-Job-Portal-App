# In-App Header Notification — Requirement और Current Architecture

## 1. Actual product requirement

User को application के header में in-app notifications दिखनी चाहिए:

```text
🔔 1
Job expired
Application status updated
Interview scheduled
New message
```

### User portal पर active हो

नई notification आने पर header badge/list live update होनी चाहिए।

### User portal पर active न हो

Notification database में save रहे। User बाद में login/open करे तो unread notification header में दिखे।

### Channels

- अभी required: केवल in-app notification
- Email अभी header notification के लिए required नहीं
- Future में email channel अलग से जोड़ा जा सकता है

### Chat distinction

- `messages` table: actual chat message content
- `notifications` table: header alert, जैसे `New message from Rahul`

---

## 2. Notification data

पूरी application के in-app alerts के लिए एक `notifications` table उपयोग होगी। अलग-अलग event types की अलग rows बनेंगी:

```text
event_type: job.expired
event_type: application.received
event_type: application.status.changed
event_type: interview.scheduled
event_type: message.created
event_type: resume.processing.completed
```

Typical fields:

```text
user_id
event_type
title
body
entity_type
entity_id
is_read
channels = { "in_app": true }
created_at
```

---

## 3. Current approved job-expiry flow

Job expiry का simple flow अलग और final है:

```text
हर दिन 12:05 AM (Asia/Kolkata)
        ↓
Supabase pg_cron
        ↓
expire_due_jobs() PostgreSQL function
        ├── published/paused due jobs → status = expired
        └── notifications table में in-app row
```

Candidate-facing queries में `expires_at > NOW()` guard रहेगा, इसलिए candidate को expiry time के बाद job तुरंत hide होगी और नया apply block होगा। HR/Admin dashboard में effective status `Expired` दिखेगा।

इस job-expiry path में Cloud Tasks, Outbox Dispatcher और notification worker नहीं लगेंगे।

---

## 4. Current live UI delivery flow

```text
NestJS notification row create/commit
        ↓
Connected user को WebSocket/SSE event
        ↓
Next.js header badge/list update
```

यदि realtime connection टूट जाए:

```text
Next.js reconnect/open
        ↓
GET /notifications?unread=true
        ↓
notifications table से missed rows
        ↓
Header update
```

`notifications` table durable source of truth है। WebSocket/SSE केवल live delivery optimization है।

---

## 5. बाकी notification events का proposed flow

इन events के लिए common path अभी agent review के लिए खुला है:

- Candidate application received
- Application status changed
- Interview scheduled/rescheduled/cancelled
- New chat/message alert
- Resume/profile processing completed
- Future email notification

### Simple proposed path

```text
NestJS business action
        ↓
Same transaction में notifications row
        ↓
COMMIT
        ↓
NestJS WebSocket/SSE event
        ↓
Next.js header
```

इस simple path में notification के लिए अलग Dispatcher या Cloud Tasks जरूरी नहीं हैं।

### Alternative under review

```text
business outbox event
        ↓
Outbox Dispatcher
        ↓
Cloud Tasks
        ↓
NestJS Notification Consumer
        ↓
notifications table + realtime event
```

यह अधिक reliable/retryable है, लेकिन अधिक components जोड़ता है। इसे product requirement समझकर automatically लागू नहीं करना है।

---

## 6. Crash/retry/recovery का वास्तविक अर्थ

ये user-facing requirement नहीं, engineering failure cases हैं। उदाहरण:

- Database row save हो गई लेकिन WebSocket event fail हो गया → user reconnect पर table से notification पाएगा।
- Business action के बाद notification row बनने से पहले process crash हो गया → notification missing हो सकती है; outbox या same-transaction insert इस gap को रोकता है।

हम अभी केवल इन failure cases के कारण extra infrastructure जोड़ने का निर्णय नहीं कर रहे हैं। पहले requirement और acceptable complexity तय होगी।

---

## 7. Agent से पूछने वाला open question

```text
हमारी actual requirement केवल यह है:
1. Active user को header notification live मिले।
2. Offline user के लिए notification table में save रहे और login पर दिखे।
3. अभी केवल in-app channel चाहिए; email future में आएगी।

क्या इस requirement के लिए:

A. NestJS transaction → notifications row → WebSocket/SSE

पर्याप्त है?

या

B. हर notification के लिए Outbox Dispatcher → Cloud Tasks → NestJS Notification Consumer
अनिवार्य रखना चाहिए?

Decision देते समय बताएं:
- कौन-सा हिस्सा वास्तविक requirement है
- कौन-सा केवल reliability hardening है
- कौन-सा overengineering होगा
- reconnect और unread recovery कैसे होगी
- अगर A या B से बेहतर कोई तीसरा alternative हो, तो उसे भी identify करें
- हर alternative के फायदे, नुकसान, complexity और cost compare करें
- कोई option recommend करने से पहले repository architecture और existing database/contracts से cross-check करें
- अपना पूरा independent response इसी folder में अपनी agent पहचान के नाम से नई `.md` file में लिखें
- उदाहरण: `qoder-IN-APP-NOTIFICATION-AUDIT.md`, `freebuf-IN-APP-NOTIFICATION-AUDIT.md`
- केवल chat response न दें; report file में भी save करें
```

**Status:** Job-expiry flow final है। बाकी notification processing path अभी final नहीं है।
