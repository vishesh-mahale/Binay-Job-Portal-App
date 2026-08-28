# Phase 09-B — Final Comprehensive Revalidation (Freebuf)

**Auditor:** Freebuf (Senior NestJS + PostgreSQL + Supabase Architect)
**Date:** 2026-08-27
**Report Path:** `04-nestjs-api/s1/phase9-b-identity-companies-api/final-contract-review/freebuf-final-revalidation.md`

---

## 1. Executive Verdict

### **PASS WITH MINOR FIXES**

All 4 documents verified against SQL, decisions D1–D8, and requirements. Key improvements since previous review:

| Previous Issue | Status |
|----------------|--------|
| D8 ownership transfer missing from Proposal/Freeze | ✅ **FIXED** — endpoint added to both |
| MEMBERSHIP-ACCEPT/REJOIN paths not frozen | ✅ **FIXED** — paths frozen in Freeze |
| D6 rejoin-approval semantics missing | ✅ **FIXED** — "owner/admin approves" reflected |
| `session_id` not mapped to SQL | ✅ **FIXED** — explicit mapping in worksheet |
| `user_id` excluded from sessions without explanation | ✅ **FIXED** — "unless explicitly approved" noted |
| `head_user_id`/`lead_user_id` invented | ✅ **FIXED** — correct `head_member_id`/`lead_member_id` used |
| `role` on membership invented | ✅ **FIXED** — correct `is_primary_hr` + `permissions` |
| `ip_address` on sessions invented | ✅ **FIXED** — removed from worksheet |

**Remaining: 1 MEDIUM + 2 LOW issues (documentation consistency).**

---

## 2. D1–D8 Decision Verification

| Decision | Approved | Reflected in Proposal? | Reflected in Freeze? | Reflected in Decisions? | Correct? |
|----------|----------|----------------------|---------------------|------------------------|----------|
| D1 Auth bootstrap | ✅ | ✅ "No separate bootstrap endpoint" | ✅ "GET /api/v1/auth/me" | ✅ | ✅ |
| D2 Company creation | ✅ | ✅ "active employer" | ✅ "employer owner" | ✅ | ✅ |
| D3 Membership invitation | ✅ | ✅ "registered user + inactive row" | ✅ "accept existing-user row" | ✅ | ✅ |
| D4 Org API shape | ✅ | ✅ Separate nested resources | ✅ "separate nested" | ✅ | ✅ |
| D5 Session revoke | ✅ | ✅ "PROPOSED — semantics pending" | ✅ "own session only" | ✅ | ✅ |
| D6 Owner protection | ✅ | ✅ "owner/admin approves" on rejoin | ✅ "approval for rejoin" | ✅ | ✅ |
| D7 Auth revocation | ✅ | ✅ "not Supabase Auth token revocation" | ✅ | ✅ | ✅ |
| D8 Ownership transfer | ✅ | ✅ **NEW: OWNERSHIP-TRANSFER endpoint** | ✅ **NEW: OWNERSHIP-TRANSFER row** | ✅ | ✅ |

**All 8 decisions correctly reflected across all 4 documents.**

---

## 3. `handle_new_user()` Trigger Verification

| Check | Evidence | Result |
|-------|----------|--------|
| `handle_new_user()` creates `public.users` row | `03_users_auth.sql` L182-226: INSERT INTO public.users | ✅ Correct |
| NestJS never manually inserts `public.users` | D1: "NestJS kabhi public.users row manually create nahi karega" | ✅ Correct |
| No duplicate `POST /auth/bootstrap` endpoint | Proposal: "No separate bootstrap endpoint" | ✅ Correct |
| `ON CONFLICT DO NOTHING` prevents duplicate trigger fires | `03_users_auth.sql` L222: `ON CONFLICT (id) DO NOTHING` | ✅ Correct |

---

## 4. Company Creation & JWT-derived `owner_id`

| Check | Evidence | Result |
|-------|----------|--------|
| Active employer creates company | D2: "active authenticated employer user company register karega" | ✅ Correct |
| `owner_id` derived from JWT `sub` | D2: "owner_id hamesha verified JWT sub se server derive hoga" | ✅ Correct |
| Request body never supplies `owner_id` | Proposal DTO rules: "Client never supplies authoritative user_id" | ✅ Correct |
| Platform admin can create (exceptional) | D2: "Platform admin exceptional administrative flow me company create kar sakta hai" | ✅ Correct |
| Candidate cannot create | D2: "candidate company create nahi kar sakta" | ✅ Correct |
| `company_settings` auto-initialized | Worksheet: "Company creation must atomically initialize the existing company_settings row with approved defaults" | ✅ Correct |

---

## 5. Single-Owner Model & Ownership Transfer

| Check | Evidence | Result |
|-------|----------|--------|
| One primary owner per company | D8: "har company ka ek primary owner rahega" | ✅ Correct |
| Co-owner model not supported | D8: "co-owner model abhi nahi hoga" | ✅ Correct |
| Transfer endpoint exists | Proposal: `POST /api/v1/companies/:companyId/ownership-transfer` | ✅ **NEW — FIXED** |
| Transfer in Freeze | Freeze: `POST /api/v1/companies/:companyId/ownership-transfer` (proposed) | ✅ **NEW — FIXED** |
| Sole owner cannot leave without transfer | D6: "sole active owner leave ya deactivate nahi kar sakta" | ✅ Correct |
| Transfer is atomic transaction | D8: "Transfer business row aur audit/history ke saath ek atomic NestJS transaction mein hoga" | ✅ Correct |

---

## 6. Membership: Accept vs Rejoin

| Check | Evidence | Result |
|-------|----------|--------|
| Accept = registered user + inactive row | D3: "registered user ko existing company_members inactive row ke madhyam se add/invite kiya jayega" | ✅ Correct |
| Accept path frozen | Freeze: `POST /api/v1/companies/:companyId/membership/accept` | ✅ **FIXED** |
| Rejoin = previously associated user + owner approval | D6: "membership activation owner/admin approval ke baad hogi" | ✅ Correct |
| Rejoin path frozen | Freeze: `POST /api/v1/companies/:companyId/membership/rejoin` | ✅ **FIXED** |
| Accept ≠ Rejoin (separate flows) | D3: "Accept aur rejoin alag flows rahenge" | ✅ Correct |
| Rejoin preserves `joined_at` | D6: "Original joined_at audit history ke liye preserve hoga" | ✅ Correct |
| No external invitation table/token | D3: "Unregistered email invitation current scope mein nahi hai" | ✅ Correct |
| `company_members.user_id NOT NULL` | `04_companies.sql` L170: `user_id UUID NOT NULL REFERENCES users(id)` | ✅ Correct |

---

## 7. Presence Session Revoke (D5)

| Check | Evidence | Result |
|-------|----------|--------|
| `user_sessions` is realtime-presence, not auth session | D5: "user_sessions realtime-presence table hai" | ✅ Correct |
| Only current session revoked | D5: "sirf ek owned presence row deactivate/revoke" | ✅ Correct |
| "Logout all devices" not in scope | D5: "Logout all devices current scope mein alag capability nahi hai" | ✅ Correct |
| `session_id` mapped to `user_sessions.id` | Worksheet: "session_id (API name) → SQL user_sessions.id" | ✅ **FIXED** |

---

## 8. HttpOnly-Cookie Logout & Auth Revocation (D7)

| Check | Evidence | Result |
|-------|----------|--------|
| Logout clears HttpOnly cookie | D7: "NestJS current presence session band karega aur Set-Cookie se Secure, HttpOnly auth cookie clear karega" | ✅ Correct |
| No routine Supabase token-revoke | D7: "har logout par alag Supabase token-revoke call nahi hoga" | ✅ Correct |
| Future revoke possible (post-transaction) | D7: "future mein alag approved AuthProvider revoke flow banaya ja sakta hai; wo DB transaction ke bahar chalega" | ✅ Correct |
| External call outside DB transaction | D7: "DB transaction ke bahar" | ✅ Correct |

---

## 9. UserContextClient vs SystemClient & RLS

| Table/Operation | Client | RLS Policy | Correct? |
|-----------------|--------|------------|----------|
| `GET /auth/me` → `users` | `UserContextClient` | `users_own_read` (SELECT own row) | ✅ |
| `GET /auth/sessions` → `user_sessions` | `SystemClient` + user_id check | None (no authenticated SELECT policy) | ✅ |
| `POST /auth/sessions/revoke` → `user_sessions` | `SystemClient` + user_id check | None | ✅ |
| Company create/read/update → `companies` | `SystemClient` + same-company | None (no authenticated SELECT policy) | ✅ |
| Branch/Department/Team → org tables | `SystemClient` + same-company | None | � Membership → `company_members` | `SystemClient` + same-company | None | ✅ |
| Ownership transfer → `companies` | `SystemClient` + owner check | None | ✅ |

**Decision-01 correctly applied:** `UserContextClient` only for approved RLS reads (`users_own_read`). All business DML via `SystemClient`.

---

## 10. DTO Field Mapping Verification

### 10A. Previously Invented Fields — All Fixed ✅

| # | Was Invented | Now Fixed? | Worksheet Evidence |
|---|-------------|-----------|-------------------|
| 1 | `ip_address` in sessions | ✅ Removed | Not in worksheet |
| 2 | `last_activity_at` in sessions | ✅ Removed | Not in worksheet |
| 3 | `head_user_id` in departments | ✅ Fixed | Correct `head_member_id` used |
| 4 | `lead_user_id` in teams | ✅ Fixed | Correct `lead_member_id` used |
| 5 | `role` in membership invite | ✅ Fixed | Correct `is_primary_hr` + `permissions` |
| 6 | `code` in departments | ✅ Removed | Not in worksheet |
| 7 | `user_type` in auth/me | ✅ Fixed | Correct `role` used |

### 10B. `session_id` Mapping

Worksheet correctly states: `session_id (API name) → SQL user_sessions.id` ✅

### 10C. `head_member_id` / `lead_member_id` / `manager_member_id`

Worksheet correctly states: "remain member IDs; do not rename them to user IDs" ✅

FK verification:
- `departments.head_member_id` → `company_members(id, department_id)` via `departments_head_member_fk` ✅
- `teams.lead_member_id` → `company_members(id, team_id)` via `teams_lead_member_fk` ✅
- `company_members.manager_member_id` → `company_members(id, company_id)` via `company_members_manager_tenant_fk` ✅

### 10D. Sensitive Field Exclusion

| Table | Excluded from Response | Evidence |
|-------|----------------------|----------|
| `users` | `last_password_changed_at, locked_until, deleted_at, deleted_reason` | Worksheet: "password/security timestamps, lock data, deletion internals" ✅ |
| `companies` | `owner_id, verification_document_path, settings, deleted_at` | Worksheet: "owner_id, verification_document_path, internal settings and deletion metadata are not public response fields" ✅ |
| `user_sessions` | `user_id` (unless explicitly approved) | Worksheet: "user_id (unless explicitly approved)" ✅ |

### 10E. `legal_name` in Company Response

**MEDIUM:** `companies.legal_name VARCHAR(255)` exists in SQL (L60) and is in the request fields, but is NOT in the safe response candidates. This is a valid public-facing company profile field.

---

## 11. Endpoint Completeness Check

| # | Endpoint | In Proposal? | In Freeze? | In DTO Worksheet? | Decision? |
|---|----------|-------------|-----------|-------------------|-----------|
| 1 | `GET /api/v1/auth/me` | ✅ | ✅ | ✅ | D1 |
| 2 | `GET /api/v1/auth/sessions` | ✅ | ✅ | ✅ | D5 |
| 3 | `POST /api/v1/auth/sessions/revoke` | ✅ | ✅ | ✅ | D5, D7 |
| 4 | `POST /api/v1/companies` | ✅ | ✅ | ✅ | D2 |
| 5 | `GET /api/v1/companies/:companyId` | ✅ | ✅ | ✅ | — |
| 6 | `PATCH /api/v1/companies/:companyId` | ✅ | ✅ | ✅ | D2, D6 |
| 7 | `POST .../branches` | ✅ | ✅ | ✅ | D4 |
| 8 | `PATCH .../branches/:branchId` | ✅ | ✅ | ✅ | D4 |
| 9 | `POST .../departments` | ✅ | ✅ | ✅ | D4 |
| 10 | `PATCH .../departments/:departmentId` | ✅ | ✅ | ✅ | D4 |
| 11 | `POST .../teams` | ✅ | ✅ | ✅ | D4 |
| 12 | `PATCH .../teams/:teamId` | ✅ | ✅ | ✅ | D4 |
| 13 | `POST .../members` | ✅ | ✅ | ✅ | D3 |
| 14 | `POST .../membership/accept` | ✅ (NEW path) | ✅ (frozen) | ✅ | D3 |
| 15 | `POST .../members/:memberId/deactivate` | ✅ | ✅ | ✅ | D6 |
| 16 | `POST .../membership/leave` | ✅ | ✅ | ✅ | D6 |
| 17 | `POST .../membership/rejoin` | ✅ | ✅ (frozen) | ✅ | D6 |
| 18 | `POST .../ownership-transfer` | ✅ **NEW** | ✅ **NEW** | ⚠️ Missing | D8 |

**18/18 endpoints present.** Only gap: DTO worksheet doesn't cover the D8 transfer endpoint DTO mapping.

---

## 12. Missing Items

| # | Missing | Severity | Fix |
|---|---------|----------|-----|
| M-1 | `legal_name` missing from company response DTO | MEDIUM | Add to safe response candidates in worksheet |
| M-2 | D8 transfer endpoint DTO mapping not in worksheet | LOW | Add `new_owner_user_id (UUID)` request + company summary response |
| M-3 | Proposal §"Decisions required" still lists items 2-7 | LOW | Update to only list D8; D1-D7 are approved |

---

## 13. Remaining Issues Summary

| # | Issue | Severity | Status vs Previous Review |
|---|-------|----------|--------------------------|
| M-1 | `legal_name` missing from company response DTO | MEDIUM | NEW — not flagged before |
| M-2 | D8 transfer endpoint not in DTO worksheet | LOW | NEW — consistent with D8 being newly added |
| M-3 | Proposal "Decisions required" list outdated | LOW | Carried — documentation cleanup |

**Zero BLOCKER or HIGH issues.**

---

## 14. Final Readiness

### **PASS WITH MINOR FIXES**

| Category | Status |
|----------|--------|
| **D1–D8 decisions** | ✅ All 8 correctly reflected |
| **`handle_new_user()` trigger** | ✅ NestJS never inserts `public.users` |
| **Company creation + JWT owner_id** | ✅ Correct per D2 |
| **Single-owner model** | ✅ Correct per D8 |
| **Ownership transfer endpoint** | ✅ **NEW — added to Proposal + Freeze** |
| **Membership accept/rejoin** | ✅ Paths frozen, flows separated |
| **Presence session revoke** | ✅ Correct per D5 |
| **HttpOnly cookie logout** | ✅ Correct per D7 |
| **UserContext/SystemClient** | ✅ Correct per Decision-01 |
| **DTO field mapping** | ⚠️ `legal_name` missing (MEDIUM) |
| **Previously invented fields** | ✅ All 7 fixed |
| **Sensitive field exclusion** | ✅ Correct |
| **FK member_id vs user_id** | ✅ Correctly documented |
| **Endpoint completeness** | ✅ 18/18 (DTO worksheet needs D8 row) |
| **External calls outside TX** | ✅ Correct per D7 |
| **No invented tables/events** | ✅ Confirmed |

**After M-1 (add `legal_name` to company response):**
```
READY FOR CONTRACT FREEZE
```

---

*Report generated by Freebuf agent on 2026-08-27.*
