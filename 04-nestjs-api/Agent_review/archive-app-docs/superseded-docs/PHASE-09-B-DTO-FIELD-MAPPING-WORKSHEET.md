# Phase 09-B — SQL-backed DTO Field Mapping Worksheet

Status: `WORKSHEET — REVIEW REQUIRED BEFORE CONTRACT FREEZE`

Rule: नीचे केवल baseline SQL में मौजूद columns ही reference किए जाएँगे। Generated, sensitive या absent fields response में बिना explicit approval के नहीं आएँगे।

## Identity/session

| Contract | Request fields | Safe response candidates | Exclude |
|---|---|---|---|
| `GET /auth/me` | none; identity JWT से | `id, email, first_name, middle_name, last_name, display_name, phone, avatar_path, role, status` | password/security timestamps, lock data, deletion internals |
| `GET /auth/sessions` | none | actual `user_sessions` columns only: `id, socket_id, device_type, user_agent, last_seen_at, is_online, created_at, updated_at` | `user_id` (unless explicitly approved), और कोई absent column नहीं |
| `POST /auth/sessions/revoke` | `session_id` (API name) → SQL `user_sessions.id` | revoked presence result | Supabase Auth token fields |

## Company

| Contract | Request fields (SQL-backed only) | Safe response candidates |
|---|---|---|
| Company create | `name, slug, legal_name, registration_number, description, short_description, industry, company_size, website, linkedin_url, twitter_url, facebook_url, youtube_url, email, phone, address_line1, address_line2, city, state, country, postal_code, latitude, longitude, brand_color` | `id, name, slug, legal_name, description, industry, company_size, website, is_active, verification_status, created_at, updated_at` |
| Company update | approved mutable subset of the create fields; `expected_revision` only if an actual revision column/approved contract exists | same safe company summary |

`owner_id`, `verification_document_path`, internal settings and deletion metadata are not public response fields by default. `verification_status` is role/context filtered and is not exposed to ordinary users unless the approved contract permits it. Company creation must atomically initialize the existing `company_settings` row with approved defaults. `cover_image_path` remains a separate storage/upload concern unless an approved company-profile DTO explicitly includes it.

## Organization

| Resource | SQL-backed identity fields | Important FK rule |
|---|---|---|
| Branch | actual columns from `company_branches` (for example `name, city, country, is_headquarters` only after exact column verification) | tenant/company must be server-derived |
| Department | `name, head_member_id` plus actual baseline columns | FK points to `company_members`, not a user field |
| Team | `department_id, name, lead_member_id` plus actual baseline columns | FK points to `company_members`, not a user field |

## Membership

`company_members` is the source for membership DTOs. Use actual columns such as `company_id, user_id, branch_id, department_id, team_id, manager_member_id, title, employee_code, employment_type, is_primary_hr, permissions, is_active, invited_at, invited_by, joined_at, left_at, employment_status, work_email, work_phone, created_at, updated_at` only where the operation permits them.

- Client cannot submit authoritative `company_id`, actor identity or owner identity.
- `user_id` in invite/add must refer to an existing `public.users` row.
- `head_member_id`, `lead_member_id` and `manager_member_id` remain member IDs; do not rename them to user IDs.
- Rejoin reactivates the existing row; no duplicate membership row is created.

## Ownership transfer

| Contract | Request fields | Response candidates | Required validation |
|---|---|---|---|
| `POST /companies/:companyId/ownership-transfer` | `new_owner_user_id` (API field → `public.users.id`) | approved `CompanySummaryDto` without sensitive ownership internals | Current owner authorization; target must be an eligible active member; update `companies.owner_id` and required membership/audit state atomically |

## Freeze checklist

- Every DTO field mapped to an exact SQL column.
- Generated/sensitive/internal fields explicitly excluded.
- No invented `status`, `role`, `code`, `ip_address`, `last_activity_at` or revision field.
- Exact organization column lists rechecked directly against SQL before OpenAPI generation.
- Final agent review passes.
