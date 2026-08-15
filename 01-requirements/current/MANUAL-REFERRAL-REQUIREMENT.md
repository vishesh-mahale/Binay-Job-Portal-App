# Client Requirement — Manual Multi-Candidate Job Referrals

[← Requirements index](../README.md) · [Easy Hinglish summary](MANUAL-REFERRAL-SUMMARY-HINGLISH.md) · [Main project](../../README.md)

> यह approved original requirement full detail में preserve की गई है। इसका content
> summarize करके replace नहीं करना है।

## Status

Approved client requirement for the first production version.

## Business requirement

Any active registered user may refer one or more external candidates to a
published job. The referrer manually enters candidate details in the portal.
Each candidate receives a unique invitation link and independently decides
whether to ignore, decline, apply as a guest, or register/login and apply.

Referral is a capability, not a separate account role. A referrer may currently
be a candidate, employer, HR user, or admin.

## First-version scope

Included:

- Manual candidate detail entry
- Multiple manually added rows in one form submission
- Review and validation before confirmation
- One secure invitation per valid candidate
- Email invitation through the outbox/notification worker
- Guest Apply and Register/Login & Apply
- Open, apply, decline, expiry and delivery-failure tracking
- Duplicate protection and safe resend behavior
- Optional reward lifecycle kept separate from invitation delivery

Not included in this version:

- CSV or Excel upload
- Copy/paste spreadsheet parsing
- ATS/CRM integration
- Google Contacts import
- Recruiter-owned `My Candidates` database
- A separate recruiter account role

These may be added later without changing the basic invitation/application
separation.

## Referrer eligibility

The referrer must:

- Have an authenticated `users` account
- Have active account status
- Pass rate limits and abuse checks
- Refer only to an active/published job
- Not refer their own normalized email

The backend derives `referrer_user_id` from authentication. The client must
never submit or override this ownership field.

## Manual form

Each manually added candidate row contains:

```text
Candidate Name*     required
Candidate Email*    required
Candidate Phone     optional
Referral Note       optional
```

The job is taken from the job page/context. The referrer may use **Add Another
Candidate** to enter multiple candidates, including approximately 50 candidates,
and then review all rows before sending.

Example request DTO:

```json
{
  "jobId": "job-uuid",
  "idempotencyKey": "client-generated-request-key",
  "candidates": [
    {
      "name": "Rahul Sharma",
      "email": "rahul@example.com",
      "phone": "+919876543210",
      "note": "Strong Java developer"
    },
    {
      "name": "Amit Verma",
      "email": "amit@example.com",
      "phone": null,
      "note": null
    }
  ]
}
```

## Validation and preview

Before confirmation, show:

```text
Total entered
Valid
Duplicate in current form
Previously invited
Invalid email
Missing required data
```

NestJS must repeat all validation after submission. Frontend validation is only
for user experience and is not trusted for security.

Email normalization is trim + lowercase. Do not perform provider-specific Gmail
dot or plus-address rewriting. Phone numbers should be normalized to E.164 where
possible.

## Data model

```text
referral_batches
        ↓ one-to-many
referral_invitations
        ↓ zero-or-one after candidate applies
job_applications

referral_invitations
        ↓ optional one-to-one
referral_rewards
```

`referral_batches` groups one manual form submission and stores summary counts.
`referral_invitations` stores one candidate invitation. `referral_rewards` is
separate so email delivery, hiring outcome and payment state are not mixed.

## Invitation creation transaction

```text
BEGIN
  Validate authenticated active referrer
  Lock/read published job
  Validate and normalize all candidate rows
  Remove duplicates within request
  Detect candidates previously invited by same user to same job
  Insert one referral_batches row
  Insert one referral_invitations row per valid new candidate
  Insert one outbox event per invitation to be sent
COMMIT
```

The idempotency key prevents a retried request from creating a second batch.
Database uniqueness prevents concurrent duplicate invitations for:

```text
job_id + referrer_user_id + normalized candidate email
```

Previously invited candidates are not inserted again. NestJS may offer a safe
resend of the existing invitation and increment delivery-attempt metadata.

## Secure invitation link

NestJS generates a cryptographically secure random token. The email contains the
raw token once; the database stores only `invite_token_hash`.

```text
/jobs/{jobId}/referral/{rawToken}
```

On link access, NestJS hashes the supplied token and verifies:

- Matching invitation exists
- Job matches
- Invitation is not cancelled, declined, applied, or expired
- Current time is before `expires_at`

Raw tokens must never be stored in database logs, application logs, analytics,
or error responses.

## Candidate choices

```text
Invitation link
      ↓
Job details
      ├── Apply as Guest
      ├── Register/Login and Apply
      ├── Decline
      └── Ignore
```

Creating an invitation must not create:

- A `users` account
- A `candidate_profiles` row
- A `job_applications` row
- A resume/document record

The application is created only after explicit candidate action.

## Referral attribution policy

A referral is considered valid for attribution only when the candidate
explicitly engages with or confirms the invitation for that job.

- If the candidate applies through the valid invitation link, the invitation
  may be linked to that application and marked `applied`.
- If the candidate explicitly confirms the invitation through an approved flow,
  NestJS may attribute the matching application in the same audited transaction.
- If the candidate applies directly without using or confirming the invitation,
  the application must not be attributed automatically to the referrer.
- An unconfirmed invitation remains in its current lifecycle and eventually
  becomes `expired`; it does not earn referral credit merely because the same
  email later applied directly.
- A forwarded invitation cannot be attributed when the applicant identity, job,
  token, or normalized email does not match.

This policy ensures that referral credit and any future reward are based on
genuine candidate engagement, prevents opportunistic claims after a direct
application, and keeps the candidate's choice transparent.

## Application attribution transaction

When the candidate applies through a valid invitation:

```text
BEGIN
  Lock referral invitation
  Verify token, email/candidate identity, job and expiry
  Create registered or guest job application
  Create submitted snapshot and application history
  Link invitation.application_id to application
  Set invitation status = applied and applied_at
  Insert application/referral outbox events
COMMIT
```

The application job and applicant email/candidate must match the invitation.

## Invitation lifecycle

```text
pending → queued → sent → opened → applied
                     ├────→ applied
                     ├────→ declined
                     ├────→ expired
                     └────→ failed → queued (retry)
```

Cancellation is permitted before application. `applied`, `declined`, `expired`
and `cancelled` are terminal outcomes. Delivery workers update send-attempt and
error fields using bounded retry policy.

## Reward lifecycle

Rewards are not part of invitation delivery state. If enabled by product policy:

```text
not_eligible
    ↓
pending_eligibility
    ↓
eligible
    ↓
approved
    ↓
paid
```

Reward type/amount comes from platform/company policy, never referrer input.

## Authorization and privacy

- Any active authenticated user role may create referrals.
- Guest users cannot create referrals.
- A referrer may read only their own batches, invitations and rewards.
- Application/recruitment data remains protected by application/job/company
  authorization; referring a person does not grant access to their full profile.
- The referrer must confirm they are authorized to use the supplied contact data.
- Invitation email must identify the purpose, job, referring user/platform,
  optional nature of applying, opt-out path and retention behavior.
- Unapplied expired invitation contact data must follow the approved retention
  and deletion/anonymization policy.

## Acceptance criteria

- Any active candidate, employer, HR user or admin can refer candidates.
- No separate recruiter role is required.
- One form can manually submit multiple candidates.
- Invalid and duplicate candidates are reported before sending.
- Retrying the request does not duplicate the batch/invitations.
- Each valid candidate gets an independently tracked secure link.
- No account/profile/application is created before candidate consent.
- Candidate can guest-apply or register/login and apply.
- Same referrer cannot create duplicate invitation rows for the same job/email.
- Forwarded or mismatched invitation cannot be attributed to another applicant.
- Failed email delivery is retryable without creating another invitation.
- Referral reward state does not overwrite invitation/application state.
