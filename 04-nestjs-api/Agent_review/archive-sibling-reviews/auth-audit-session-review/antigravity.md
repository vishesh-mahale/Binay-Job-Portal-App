# AuthProvider Implementation & Audit/Session Design Review Report

**Target Scope:** NestJS `AuthProvider` Implementation, Audit Logging (`login_history`, `user_security_log`), and Presence Sessions (`user_sessions`)  
**Auditor:** Antigravity (Senior NestJS Auth, PostgreSQL Security and Audit-Logging Architect)  
**Date:** 2026-08-27  
**Report Location:** `04-nestjs-api/auth-audit-session-review/antigravity.md`  

---

## 1. Executive Verdict

### **FIX FIRST (REQUIRED AUDIT & SESSION IMPLEMENTATION)**

*(Reason: The initial `AuthProvider` implementation in `src/auth-provider.ts` correctly establishes the Supabase Auth REST boundary, HttpOnly cookie path isolation, fail-closed account status checks, and zero manual `public.users` inserts. However, it currently lacks mandatory append-only audit logging [`login_history`], security log events [`user_security_log`], and real-time presence tracking [`user_sessions`]. Implementing these audit and session mechanisms using the exact database schemas in `03_users_auth.sql` and enums in `02_enums.sql` is required before final freeze).*

---

## 2. Current Implementation Verification Table

| Audit Point | Code / Document Reference | Exact Findings & Evidence | Classification |
|---|---|---|---|
| **SupabaseAuthProvider Boundary** | `src/auth-provider.ts` L12–L30 | Uses server-side `fetch` to Supabase Auth `/auth/v1` REST endpoints using `SUPABASE_SERVICE_ROLE_KEY`. | `VERIFIED` |
| **No Manual DB Inserts on Signup** | `src/auth-provider.ts` L45 | Does zero SQL insert into `public.users` or `candidate_profiles`. Trigger `handle_new_user()` owns row creation. | `VERIFIED` |
| **Fail-Closed Account Status Gate** | `src/auth-provider.ts` L47 | Verifies `status === 'active'`, `deleted_at IS NULL`, and `locked_until <= NOW()` before issuing cookies. | `VERIFIED` |
| **Cookie Path Isolation** | `src/auth-provider.ts` L36–L37 | `binay_access_token` (`Path=/`); `binay_refresh_token` (`Path=/api/v1/auth/refresh`). | `VERIFIED` |
| **Transaction Boundary** | `src/auth-provider.ts` L18 | Supabase Auth REST calls run outside open DB transactions. No external HTTP calls inside DB transactions. | `VERIFIED` |
| **`login_history` Audit Writes** | `src/auth-provider.ts` L47 | Currently missing. Login success and failures are not yet recorded in `public.login_history`. | `REQUIRED FIX` |
| **`user_security_log` Writes** | `src/auth-provider.ts` L47 | Currently missing. Account lockouts and security events are not written to `public.user_security_log`. | `REQUIRED FIX` |
| **`user_sessions` Presence Creation** | `src/auth-provider.ts` L47 & L51 | Currently missing. Successful login/logout does not update `public.user_sessions` presence rows. | `REQUIRED FIX` |

---

## 3. Correct `login_history` Audit Design

- **Purpose:** Immutable, append-only security audit log for all login attempts (`03_users_auth.sql` L394–L422).
- **Trigger Point:** `POST /api/v1/auth/login`.
- **Required Columns:**
  - `user_id`: `UUID` (populated when user is identified; `NULL` when email is not found).
  - `email`: `email.trim().toLowerCase()` (CITEXT case-insensitive).
  - `login_type`: `'email_password'` (`public.auth_login_type` enum).
  - `auth_provider`: `NULL` for email/password; provider name (e.g. `'google'`) for OAuth.
  - `success`: `BOOLEAN` (`TRUE` on successful authentication; `FALSE` on failure).
  - `failure_reason`: `public.login_failure_reason` enum value (`NULL` when `success = TRUE`).
  - `ip_address`: `req.ip` / `x-forwarded-for`.
  - `user_agent`: `req.headers['user-agent']`.
- **Constraint Compliance:** Enforces `login_history_result_consistency CHECK ((success = TRUE AND failure_reason IS NULL) OR (success = FALSE AND failure_reason IS NOT NULL))`.
- **Immutability:** Handled by database trigger `user_security_log_immutable` (`03_users_auth.sql` L450), which blocks `UPDATE` or `DELETE` attempts.

---

## 4. Correct `user_security_log` Design

- **Purpose:** Append-only security event trail (`03_users_auth.sql` L373–L384).
- **Approved Event Types (`public.security_event_type` enum in `02_enums.sql` L103–L118):**
  - `'password_changed'`, `'password_reset'`, `'email_verified'`, `'email_changed'`, `'account_locked'`, `'account_unlocked'`, `'role_changed'`, `'login_failed'`, `'account_suspended'`, `'account_reactivated'`, `'account_deleted'`, `'phone_changed'`.
- **Usage Rule:** When consecutive login failures trigger account lockout (`locked_until`), write a `user_security_log` entry with `event_type = 'account_locked'` and JSON metadata (`jsonb_typeof(metadata) = 'object'`). Never store passwords, tokens, or raw secrets in `metadata`.

---

## 5. Correct `user_sessions` / Presence Design

- **Purpose:** Real-time online status and device connection tracking (`03_users_auth.sql` L330–L364).
- **Login Behavior:** Upon successful `POST /api/v1/auth/login`, insert or update a row in `public.user_sessions`:
  ```sql
  INSERT INTO public.user_sessions (user_id, is_online, last_seen_at, user_agent, device_type)
  VALUES ($1, TRUE, NOW(), $2, $3)
  ON CONFLICT (user_id, device_type) -- or session lookup
  DO UPDATE SET is_online = TRUE, last_seen_at = NOW(), user_agent = EXCLUDED.user_agent;
  ```
- **Logout Behavior:** Upon `POST /api/v1/auth/logout`, set `is_online = FALSE`, `socket_id = NULL`, `updated_at = NOW()` for the user's active session.

---

## 6. Exact Enum & Column Mapping Matrix

| Auth Outcome / State | `login_history.failure_reason` Enum Value (`02_enums.sql` L78–L88) |
|---|---|
| Wrong Password | `'invalid_password'` |
| User Email Not Found | `'user_not_found'` |
| Account `locked_until > NOW()` | `'account_locked'` |
| User `status = 'pending_verification'` | `'email_not_verified'` |
| Account `status = 'suspended'` | `'suspended'` |
| Account `status = 'banned'` | `'banned'` |
| Supabase Auth Network Failure | `'unknown'` |

---

## 7. Security & Privacy Findings

1. **Zero Token Leakage:** Access tokens and refresh tokens are stored strictly in HttpOnly, SameSite=Lax cookies. They are never written to `login_history`, `user_security_log`, `audit_logs`, or application log streams.
2. **Sanitized Error Responses:** All auth failures re-throw generic NestJS `UnauthorizedException('UNAUTHORIZED')` (HTTP 401) or `BadRequestException('VALIDATION_ERROR')` (HTTP 400). Internal account lockout details or user existence flags are not leaked to external clients.

---

## 8. Blocking Issues Before Audit Implementation

1. Implement `SystemClient` audit queries for `login_history` inside `AuthProviderService`.
2. Implement `user_sessions` presence creation on login and deactivation on logout.
3. Add full unit tests covering login success, login failure audit recording, and session presence tracking.

---

## 9. Recommended Implementation Order

1. **Step 1:** Create `AuthAuditService` to encapsulate `login_history` and `user_security_log` writes using `SystemClient`.
2. **Step 2:** Wire `AuthAuditService` into `AuthProviderController.login()` for success and failure branches.
3. **Step 3:** Wire `user_sessions` presence updates into login and logout handlers.
4. **Step 4:** Execute unit and integration tests (`npm test`).

---

## 10. Required Tests

- Successful login creates a `login_history` row with `success = TRUE` and `failure_reason = NULL`.
- Failed password login creates a `login_history` row with `success = FALSE` and `failure_reason = 'invalid_password'`.
- Locked account login creates a `login_history` row with `failure_reason = 'account_locked'`.
- Successful login creates or updates `user_sessions` with `is_online = TRUE`.
- Logout updates `user_sessions` with `is_online = FALSE` and clears cookies.

---

## 11. Rejected Alternatives & Rationale

- **Rejected: Storing Refresh Tokens in `user_sessions` Table**  
  *Why Rejected:* `user_sessions` is a real-time presence table (`03_users_auth.sql` L330). Refresh tokens are managed exclusively by Supabase Auth and transmitted in `Path=/api/v1/auth/refresh` HttpOnly cookies.
- **Rejected: Synchronous Database Transaction Wrapping Supabase Auth Fetch**  
  *Why Rejected:* Violates the rule against running external network calls inside database transactions (`NESTJS-IMPLEMENTATION-GUIDE.md` L16). Supabase Auth `fetch` must execute before opening any DB transaction.

---

## 12. Final Recommendation

```text
Status: FIX FIRST (REQUIRED AUDIT & SESSION IMPLEMENTATION)
Reason: AuthProvider core REST calls and cookie contract are verified. Adding login_history audit logging and user_sessions presence management completes the auth subsystem for production freeze.
```

---

## 13. No-Code-Change Confirmation

I explicitly confirm that **zero source code, SQL migrations, or configuration files were modified** during this independent architectural audit.
