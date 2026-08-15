# 11 Messaging — Detailed Hinglish Explanation

## 1. Is file ka kaam

`11_messaging.sql` authorized users के chat records रखती है:

```text
Application / Interview / Direct context
                ↓
Conversation + participants
                ↓
Messages + optional attachments
                ↓
Read receipts / reactions / unread counters
```

Database durable truth रखती है। UI तक live message WebSocket, SSE या Supabase Realtime में से किस
transport से पहुँचेगा, वह अलग ADR में freeze होगा। Reconnect पर NestJS API/database state authoritative होगी।

## 2. Tables

| Table | Kaam |
|---|---|
| `conversations` | One chat thread और inbox summary |
| `conversation_participants` | कौन thread पढ़/send कर सकता है |
| `messages` | Actual text/system/file message |
| `message_attachments` | Scanned generic uploaded documents का immutable link |
| `message_read_receipts` | User ने कौन-सा message कब पढ़ा |
| `message_reactions` | Participant emoji reaction |

## 3. Conversation context

Application conversation:

```json
{
  "company_id": "company-abc",
  "conversation_type": "application",
  "application_id": "application-rahul",
  "interview_id": null,
  "subject": "Java Backend Developer application"
}
```

Interview conversation:

```json
{
  "company_id": "company-abc",
  "conversation_type": "interview",
  "application_id": null,
  "interview_id": "interview-round-1"
}
```

Application/interview context का company उस job की company से match होना जरूरी है। Direct/group
conversation context IDs नहीं रखती। एक row simultaneously application और interview conversation नहीं बनेगी।

## 4. Participants

```text
admin   → participant/settings management by authorized API
member  → read + send + react
viewer  → read only; send/react नहीं
```

Lifecycle:

```text
active  → left / removed / blocked
```

Active participant का `left_at = NULL`; inactive status के साथ `left_at` required है। Same user same
conversation में duplicate participant नहीं बनेगा। Participant removal ordinary row delete से नहीं,
status/left timestamp से represent होगा।

## 5. Message send flow

```text
Next.js
   ↓ POST /conversations/:id/messages
NestJS
   ↓ auth + active participant + role check
BEGIN
   messages INSERT
   sync trigger updates conversation preview/count/unread counters
   outbox_events(message.created) INSERT when notification/live fan-out is required
COMMIT
   ↓
Realtime adapter pushes event to currently connected authorized clients
```

Database sender guard ensures:

- sender conversation का active participant है;
- `viewer` send नहीं कर सकता;
- reply का parent उसी conversation का message है।

Trusted service-generated `system`, `interview_invite` और `application_update` messages में
`sender_id = NULL` हो सकती है; fake service-user account की जरूरत नहीं। Normal text/image/file message
के लिए authenticated active participant sender mandatory है। System message insert केवल NestJS/service
path कर सकती है, browser arbitrary system event create नहीं करेगा।

## 6. Message content

Text example:

```json
{
  "conversation_id": "conversation-1",
  "sender_id": "candidate-rahul-user",
  "message_type": "text",
  "body": "I am available for the interview at 10 AM.",
  "metadata": {}
}
```

Blank text reject होगा। `metadata` JSON object होगी। System/invite/update message body optional हो सकती
है क्योंकि structured metadata event describe कर सकता है।

## 7. Attachment flow

File-only message में child attachment message insert के बाद same transaction में add होती है:

```text
BEGIN
  messages INSERT (type=file)
  message_attachments INSERT
  require document active + security_scan_status=clean
  require uploaded_by = document owner
  require uploader active conversation participant
  outbox message.created
COMMIT
```

अगर attachment insert fail हो तो पूरा transaction rollback होगा; empty file message commit नहीं करनी है।
Attachment relation update/delete नहीं होगी। Signed URL NestJS authorization के बाद generate होगी;
public storage URL database में नहीं रखा जाएगा।

## 8. Conversation summary और unread count

New message insert trigger atomically:

```text
conversations.last_message_at
conversations.last_message_id
conversations.last_message_preview
conversations.last_message_sender_id
conversations.message_count + 1
other active participants unread_count + 1
```

Sender का unread count increment नहीं होता। Read API transaction receipt upsert, participant
`last_read_at` और authoritative unread count update करेगी। Client request का arbitrary unread number
trust नहीं किया जाएगा।

Latest message edit/soft-delete होने पर `last_message_id` की मदद से inbox preview refresh होगी। पुराने
message edit से current latest preview overwrite नहीं होगी।

## 9. Read receipts और reactions

Read receipt/reaction user उसी conversation का active participant होना चाहिए। Viewer receipt बना सकता
है लेकिन reaction नहीं। Same message/user receipt duplicate नहीं होगी; same reaction duplicate नहीं होगी।

## 10. Edit और delete

Message identity immutable है:

```text
conversation_id
sender_id
message_type
parent_message_id
created_at
```

Edit में body/metadata change के साथ `is_edited`, `edited_at`, `edited_by` audit fields required हैं।
Delete physical DELETE नहीं:

```text
is_deleted = true
deleted_at = now
deleted_for_everyone = policy result
```

Soft-deleted message आगे immutable रहती है। API deleted body/attachment visibility moderation policy के
अनुसार DTO में hide करेगी; raw service-role rows browser को expose नहीं होंगी।

## 11. Authorization और realtime

| Layer | Responsibility |
|---|---|
| Next.js | UI और live connection; ownership IDs decide नहीं करेगी |
| NestJS | Auth, conversation context, participant role, moderation policy |
| PostgreSQL | Durable rows, relational guards, counters, RLS |
| Realtime adapter | Committed event connected clients तक push |
| Notification worker | Offline/in-app/email policy के अनुसार notification |

Realtime delivery failure message transaction rollback नहीं करेगी। Message पहले DB में commit होगी;
client reconnect/status/history endpoint से missed messages recover करेगा।

`17_rls.sql` review में messaging read policies को `participant.status = active` और `left_at IS NULL`
दोनों require करना होगा। Mutations NestJS/service-only रहेंगी।

## 12. One-line memory rule

> `11` authorized conversation history की durable truth है; realtime केवल committed messages की fast
> delivery है, और reconnect के बाद database history ही final source है।
