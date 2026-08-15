# Manual Multi-Candidate Job Referral Requirement

[← Requirements index](../README.md) · [Full approved requirement](MANUAL-REFERRAL-REQUIREMENT.md) · [Main project](../../README.md)

> यह केवल आसान Hinglish overview है। Implementation और validation के लिए linked
> full approved requirement authoritative है। Summary कोई rule replace नहीं करती।

## Status

`APPROVED` client requirement for first production version।

## Business behavior

Any eligible active registered user published job पर one or more external candidates
को manually invite/refer कर सकता है। हर recipient unique invitation link से खुद
decide करेगा:

```text
Ignore
Decline
Apply as guest
Register/login and apply
```

Invitation account, candidate profile या application pre-create नहीं करेगी।

## First-version scope

Included:

- manual candidate rows;
- one submission में multiple candidates (approximately 50 supported UX target);
- client preview + server revalidation;
- independently tracked secure invitation per valid recipient;
- email via reliable background notification flow;
- open/apply/decline/expiry/delivery-failure tracking;
- guest और registered apply;
- duplicate/idempotency protection;
- optional reward lifecycle invitation से अलग।

Not included:

- CSV/Excel upload;
- spreadsheet copy/paste parsing;
- ATS/CRM/Google Contacts import;
- recruiter-owned candidate database;
- separate recruiter/referrer account role।

## Eligibility and ownership

- Referrer authenticated active `candidate`, `employer`, `hr` या `admin` हो सकता है।
- Job active/published और referral-eligible हो।
- Referrer अपना normalized email refer नहीं कर सकता।
- Rate limit, abuse और contact-data authorization confirmation required है।
- Backend authenticated identity से `referrer_user_id` derive करेगा; client इसे
  submit/override नहीं करेगा।

## Manual form

```text
Candidate name*   required
Candidate email*  required
Candidate phone   optional
Referral note     optional
```

Job current job-page/context से आएगा। UI “Add another candidate” और final preview
देगी। Frontend validation UX है; NestJS सारी validation repeat करेगा।

Normalization:

- email = trim + lowercase;
- Gmail/provider-specific dot/plus rewriting नहीं;
- phone जहाँ possible हो E.164 normalize;
- request और existing active/final invitation duplicates detect।

## Data/lifecycle separation

```text
referral batch
      ↓ one-to-many
referral invitations
      ↓ zero-or-one after recipient applies
job application

referral invitation
      ↓ optional separate lifecycle
referral reward
```

Referral invitation और application अलग entities हैं। 50 invitations का अर्थ 50
applications नहीं।

## Invitation creation transaction

```text
BEGIN
→ active authenticated referrer और published job validate/lock
→ rows normalize और validate
→ within-request/existing duplicates classify
→ idempotent batch create/reuse
→ valid new invitation rows insert
→ one notification outbox event per invitation insert
COMMIT
```

Same idempotency key retry duplicate batch नहीं बनाए। Same referrer + job + normalized
email पर active/non-reissuable duplicate invitation blocked रहे।

## Secure link

NestJS cryptographically secure random token बनाएगा। Raw token केवल recipient link
में जाएगा; database केवल hash रखेगी। Raw token logs/analytics/errors में नहीं जाएगा।

Link validation job, token hash, normalized recipient identity, status और expiry
check करेगी। Forwarded/mismatched token referral attribution नहीं देगा।

## Attribution policy

- Valid invitation link/approved explicit confirmation से apply होने पर attribution।
- Same email का direct unrelated application automatically referral नहीं बनेगा।
- Recipient/job/token/identity mismatch attribution reject करेगी।
- Unconfirmed invitation expire होगी और reward credit नहीं देगी।

Application attribution one transaction में application, immutable submitted
snapshot, history, invitation linkage/status और outbox events बनाएगी।

## Invitation lifecycle

```text
pending → queued → sent → opened → applied
                     ├──→ declined
                     ├──→ expired
                     └──→ failed → queued (retry)
```

Cancellation apply से पहले allowed है। Retryable failed delivery same invitation को
reuse करेगी। Explicit reissue केवल expired/cancelled historical invite के बाद new
token/row बनाएगी। Applied/declined invitation reissue नहीं होगी।

## Reward lifecycle

```text
not_eligible
→ pending_eligibility
→ eligible
→ approved
→ paid
```

Reward type/terms company/platform policy से आएँगे, referrer input से नहीं। `paid`
terminal होगा; approved financial terms uncontrolled edit नहीं होंगी। Cash/points को
amount चाहिए; gift/certificate metadata-driven हो सकते हैं।

## Privacy and authorization

- Referrer केवल own batches/invitations/rewards पढ़े।
- Referral से recipient का full candidate/application access नहीं मिलता।
- Email purpose, job, referrer/platform identity, optional application, opt-out और
  retention behavior explain करे।
- Expired unapplied contact data approved retention/anonymization policy follow करे।

## Acceptance criteria

- Eligible active user multiple candidates manually add कर सके।
- Invalid/duplicate rows preview में स्पष्ट हों और server भी enforce करे।
- Request retry duplicate batch/invitations न बनाए।
- Each valid recipient independent secure link पाए।
- Consent से पहले account/profile/document/application न बने।
- Guest और registered apply दोनों चलें।
- Mismatched/forwarded invite attribution reject हो।
- Delivery retry new invitation न बनाए।
- Reward, invitation और application states independently auditable रहें।
