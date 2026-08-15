# 18 Feedback — Platform feedback flow

## Current scope

यह एक simple one-shot feedback workflow है। User या guest feedback submit कर सकता है और admin उसे
triage करके `new`, `in_progress`, `resolved` या `closed` कर सकता है। यह support-ticket conversation
नहीं है। Replies, attachments और back-and-forth history future requirement हैं।

## Submission flow

```text
Registered user / Guest
          |
          v
Next.js feedback form
          |
          v
NestJS Feedback API
  |-- DTO validation
  |-- logged-in identity server context से
  |-- guest rate limit / CAPTCHA जहाँ लागू हो
  |-- metadata allow-list और sanitization
          |
          v
platform_feedback INSERT
status = new
```

Browser raw table में direct insert नहीं करेगा। इससे कोई attacker Supabase endpoint पर unlimited
guest rows डालकर validation, rate limit या CAPTCHA bypass नहीं कर सकता।

## Registered और guest row example

Registered submission:

```text
is_guest   = false
user_id    = logged-in user UUID
guest_*    = null
status     = new
```

Guest submission:

```text
is_guest   = true
user_id    = null
guest_name = Rahul Sharma
guest_email= rahul@example.com
guest_phone= +919876543210   (optional)
status     = new
```

Database constraint इन दोनों modes को mix नहीं होने देती। Guest के लिए name और email required हैं;
registered feedback में guest fields allowed नहीं हैं।

## कौन-से fields कौन लिखेगा

| Field group | Writer |
|---|---|
| Submitter, category, subject, message, rating | NestJS submission transaction |
| Sanitized metadata | NestJS allow-list के बाद |
| Status, admin notes | Authorized admin/service workflow |
| created_at, updated_at | Database |

Submission के बाद submitter/content/rating/metadata immutable हैं। Admin केवल lifecycle status और
admin notes बदल सकता है। Ordinary hard delete blocked है; future privacy/retention purge अलग controlled
maintenance workflow होगा।

नई row database level पर हमेशा `status = new` और `admin_notes = null` से शुरू होगी। इसलिए service
implementation की गलती से भी resolved/closed feedback सीधे insert नहीं हो सकती।

## Status flow

```text
new ───────────────> in_progress ─────> resolved ─────> closed
 |                       |                  |
 +---------------------->+----------------->+
                         ^
                         |
                  resolved -> in_progress
```

`closed` terminal है। Resolved issue दोबारा work माँगे तो `in_progress` हो सकता है।

## Read security

Raw table में guest email/phone, internal metadata और `admin_notes` हैं। RLS columns hide नहीं कर सकती,
इसलिए `anon` और `authenticated` को raw SELECT policy नहीं दी गई।

```text
User feedback history
        |
        v
NestJS ownership check
        |
        v
Safe response DTO
  (admin_notes/internal metadata omitted)
```

Admin queue भी NestJS admin authorization के through चलेगी। `service_role` browser, source code या
client logs में कभी expose नहीं होगी।

## Required tests

- Registered request में `user_id` request body से trust न हो; authenticated context से derive हो।
- Guest row बिना name/email fail हो।
- Registered row में guest fields fail हों।
- Blank/untrimmed message, invalid phone और non-object metadata fail हों।
- Browser roles का direct SELECT/INSERT/UPDATE/DELETE fail हो।
- Submission content बाद में update न हो सके।
- Valid और invalid status transitions test हों।
- Closed feedback ordinary workflow से reopen/delete न हो।
- NestJS user response में `admin_notes` और internal metadata expose न हों।

## Old file coverage audit

| Old area | Final treatment |
|---|---|
| `platform_feedback` core table/fields | Preserved and constraints hardened |
| Registered versus guest submission | Updated to exact mutually-exclusive modes |
| Category, rating and lifecycle status | Preserved |
| User/category/status/created indexes | Updated into three queue/history composite indexes |
| Guest direct INSERT policy | Not carried forward: NestJS validation/rate-limit/CAPTCHA replaces it |
| Registered own SELECT/UPDATE policy | Not carried forward: raw admin/internal columns unsafe; NestJS safe DTO replaces it |
| Direct admin `FOR ALL` policy | Not carried forward: admin authorization remains NestJS/server-side |
| Authenticated/anonymous table grants | Replaced with default-deny browser grants and explicit server access |
| Replies/support conversation | Not added; documented future requirement |
