# 17 RLS — Authorization aur direct database access

## Is file ka purpose

`17_rls.sql` decide karti hai ki browser ke `anon` aur `authenticated` roles kaun-si rows direct
padh sakte hain. Normal business writes NestJS own karta hai; approved background outputs restricted
FastAPI worker likhega. `service_role` key sirf server par rahegi.

```text
Next.js / mobile client
        |
        | JWT + API request
        v
NestJS authorization + business transaction
        |
        +--> business rows
        +--> outbox_events
        v
Supabase PostgreSQL
```

Browser ko direct business `INSERT`, `UPDATE` ya `DELETE` dene se candidate profile revision,
application history, referral lifecycle aur outbox transaction bypass ho sakte the. Isliye direct
business writes revoke hain.

## RLS aur safe DTO ka difference

RLS rows filter karti hai, columns nahi. `jobs` row mein public description ke saath internal approval
IDs, AI profile aur operational metadata bhi hai. Published job par direct table policy dene se poori
row expose hoti. Isliye mixed public/internal tables NestJS ke safe response DTO se milengi:

- companies aur organization structure
- jobs, job skills aur locations
- recruiter candidate search
- interviews aur confidential feedback
- subscriptions, invoices aur coupons
- analytics, audit aur error logs

## Direct safe reads

Direct reads sirf yahan hain:

1. Active job categories, skills aur public subscription plans.
2. Logged-in user ki apni account aur security history.
3. Candidate ki apni profile, facts aur evidence.
4. Candidate ki apni applications, documents aur snapshots.
5. Referrer ki apni referral batches, invitations aur rewards.
6. Sirf active conversation participant ka chat data.
7. Notifications, device tokens, document storage/security metadata aur candidate
   search projection NestJS safe DTO se milte hain; raw table direct readable nahi hai.

In tables mein bhi browser ko direct mutation permission nahi hai.

## Correct kiye gaye important risks

| Purana risk | Final rule |
|---|---|
| User apni `users` row se role/status badal sakta tha | Own update policy removed; NestJS workflow only |
| Verified company ki full row public thi | Direct company policy removed; safe DTO |
| Published job ki AI/internal columns public thi | Direct jobs policy removed; safe DTO |
| Candidate facts par direct `FOR ALL` tha | Own read only; logical-save transaction required |
| Left/blocked chat member history padh sakta tha | `status='active'` aur `left_at IS NULL` dono required |
| Notifications/device/document internal columns expose ho sakte the | Direct table read/write removed; NestJS safe DTO |
| Plan policy sirf `is_active` dekhti thi | `is_active AND is_public` required |
| `coupon_plan_eligibility` RLS se missing thi | RLS enabled; service-only |

## Outbox permissions

Dispatcher aur Recovery server-side approved functions use karte hain:

```text
claim_outbox_events
mark_outbox_event_published
mark_outbox_event_failed
outbox_recovery_needed
```

Browser roles ko in functions ka `EXECUTE` nahi milta. Current configuration mein server-side
Dispatcher/Recovery `service_role` use karenge. Future custom database roles tabhi add honge jab unke
exact provisioning aur credentials ka reviewed decision hoga.

## Required tests

- Candidate A, Candidate B ki profile/application/document na padh sake.
- Company A user, Company B ke internal records na padh sake.
- Browser direct role/profile-fact/application-status mutation fail ho.
- Removed participant messages/attachments/receipts/reactions na padh sake.
- Candidate confidential interview feedback direct na padh sake.
- `anon` ko sirf active categories, skills aur public plans milen.
- Outbox functions browser roles se fail aur server role se pass hon.

```text
RLS/grants          = default deny + limited safe reads
NestJS              = authorization + safe DTO + business writes
FastAPI             = approved parsing/AI/projection output
Dispatcher/Recovery = approved outbox functions
Next.js             = API consumer, privileged DB writer nahi
```
