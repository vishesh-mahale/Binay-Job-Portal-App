# 12 Notifications — Explanation (Hinglish)

## 1. Is file ka kaam

`12_notifications.sql` application ke durable notifications ko store karta hai. Iska kaam chat messages store karna nahi hai; chat ka source of truth `11_messaging.sql` hai.

```text
Application / interview / referral / account event
                    |
                    v
             outbox_events row
                    |
                    v
       notification worker / NestJS
          | template + preferences resolve
          v
             notifications row
          /          |           \
      in-app       email        push/SMS
                     |              |
                     +------v-------+
                    notification_delivery_log
```

`notifications` row durable truth hai. WebSocket/SSE/Realtime sirf UI ko turant batane ka transport hoga; event miss hone par UI database/API se notification dobara padh sakti hai.

## 2. Tables aur responsibility

| Table | Kya store hota hai | Kaun write karega |
|---|---|---|
| `notification_templates` | Event ke versioned in-app/email/push/SMS templates | Admin via NestJS |
| `user_notification_preferences` | User ke channel, event override, digest aur quiet-hours choices | User via NestJS |
| `notifications` | User ke inbox ki final rendered notification | Trusted notification workflow |
| `notification_delivery_log` | Har external channel ka current delivery/retry result | Worker/provider adapter |
| `device_tokens` | Web/mobile push token | Authenticated device via NestJS |

## 3. Template lifecycle

Har `(event_type, locale)` ke multiple versions ho sakte hain, lekin ek time par sirf ek active version hoga.

```text
Draft v1
   | admin preview + approved variables validation
   v
Active v1  -----------------> Retired v1
                                  |
                                  v
                          Draft v2 -> Active v2
```

- Naya version hamesha draft insert hoga.
- Active/published content edit nahi hoga.
- Change ke liye next `version_number` insert hoga.
- `allowed_variables` batata hai ki renderer kin placeholders ko accept kare.
- NestJS preview, missing/unknown variable validation, escaping aur safe HTML rendering karega.
- Provider secrets/URLs SQL template me store nahi honge.

Example template data:

```json
{
  "event_type": "application.status_changed",
  "locale": "en",
  "version_number": 1,
  "templates": {
    "in_app": {
      "title": "Application updated",
      "body": "Your {{job_title}} application is now {{status}}"
    },
    "email": {
      "subject": "Application update: {{job_title}}",
      "body": "<p>Your application is now {{status}}</p>"
    }
  },
  "allowed_variables": ["job_title", "status"]
}
```

## 4. Preference resolution

Worker delivery channels decide karte waqt broadly ye order use karega:

```text
event policy (mandatory/security ya optional)
        + personal/company preference
        + event_preferences override
        + quiet hours / digest rule
        + rate limit
        = final channels
```

Personal preference me `company_id = NULL` hota hai. Company-context preference me `company_id` present hota hai. Partial unique indexes duplicate personal/company preference rows ko rokte hain.

Security-critical notification ko user preference se suppress karna allowed hai ya nahi, ye NestJS event policy decide karegi—not a generic database boolean.

## 5. Ek notification ka example flow

Maan lo HR ne Vishesh ki application shortlist ki:

```text
1. NestJS application status transaction commit karta hai.
2. Usi transaction me outbox_events pending row banti hai.
3. Background workflow event claim karta hai.
4. Active template + Vishesh ki preferences read hoti hain.
5. Variables safely render hote hain.
6. notifications me idempotency_key ke saath ek row insert hoti hai.
7. Email selected hai to notification_delivery_log me email row banti hai.
8. Provider send ke baad row sent/delivered/failed hoti hai.
9. Realtime signal se UI ko refresh/read karaya jata hai.
```

`idempotency_key` same outbox event retry par duplicate inbox notification ko rokegi. Recommended form event-derived stable key hai, jaise `notification:<event-id>:<recipient-id>`.

## 6. In-app state aur external delivery alag kyun hain

`notifications.is_read/read_at/is_archived` user inbox state hai. Email/push delivery ka result `notification_delivery_log` me hota hai.

```text
Email delivered != notification read
Push failed      != in-app notification failed
```

User sirf apni notification ko safe workflow se read/archive karega. Recipient, title, body, entity link ya event identity edit nahi kar sakta. Hard delete blocked hai; `deleted_at` audit-preserving soft delete hai.

## 7. Retry behavior

External channel ke liye ek notification par ek delivery row hogi. Retry usi row me `attempt_count`, `last_attempt_at`, `next_retry_at`, `status` aur error update karega.

```text
pending -> sent -> delivered -> opened -> clicked
   |
   v
 failed -> retry pending/failed -> sent

bounced = provider ka terminal delivery result
```

Exact provider callback ordering aur retry limits worker/provider adapter policy me honge. Database identity ko immutable aur attempt count ko non-decreasing rakhta hai.

## 8. Device token safety

Device token sensitive routing data hai. Browser ko token table freely read nahi karni chahiye. Register/rotate/deactivate NestJS endpoint se hoga; notification worker active token read karega. Logout, invalid-provider response ya token rotation par old token inactive kiya jayega.

## 9. 17_rls.sql me final enforcement

RLS/grants pass me ye rules enforce karne hain:

- Template create/update/activate/retire admin-only controlled path.
- User sirf apni non-deleted/non-expired notification read kare.
- Direct full-row notification UPDATE allow na ho; safe read/archive workflow ho.
- Preferences aur device-token mutation authenticated NestJS boundary se ho.
- Delivery log aur provider error/IDs service-only hon.
- Device tokens client SELECT se expose na hon.
- Company-context notification tenant authorization verify kare.
- Realtime topic/channel authorization recipient identity se bind ho.

## 10. NestJS aur worker responsibility

NestJS/admin workflow:

- template draft/version/preview/activation
- preference validation
- safe read/archive endpoints
- device-token registration/rotation
- notification API pagination/unread count
- authorized live-update connection

Notification worker/provider adapters:

- outbox event consume karna
- idempotency key banana
- template/preference/policy resolution
- safe rendering
- delivery row create/update
- rate limit, retry aur provider callback handling

SQL:

- durable state, uniqueness, lifecycle integrity, audit retention aur query indexes

