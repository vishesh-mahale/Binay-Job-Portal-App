# Binay Job Portal — NestJS API Complete Requirements

**Author:** Freebuff (Codebuff Agent)
**Date:** 2026-08-22
**Source:** Cross-referenced from PRODUCT-REQUIREMENTS.md, NON-FUNCTIONAL-REQUIREMENTS.md, all 18 SQL migrations, 4 product decisions, NESTJS-IMPLEMENTATION-GUIDE.md, 07-fastapi-ai-worker, 05-outbox-dispatcher-nestjs, and architecture docs.

---

## 1. Executive Summary

NestJS API is the **primary user-facing backend** for Binay Job Portal. It handles:
- Authentication & authorization (via Supabase Auth)
- All business logic (CRUD, workflows, transactions)
- Outbox event writing (within same transaction as business rows)
- Storage authorization & signed URLs
- Input validation, rate limiting, idempotency
- WebSocket/SSE for real-time features

**Key boundary:** NestJS does NOT do heavy AI work (that's FastAPI's job). NestJS writes outbox events; Dispatcher picks them up.

---

## 2. Architecture Position

```
Next.js (UI)
    |
    | HTTPS API / WebSocket / SSE
    v
NestJS API  <-- THIS PROJECT
    |-- Supabase Auth operations
    |-- Input validation + authorization
    |-- PostgreSQL business transactions
    |-- Private Storage authorization/signed URLs
    |-- Business rows + outbox_events in SAME transaction
    v
Supabase PostgreSQL
    |
    | INSERT webhook on outbox_events
    v
Outbox Dispatcher (05-outbox-dispatcher-nestjs)
    |
    v
Google Cloud Tasks Queue
    |
    v
FastAPI AI Worker (07-fastapi-ai-worker)
    |-- Parsing / OCR / AI / embeddings
    |-- Restricted result/evidence/projection writes
    v
Supabase PostgreSQL
```

---

## 3. Account Model & Roles

### 3.1 Application Roles (APPROVED — PD-001)

```
candidate | employer | hr | admin
```

- One account = ONE application role
- Referral is NOT a separate role; any active authenticated user can refer
- Role stored in `users.role` enum
- `user_roles` table does NOT exist in current schema

### 3.2 Role Responsibilities

| Role | Capabilities |
|---|---|
| **candidate** | Register, profile, resume upload, job search/apply, track applications, referrals, interviews, messaging |
| **employer** | Company management, job CRUD, applicant tracking, shortlisting, interviews, analytics, subscriptions |
| **hr** | Under employer: jobs, candidates, applications, shortlisting, interviews, messaging (company-scoped) |
| **admin** | Platform-wide: users, companies, jobs, analytics, notification templates, security/audit logs |

### 3.3 Authorization Rules

- Role alone is NOT sufficient for resource access
- HR must have active `company_members` membership + required permission
- Ownership, company scope, and resource context must ALL be checked
- Request body owner UUIDs are NEVER trusted; derived from auth identity

---

## 4. Authentication & Authorization

### 4.1 Signup Flow

```
Next.js POST /auth/signup
  -> NestJS DTO validation + rate limit
  -> Supabase Auth signup
  -> auth.users INSERT
  -> DB trigger public.handle_new_user()
  -> public.users row created
  -> candidate role: create_empty_candidate_profile trigger
  -> candidate_profiles row created
  -> NestJS safe response
```

**NestJS must NOT:**
- Manually create `public.users` or `candidate_profiles` rows (triggers handle this)
- Trust `raw_user_meta_data` for role elevation
- Expose service-role credentials in logs/responses

### 4.2 Login Flow

- Supabase Auth handles password/OAuth/token verification
- NestJS validates: `public.users.status`, `deleted_at`, `locked_until`
- No custom `refresh_tokens` table exists; use Supabase Auth refresh flow
- `user_sessions` is for real-time presence, NOT auth session storage

### 4.3 AuthProvider Interface

```typescript
interface AuthProvider {
  signup(input: SignupInput): Promise<AuthResult>;
  login(credentials: LoginCredentials): Promise<AuthResult>;
  refresh(refreshToken: string): Promise<TokenPair>;
  verifyAccessToken(accessToken: string): Promise<AuthUser>;
  getAuthUser(authUserId: string): Promise<AuthUser>;
  logout(sessionContext: SessionContext): Promise<void>;
}

// Implementation: SupabaseAuthProvider
```

### 4.4 Guards & Decorators

```
JwtAuthGuard / SupabaseAuthGuard -> verified auth identity
ActiveAccountGuard             -> status, deleted_at, locked_until
RolesGuard                     -> current users.role
CompanyPermissionGuard         -> membership + granular permission
Ownership/policy check         -> candidate/job/document/application context
```

**Decorators:**
```typescript
@Public()
@CurrentUser()
@Roles('hr', 'employer')
@CompanyPermissions('can_create_jobs')
@IdempotencyKey()
```

---

## 5. Database Schema — Tables NestJS Must Interact With

### 5.1 Users & Auth (03_users_auth.sql)

| Table | Purpose | NestJS Writes? |
|---|---|---|
| `users` | Application user profile | Via Supabase Auth trigger only |
| `user_sessions` | Real-time presence tracking | YES (WebSocket connect/disconnect) |
| `user_security_log` | Security event audit (append-only) | YES (password change, email change, etc.) |
| `login_history` | Login audit (append-only) | YES (success/failure logging) |

### 5.2 Companies (04_companies.sql)

| Table | Purpose | NestJS Writes? |
|---|---|---|
| `companies` | Core tenant entity | YES |
| `company_branches` | Multi-location support | YES |
| `departments` | Org departments | YES |
| `teams` | Sub-groups within departments | YES |
| `company_members` | Staff mapping + permissions | YES |
| `company_settings` | Extended company config | YES |

### 5.3 Jobs (05_jobs.sql)

| Table | Purpose | NestJS Writes? |
|---|---|---|
| `job_categories` | Hierarchical classification | YES |
| `jobs` | Core job posting entity | YES |
| `skills` | Master skill catalog | YES (approval flow) |
| `job_skills` | Skills required by job | YES |
| `skill_requests` | HR/admin requests for new skills | YES |
| `job_locations` | Job location records | YES |
| `job_views` | Job impression tracking | YES (analytics) |
| `job_view_aggregates_daily` | Daily aggregated views | Via trigger |

### 5.4 Documents (06_documents.sql)

| Table | Purpose | NestJS Writes? |
|---|---|---|
| `guest_upload_sessions` | Short-lived guest upload permission | YES |
| `uploaded_documents` | File metadata registry | YES |

### 5.5 Resume Processing (07_resume_processing.sql)

| Table | Purpose | NestJS Writes? |
|---|---|---|
| `resume_parsing_jobs` | Queue/lifecycle for parse attempt | YES (create job + outbox) |
| `resume_parsed_data` | Immutable parse result | NO (FastAPI only) |
| `resume_parsing_artifacts` | OCR/text supporting outputs | NO (FastAPI only) |
| `resume_parsing_job_events` | Append-only timeline | NO (FastAPI only) |

### 5.6 Candidates (08_candidates.sql)

| Table | Purpose | NestJS Writes? |
|---|---|---|
| `candidate_profiles` | Core candidate profile | YES |
| `candidate_profile_documents` | Document-role-version mapping | YES |
| `candidate_links` | Portfolio/social links | YES |
| `candidate_skills` | Skills with proficiency | YES |
| `candidate_experiences` | Work experience | YES |
| `candidate_educations` | Education history | YES |
| `candidate_certifications` | Certifications | YES |
| `candidate_projects` | Projects | YES |
| `candidate_languages` | Languages | YES |
| `candidate_awards` | Awards | YES |
| `candidate_skill_evidence` | AI evidence for skills | NO (FastAPI only) |
| `candidate_experience_evidence` | AI evidence for experience | NO (FastAPI only) |
| `candidate_education_evidence` | AI evidence for education | NO (FastAPI only) |
| `candidate_certification_evidence` | AI evidence for certs | NO (FastAPI only) |
| `candidate_search_profiles` | Derived search projection | NO (FastAPI only) |
| `profile_change_history` | Audit trail | YES (auto-generated) |

### 5.7 Applications (09_applications.sql)

| Table | Purpose | NestJS Writes? |
|---|---|---|
| `job_applications` | Registered/guest applications | YES |
| `application_status_history` | Append-only status audit | YES (via function) |
| `application_documents` | Document links | YES |
| `application_profile_snapshots` | Immutable snapshots | YES (create only) |
| `guest_candidate_claims` | Guest-to-registered merge | YES |
| `saved_jobs` | Candidate saved jobs | YES |
| `referral_batches` | Manual referral batches | YES |
| `referral_invitations` | Individual invitations | YES |
| `referral_rewards` | Reward tracking | YES |

### 5.8 Interviews (10_interviews.sql)

| Table | Purpose | NestJS Writes? |
|---|---|---|
| `interview_pools` | Interviewer groups | YES |
| `interviewers` | Users who conduct interviews | YES |
| `interviewer_availability` | Weekly availability windows | YES |
| `interview_schedule_blocks` | Specific time slots | YES |
| `interviews` | Core interview entity | YES |
| `interview_participants` | Panel mapping | YES |
| `interview_feedback` | Structured feedback | YES |
| `interview_documents` | Document links | YES |

### 5.9 Messaging (11_messaging.sql)

| Table | Purpose | NestJS Writes? |
|---|---|---|
| `conversations` | Chat threads | YES |
| `conversation_participants` | Membership mapping | YES |
| `messages` | Individual messages | YES |
| `message_attachments` | File attachments | YES |
| `message_read_receipts` | Read tracking | YES |
| `message_reactions` | Emoji reactions | YES |

### 5.10 Notifications (12_notifications.sql)

| Table | Purpose | NestJS Writes? |
|---|---|---|
| `notification_templates` | Reusable templates | YES (admin only) |
| `user_notification_preferences` | Per-user channel prefs | YES |
| `notifications` | Individual notification records | YES |
| `notification_delivery_log` | Delivery state/retry | YES |
| `device_tokens` | Push notification tokens | YES |

### 5.11 Analytics (13_analytics.sql)

| Table | Purpose | NestJS Writes? |
|---|---|---|
| `analytics_events` | Raw event capture | YES |
| `analytics_daily_aggregates` | Pre-computed aggregates | Via cron/trigger |

### 5.12 Subscriptions (14_subscriptions.sql)

| Table | Purpose | NestJS Writes? |
|---|---|---|
| `subscription_plans` | Available plans | YES (admin) |
| `company_subscriptions` | Active subscriptions | YES |
| `invoices` | Billing records | YES |
| `coupons` | Discount codes | YES (admin) |
| `coupon_usages` | Usage tracking | YES |

### 5.13 Infrastructure (15_infrastructure.sql)

| Table | Purpose | NestJS Writes? |
|---|---|---|
| `outbox_events` | Transactional outbox | YES (in same TX as business rows) |
| `processed_events` | Idempotency guard | NO (FastAPI only) |
| `event_processing_leases` | In-flight concurrency guard | NO (FastAPI only) |

### 5.14 Feedback (18_feedback.sql)

| Table | Purpose | NestJS Writes? |
|---|---|---|
| `platform_feedback` | User feedback submissions | YES |

---

## 6. Outbox Pattern — Transaction Rule

### 6.1 The Rule

Where business state requires a background side effect, write the outbox event in the SAME transaction:

```
BEGIN
  -> ownership/version lock
  -> business rows
  -> audit/history rows
  -> outbox_events (status: 'pending')
COMMIT
```

### 6.2 What NestJS Must NEVER Do

- Execute network calls (queue publish, email, storage) while DB transaction is open
- Publish to queue BEFORE business commit
- Call FastAPI synchronously for heavy work

### 6.3 Outbox Events NestJS Creates

| Event Type | Trigger | Route to FastAPI |
|---|---|---|
| `resume.parse.requested` | Document upload + security scan clean | `/internal/tasks/resume/parse` |
| `candidate.profile.changed` | Profile save (revision bump) | `/internal/tasks/candidate/projection` |
| `job.ai.enrichment.requested` | Job create/publish | `/internal/tasks/job/enrich` |
| `application.status.changed` | Status change via function | `/internal/tasks/match/analyze` |
| `interview.summary.requested` | Interview completion | `/internal/tasks/interview/summary` |
| `job.screening_questions.requested` | Job publish | `/internal/tasks/job/screening-questions` |

### 6.4 Outbox Event Payload

```json
{
  "schema_version": 1,
  "event_id": "uuid",
  "aggregate_id": "uuid",
  "trace_id": "uuid"
}
```

---

## 7. Module Structure (17 Modules)

```
AuthModule
UsersModule
CompaniesModule
JobsModule
DocumentsModule
ResumeProcessingModule
CandidatesModule
ApplicationsModule
ReferralsModule
InterviewsModule
MessagingModule
NotificationsModule
AnalyticsModule
SubscriptionsModule
FeedbackModule
OutboxWriterModule
RealtimeGatewayModule
```

**Outbox Dispatcher is a SEPARATE deployable NestJS application; NOT embedded in main API.**

---

## 8. Module-by-Module API Requirements

### 8.1 AuthModule

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/auth/signup` | POST | Public | Register new account |
| `/auth/login` | POST | Public | Login with email/password |
| `/auth/refresh` | POST | Public | Refresh access token |
| `/auth/logout` | POST | Authenticated | Logout + invalidate session |
| `/auth/verify-email` | POST | Public | Email verification callback |
| `/auth/forgot-password` | POST | Public | Request password reset |
| `/auth/reset-password` | POST | Public | Reset password with token |
| `/auth/oauth/:provider` | GET | Public | OAuth redirect |
| `/auth/oauth/:provider/callback` | POST | Public | OAuth callback |
| `/auth/session-status` | GET | Authenticated | Current session info |

**Rules:**
- Signup triggers `handle_new_user()` trigger → `public.users` row
- Candidate signup triggers `create_empty_candidate_profile()` → `candidate_profiles` row
- Login validates `users.status`, `deleted_at`, `locked_until`
- Append to `login_history` (success/failure)
- Append to `user_security_log` for security events
- Rate limit: 5 failed attempts per 15 minutes per email

### 8.2 UsersModule

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/users/me` | GET | Authenticated | Get own profile |
| `/users/me` | PATCH | Authenticated | Update own profile |
| `/users/me/avatar` | POST | Authenticated | Upload avatar |
| `/users/me/password` | PUT | Authenticated | Change password |
| `/users/:id` | GET | Admin | Get any user profile |
| `/admin/users` | GET | Admin | List users (paginated) |
| `/admin/users/:id/status` | PATCH | Admin | Suspend/activate/ban |

**Rules:**
- Email is globally unique (including deleted users)
- Phone must be E.164 format
- Soft-delete only (no hard delete)
- Append to `user_security_log` on password/email/role changes

### 8.3 CompaniesModule

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/companies` | POST | Employer | Create company |
| `/companies/:slug` | GET | Public | View company profile |
| `/companies/:id` | PATCH | Owner/Admin | Update company |
| `/companies/:id/verify` | POST | Admin | Verify/reject company |
| `/companies/:id/branches` | POST | Owner/HR | Add branch |
| `/companies/:id/departments` | POST | Owner/HR | Add department |
| `/companies/:id/members` | POST | Owner | Invite member |
| `/companies/:id/members/:memberId` | PATCH | Owner | Update member role |
| `/companies/:id/settings` | PATCH | Owner | Update settings |

**Rules:**
- Company verification: `unverified` → `pending` → `verified`/`rejected`
- Jobs can only be published when company is `verified`
- Owner must be an active user
- Slug must be unique, lowercase

### 8.4 JobsModule

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/jobs` | GET | Public | List/search jobs |
| `/jobs/:slug` | GET | Public | View job detail |
| `/jobs` | POST | Employer/HR | Create job (draft) |
| `/jobs/:id` | PATCH | Owner | Update job |
| `/jobs/:id/publish` | POST | Owner/Admin | Publish job |
| `/jobs/:id/close` | POST | Owner | Close job |
| `/jobs/:id/archive` | POST | Owner | Archive job |
| `/jobs/:id/save` | POST | Candidate | Save job |
| `/jobs/:id/unsave` | POST | Candidate | Unsave job |
| `/jobs/search` | GET | Public | Advanced search |

**Rules:**
- Slug normalized to lowercase before insert/update
- Job status workflow: `draft` → `pending_approval` → `published` → `paused`/`closed`/`expired`/`archived`
- Company must be `verified` to publish
- Job create writes outbox event: `job.ai.enrichment.requested`
- Skills managed via `job_skills` junction table
- Locations stored in `job_locations` table
- `screening_questions` JSON validated at application layer
- FTS vector auto-updated by trigger

### 8.5 DocumentsModule

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/documents/upload` | POST | Authenticated/Guest | Upload document |
| `/documents/:id` | GET | Owner | Get document metadata |
| `/documents/:id/signed-url` | GET | Owner | Get signed URL |
| `/documents/:id` | DELETE | Owner | Soft-delete document |
| `/documents/guest-session` | POST | Public | Create guest upload session |

**Rules:**
- Validate: extension, MIME, file signature, filename, size (10MB max)
- Server-side storage path generation
- SHA-256 checksum for deduplication
- Same owner + checksum = reuse existing document
- Exactly one origin: `uploaded_by_user_id` XOR `guest_upload_session_id`
- Storage success + DB failure = compensating cleanup
- Signed URL for authorized access; internal bucket path NEVER exposed
- Guest sessions: job-scoped, expiring, max upload count/bytes

### 8.6 ResumeProcessingModule

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/resume/upload` | POST | Candidate | Upload resume |
| `/resume/:documentId/status` | GET | Candidate | Get parsing status |
| `/resume/:documentId/result` | GET | Candidate | Get parsed data |
| `/resume/:documentId/set-active` | POST | Candidate | Set as active profile resume |

**Rules:**
- Upload creates: `uploaded_documents` + `outbox_events(security.scan.requested)`
- Security scan clean: `resume_parsing_jobs` + `outbox_events(resume.parse.requested)`
- NestJS creates job; FastAPI does the actual parsing
- Active profile resume selection: only one current per `candidate_id + document_role`
- Parsing status available via WebSocket/SSE + status endpoint
- Reparse = new job/result (never overwrite)

### 8.7 CandidatesModule

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/candidates/me` | GET | Candidate | Get own canonical profile |
| `/candidates/me` | PATCH | Candidate | Update own profile |
| `/candidates/me/skills` | POST | Candidate | Add skill |
| `/candidates/me/skills/:id` | PATCH | Candidate | Update skill |
| `/candidates/me/skills/:id` | DELETE | Candidate | Soft-delete skill |
| `/candidates/me/experiences` | POST | Candidate | Add experience |
| `/candidates/me/educations` | POST | Candidate | Add education |
| `/candidates/me/certifications` | POST | Candidate | Add certification |
| `/candidates/me/projects` | POST | Candidate | Add project |
| `/candidates/me/languages` | POST | Candidate | Add language |
| `/candidates/me/awards` | POST | Candidate | Add award |
| `/candidates/me/links` | POST | Candidate | Add link |
| `/recruiter/candidates/search` | GET | HR/Employer | Search candidates |
| `/recruiter/candidates/:id` | GET | HR/Employer | View candidate profile |

**Rules:**
- Profile save = one logical revision (not +N per fact change)
- `bump_candidate_profile_revision()` called exactly once per save
- All canonical facts use `deleted_at` (no hard delete)
- `profile_change_history` append-only audit trail
- Resume-derived facts do NOT overwrite canonical tables
- Stale revision → HTTP 409 Conflict
- Candidate search uses `candidate_search_profiles` (derived, not canonical)

### 8.8 ApplicationsModule

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/jobs/:jobId/apply` | POST | Candidate | Register apply |
| `/jobs/:jobId/guest-apply` | POST | Public | Guest apply |
| `/applications/me` | GET | Candidate | List own applications |
| `/applications/:id` | GET | Candidate/HR | View application |
| `/applications/:id/status` | PATCH | HR/Employer | Change status |
| `/applications/:id/snapshots` | GET | HR | View snapshots |
| `/saved-jobs` | GET | Candidate | List saved jobs |
| `/saved-jobs/:jobId` | DELETE | Candidate | Unsave job |

**Rules:**
- One candidate + one job = one application (enforced by DB)
- Application identity immutable after creation
- Status change via `change_application_status()` function (NOT direct UPDATE)
- Status transitions are strictly controlled (see DB function)
- Submitted snapshot = immutable historical truth
- Profile/resume changes do NOT modify submitted application
- Guest apply: job-scoped upload session, expiring tokens
- Application status history append-only

### 8.9 ReferralsModule

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/referrals` | POST | Authenticated | Create referral batch |
| `/referrals/me` | GET | Authenticated | List own referrals |
| `/referrals/:batchId` | GET | Referrer | View batch details |
| `/referrals/invitations/:token/open` | GET | Public | Track invitation open |
| `/referrals/invitations/:token/decline` | POST | Public | Decline invitation |
| `/referrals/rewards` | GET | Authenticated | View own rewards |

**Rules:**
- Any active authenticated user can refer (no separate role)
- Self-referral/duplicate blocked
- Email normalized; phone E.164 if possible
- Batch lifecycle: `draft` → `ready` → `processing` → `completed`/`partially_failed`
- Invitation lifecycle: `pending` → `queued` → `sent` → `opened` → `applied`
- Token stored as hash only (never raw in logs/responses)
- Idempotency key on batch creation
- Retry on existing invitation (not duplicate)

### 8.10 InterviewsModule

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/interviews` | POST | HR/Employer | Schedule interview |
| `/interviews/:id` | GET | Participant | View interview |
| `/interviews/:id` | PATCH | HR | Update interview |
| `/interviews/:id/cancel` | POST | HR | Cancel interview |
| `/interviews/:id/reschedule` | POST | HR | Reschedule |
| `/interviews/:id/confirm` | POST | Candidate | Confirm attendance |
| `/interviews/:id/feedback` | POST | Interviewer | Submit feedback |
| `/interviews/availability` | GET | Interviewer | View available slots |
| `/interviews/schedule-blocks` | POST | Interviewer | Create time blocks |

**Rules:**
- Rolling availability with weekly recurrence
- Temporary slot lock (prevent double-booking)
- Conflict prevention via `EXCLUDE USING gist` constraint
- Panel interviews with multiple participants
- Feedback: structured ratings (1-5) + decision + comments
- Submitted feedback immutable
- Interview linked to application + job + candidate
- Reschedule tracking with count

### 8.11 MessagingModule

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/conversations` | POST | Authenticated | Create conversation |
| `/conversations` | GET | Authenticated | List own conversations |
| `/conversations/:id` | GET | Participant | View conversation |
| `/conversations/:id/messages` | POST | Participant | Send message |
| `/conversations/:id/messages` | GET | Participant | List messages |
| `/messages/:id/read` | POST | Participant | Mark as read |
| `/messages/:id/reaction` | POST | Participant | Add reaction |

**Rules:**
- Application/interview conversations auto-created
- Sender must be active participant (not viewer)
- Messages soft-delete only
- Conversation metadata auto-synced by trigger
- Unread count tracked per participant
- Read receipts per message
- WebSocket/SSE for real-time delivery (ADR pending)

### 8.12 NotificationsModule

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/notifications` | GET | Authenticated | List own notifications |
| `/notifications/:id/read` | POST | Authenticated | Mark as read |
| `/notifications/read-all` | POST | Authenticated | Mark all as read |
| `/notifications/preferences` | GET | Authenticated | Get preferences |
| `/notifications/preferences` | PATCH | Authenticated | Update preferences |
| `/admin/notifications/templates` | GET | Admin | List templates |
| `/admin/notifications/templates` | POST | Admin | Create template |
| `/admin/notifications/templates/:id/activate` | POST | Admin | Activate template |

**Rules:**
- Notifications idempotent (keyed by `idempotency_key`)
- Templates: draft → activated → retired (immutable after activation)
- Delivery per-channel: in_app, email, push, sms
- User preferences: global + per-event-type overrides
- Quiet hours support
- Digest frequency: instant, hourly, daily, weekly
- Device tokens for push notifications

### 8.13 AnalyticsModule

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/analytics/events` | POST | Authenticated | Track event |
| `/analytics/dashboard/company` | GET | Employer/HR | Company dashboard |
| `/analytics/dashboard/platform` | GET | Admin | Platform dashboard |
| `/analytics/jobs/:jobId` | GET | Owner | Job analytics |

**Rules:**
- Events append-only, idempotent
- Daily aggregates computed by cron/trigger
- Company-scoped queries only (no cross-tenant)
- PII stripped from event data

### 8.14 SubscriptionsModule

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/subscriptions/plans` | GET | Public | List plans |
| `/subscriptions/current` | GET | Employer | Current subscription |
| `/subscriptions/subscribe` | POST | Employer | Subscribe to plan |
| `/subscriptions/invoices` | GET | Employer | List invoices |
| `/admin/subscriptions` | GET | Admin | Manage subscriptions |
| `/admin/coupons` | POST | Admin | Create coupon |

### 8.15 FeedbackModule

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/feedback` | POST | Authenticated/Guest | Submit feedback |
| `/feedback/me` | GET | Authenticated | Own feedback |
| `/admin/feedback` | GET | Admin | All feedback |

---

## 9. Transaction Rules

### 9.1 Candidate Profile Save

```
BEGIN
  -> candidate_profiles SELECT ... FOR UPDATE
  -> authenticated ownership + expected revision verify
  -> candidate_profiles + canonical child facts mutate
  -> removed facts: deleted_at (NOT hard DELETE)
  -> profile_change_history rows insert
  -> bump_candidate_profile_revision(candidate_id) exactly once
  -> candidate.profile.changed outbox event with new revision
COMMIT
```

### 9.2 Registered Application

```
BEGIN
  -> authenticated candidate ownership
  -> job/application eligibility
  -> one candidate + one job uniqueness
  -> job_applications INSERT
  -> active application_documents INSERT
  -> confirmed canonical profile + selected resume normalize/deduplicate
  -> immutable submitted snapshot INSERT
  -> initial application_status_history INSERT
  -> application.submitted outbox event
COMMIT
```

### 9.3 Guest Apply

```
BEGIN
  -> guest_upload_sessions SELECT ... FOR UPDATE
  -> same job + active + unexpired + not revoked verify
  -> guest job_applications INSERT
  -> active session documents link
  -> immutable submitted snapshot
  -> initial status history
  -> application.submitted outbox event
  -> consume_guest_upload_session(session_id, application_id)
COMMIT
```

### 9.4 Application Status Change

- NestJS calls `change_application_status()` function
- Function handles: lock, allowed transition, status update, history, outbox atomically
- Direct `UPDATE job_applications SET status = ...` is BLOCKED by trigger

---

## 10. Validation Rules

### 10.1 DTO Validation

- `whitelist: true`, `forbidNonWhitelisted: true`
- UUID format validation
- Email: case-insensitive, trimmed
- Phone: E.164 format (`+[1-9][0-9]{7,14}`)
- URLs: must start with `http://` or `https://`
- JSONB fields: validate as object/array where required

### 12.2 Business Validation

- Company slug: lowercase, unique
- Job slug: lowercase, unique
- Skills: either `skill_id` OR `custom_skill_name` (not both)
- Experience dates: `end_date >= start_date` (or `is_current = true`)
- Salary: `min <= max`, non-negative
- Notice period: non-negative
- Brand color: hex `#RRGGBB`

---

## 10. Error Handling

### 10.1 HTTP Status Codes

| Code | When |
|---|---|
| 200 | Success |
| 201 | Created |
| 202 | Accepted (async processing started) |
| 400 | Bad request / validation error |
| 401 | Unauthorized (no/invalid token) |
| 403 | Forbidden (valid token, insufficient permissions) |
| 404 | Not found |
| 409 | Conflict (stale revision, duplicate) |
| 413 | Payload too large |
| 422 | Unprocessable entity (schema validation) |
| 429 | Rate limit exceeded |
| 500 | Internal server error |

### 10.2 Error Response Format

```json
{
  "statusCode": 400,
  "message": ["email must be an email", "first_name should not be empty"],
  "error": "Bad Request",
  "timestamp": "2026-08-22T10:00:00.000Z",
  "path": "/auth/signup",
  "traceId": "uuid"
}
```

### 10.3 What NEVER Goes in Responses

- Internal storage paths
- Token hashes
- Raw AI payloads
- Stack traces (in production)
- Service-role credentials
- Database connection strings

---

## 11. Security Requirements

### 11.1 Authentication

- Supabase Auth for all authentication
- JWT access tokens verified on every request
- Refresh token rotation via Supabase Auth
- OAuth callback via NestJS-controlled endpoint

### 11.2 Authorization

- Primary: NestJS Guards (JwtAuthGuard, RolesGuard, CompanyPermissionGuard)
- Secondary: Database RLS (defense-in-depth)
- No browser client uses service-role credentials
- Company membership + permission checks on every company-scoped resource

### 11.3 Data Protection

- TLS encrypted communication
- Private document storage with signed URLs
- PII redaction in logs
- Guest tokens hashed (never stored raw)
- Upload MIME/signature/size validation
- Rate limiting on auth endpoints

### 11.4 Audit

- `user_security_log`: append-only security events
- `login_history`: append-only login audit
- `profile_change_history`: append-only profile changes
- `application_status_history`: append-only status changes
- `analytics_events`: idempotent event tracking

---

## 12. Real-Time Features

### 12.1 WebSocket/SSE Transport

- Resume parsing progress updates
- Application status changes
- New messages
- Interview reminders
- Notification delivery

### 12.2 Authentication

- WebSocket auth same as HTTP auth
- Reconnect recovery via status endpoint
- Session tracking in `user_sessions` table

---

## 13. Testing Requirements

### 13.1 Unit Tests

- Signup creates exactly one `users` row + one `candidate_profiles` row
- Inactive/deleted/locked account blocks access
- Profile save: revision exactly `+1`, one outbox event
- Transaction rollback: no partial commits
- Duplicate checksum reuses existing document

### 13.2 Integration Tests

- Stale profile update → 409 Conflict
- Stale projection does NOT overwrite newer revision
- Wrong-owner/session document rejected
- Concurrent Guest Apply cannot reuse upload session
- Duplicate candidate/job application blocked
- Snapshot/evidence/artifact mutation fails
- Application status + history + outbox atomic
- Referral retry idempotent
- Invalid lifecycle transitions rejected
- Raw tokens/paths never in responses/logs

### 13.3 Authorization Tests

- Known UUID but unauthorized tenant → fail
- HR cannot access other company's resources
- Candidate cannot modify other candidate's profile
- Guest cannot access registered-only endpoints

---

## 14. Performance Requirements

- Normal API requests do NOT wait for AI processing
- Common queries use proper indexes (verified in 16_indexes.sql)
- Pagination on all list endpoints
- Bounded queries (no unbounded SELECT *)
- Streaming/direct-storage for large uploads

---

## 15. Implementation Order

```
1.  Configuration, structured logging, error mapping
2.  PostgreSQL transaction layer + Supabase Auth/Storage clients
3.  Auth and account-status guards
4.  Users / Companies / Jobs
5.  Documents + Resume Processing job creation
6.  Candidate canonical profile + revision transactions
7.  Registered/Guest Applications + Snapshots/Status
8.  Manual Referrals
9.  Interviews / Messaging / Notifications
10. Analytics / Subscriptions / Feedback
11. Realtime completion/status delivery
12. Integration, concurrency, and authorization tests
```

---

## 16. Suggested Project Structure

```
04-nestjs-api/
  README.md
  docs/
  app/
    src/
      main.ts
      app.module.ts
      config/
        config.module.ts
        env.validation.ts
        app-config.service.ts
      common/
        auth/
          auth.provider.ts           # AuthProvider interface
          auth.module.ts
          strategies/
          guards/
            jwt-auth.guard.ts
            active-account.guard.ts
            roles.guard.ts
            company-permission.guard.ts
          decorators/
            current-user.decorator.ts
            roles.decorator.ts
            public.decorator.ts
            idempotency-key.decorator.ts
        errors/
          error-codes.ts
          exception-filter.ts
        logging/
          logger.service.ts
          pii-redaction.ts
        validation/
          validation.pipe.ts
        idempotency/
          idempotency.guard.ts
      infrastructure/
        database/
          database.module.ts
          database.service.ts         # Raw pg Pool, no ORM
          outbox/
            outbox.module.ts
            outbox.repository.ts      # Writes outbox_events in same TX
        supabase-auth/
          supabase-auth.module.ts
          supabase-auth.provider.ts
        supabase-storage/
          supabase-storage.module.ts
          supabase-storage.service.ts
      modules/
        auth/
          auth.controller.ts
          auth.service.ts
          auth.module.ts
        users/
          users.controller.ts
          users.service.ts
          users.repository.ts
          users.module.ts
        companies/
          companies.controller.ts
          companies.service.ts
          companies.repository.ts
          companies.module.ts
        jobs/
          jobs.controller.ts
          jobs.service.ts
          jobs.repository.ts
          jobs.module.ts
        documents/
          documents.controller.ts
          documents.service.ts
          documents.repository.ts
          documents.module.ts
        resume-processing/
          resume-processing.controller.ts
          resume-processing.service.ts
          resume-processing.module.ts
        candidates/
          candidates.controller.ts
          candidates.service.ts
          candidates.repository.ts
          candidates.module.ts
        applications/
          applications.controller.ts
          applications.service.ts
          applications.repository.ts
          applications.module.ts
        referrals/
          referrals.controller.ts
          referrals.service.ts
          referrals.repository.ts
          referrals.module.ts
        interviews/
          interviews.controller.ts
          interviews.service.ts
          interviews.repository.ts
          interviews.module.ts
        messaging/
          messaging.controller.ts
          messaging.service.ts
          messaging.repository.ts
          messaging.module.ts
        notifications/
          notifications.controller.ts
          notifications.service.ts
          notifications.repository.ts
          notifications.module.ts
        analytics/
          analytics.controller.ts
          analytics.service.ts
          analytics.module.ts
        subscriptions/
          subscriptions.controller.ts
          subscriptions.service.ts
          subscriptions.module.ts
        feedback/
          feedback.controller.ts
          feedback.service.ts
          feedback.module.ts
      realtime/
        realtime.gateway.ts
        realtime.module.ts
  test/
    integration/
    concurrency/
    authorization/
    unit/
```

---

## 17. Environment Variables

```bash
# Database
DATABASE_URL=postgresql://user:password@host:5432/postgres
DATABASE_MAX_POOL_SIZE=20
DATABASE_STATEMENT_TIMEOUT=30000

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_JWT_SECRET=your-jwt-secret

# Auth
JWT_SECRET=your-jwt-secret
JWT_EXPIRY=3600
REFRESH_TOKEN_EXPIRY=604800

# Storage
SUPABASE_STORAGE_BUCKET=job-portal-uploads
SIGNED_URL_EXPIRY=900

# CORS
ALLOWED_ORIGINS=http://localhost:3000,https://your-domain.com

# Rate Limiting
RATE_LIMIT_TTL=60000
RATE_LIMIT_MAX=100

# Logging
LOG_LEVEL=info
LOG_FORMAT=json
LOG_REDACT_PII=true

# App
NODE_ENV=development
PORT=3000
```

---

## 18. Key Constraints & Invariants (From DB)

1. **Users:** No hard delete (trigger blocks). Email globally unique. Phone E.164.
2. **Companies:** One owner. Verification required before job publish.
3. **Jobs:** Slug lowercase unique. Status workflow enforced by DB.
4. **Documents:** No hard delete. Exactly one origin (user XOR guest session).
5. **Candidates:** Profile revision monotonic increase. Evidence append-only.
6. **Applications:** One per candidate+job. Identity immutable. Status via function only.
7. **Referrals:** Batch lifecycle controlled. Token hashed. Self-referral blocked.
8. **Interviews:** Overlap prevented by GiST exclusion. Feedback immutable when final.
9. **Messages:** Soft-delete only. Identity immutable. Sender must be participant.
10. **Notifications:** Idempotent. Templates immutable after activation.
11. **Outbox:** Status: pending → publishing → published/failed/dead_letter. No ad-hoc DML.

---

## 19. Integration Points

### 19.1 With FastAPI AI Worker

- NestJS writes outbox events; FastAPI reads and processes
- FastAPI writes: `processed_events`, `event_processing_leases`, `resume_parsed_data`, `candidate_search_profiles`, evidence tables
- FastAPI can write chained outbox events

### 19.2 With Outbox Dispatcher

- Dispatcher reads `outbox_events` (status: pending)
- Claims via `claim_outbox_events()` function
- Publishes to Google Cloud Tasks
- Marks as published via `mark_outbox_event_published()`

### 19.3 With Next.js Frontend

- REST API for all CRUD operations
- WebSocket/SSE for real-time updates
- Signed URLs for document access
- No direct Supabase access from browser

---

## 20. What NestJS Must NEVER Do

1. Call FastAPI synchronously for heavy work
2. Write to `processed_events`, `event_processing_leases`, `resume_parsed_data`, `candidate_search_profiles`, evidence tables
3. Bypass database triggers (e.g., direct UPDATE on status columns)
4. Use `synchronize: true` (ORM schema sync)
5. Store secrets in source code
6. Expose service-role credentials
7. Trust request body owner IDs
8. Execute network calls during open DB transactions
9. Skip authorization checks based on role alone
10. Hard-delete any domain entity

---

*Compiled by Freebuff (Codebuff Agent) — 2026-08-22*
*Source: Complete cross-reference of Binay-Job-Portal-App repository*