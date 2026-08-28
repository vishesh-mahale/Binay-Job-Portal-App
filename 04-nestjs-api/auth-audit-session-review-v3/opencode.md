# OpenCode — Auth Audit/Session Decisions Review v3

## 1. Executive Verdict

```text
NOT APPROVED — 2 CONFLICTS WITH FROZEN CONTRACT, 3 MISSING REQUIREMENTS, 1 INCORRECT RECOMMENDATION
```

The decision document is well-structured and correctly identifies the decision axes. However, it has two direct conflicts with the frozen `AUTH-ENDPOINT-CONTRACT-DECISION-REQUIRED.md`, one incorrect recommendation about signup audit logging, three missing requirements, and several incomplete specifications that block implementation.

- **CONFLICT: 2** (direct contradictions with frozen contract)
- **INCORRECT RECOMMENDATION: 1**
- **MISSING REQUIREMENT: 5**
- **VERIFIED: 6**
- **SAFE TO DEFER: 2**

## 2. Point-by-Point Analysis

### Decision 1: Login history scope — signup in login_history?

**Document recommendation (line 15):** "Signup ko alag signup audit maana jaye; login_history sirf login attempts ke liye use ho"

**SQL evidence:** `03_users_auth.sql:389` — "Audit log for login attempts (successful and failed)"

**CONFLICT:** The SQL comment says "login attempts" — this is ambiguous. Signup IS an authentication event (Supabase Auth issues tokens). But the SQL also says "Populated via application code (NestJS AuthModule)" (line 391), which is broader than "login only."

**INCORRECT RECOMMENDATION:** The recommendation to exclude signup from `login_history` creates a security gap. When signup succeeds, the user receives access+refresh tokens immediately (`auth-provider.ts:46` — `setSessionCookies(response, session, this.secure)`). This IS an authentication event. If it's not logged anywhere, the first authentication for any user is invisible to security audit.

**Evidence of the gap:**
- `login_history` — recommended to exclude signup
- `user_security_log` — `security_event_type` enum (`02_enums.sql:103-118`) has NO `'account_created'` event type
- `handle_new_user()` trigger creates the user row, but that's data creation, not authentication audit

**Missing requirement:** The document must address where the initial authentication during signup is tracked. Options:
1. Include signup in `login_history` with `login_type='email_password'` and `success=TRUE`
2. Add `'account_created'` to `security_event_type` enum (requires migration)
3. Explicitly document that signup authentication is intentionally not audited (security decision)

**Classification:** INCORRECT RECOMMENDATION — signup should be in `login_history`; document must address the audit gap

### Decision 2: Presence row timing

**Document recommendation (line 26):** "Login par row create na karein; realtime connection par presence row create karein"

**SQL evidence:** `03_users_auth.sql:330-333` — "Active user session tracking for real-time features. Used for WebSocket connections and live presence. This is NOT for auth sessions."

**Frozen contract:** `AUTH-ENDPOINT-CONTRACT-DECISION-REQUIRED.md:18` — "POST /api/v1/auth/logout | Authenticated | Clear both cookies and deactivate the current presence row"

**Frozen contract:** `AUTH-ENDPOINT-CONTRACT-DECISION-REQUIRED.md:41` — "logout must still clear the current presence row when one exists"

**Analysis:** The recommendation is internally consistent with the SQL comment ("real-time features"). If presence rows are only created by WebSocket connections, then login doesn't create one, and logout clears "when one exists" (which may be none).

**But:** The frozen contract explicitly says logout deactivates the "current presence row." If login doesn't create a row, there's no "current" row to deactivate unless a WebSocket connection exists. This makes the logout presence behavior dependent on WebSocket state, which is a valid architectural choice but should be explicitly documented.

**Classification:** VERIFIED — recommendation is consistent with SQL, but must explicitly note the dependency on WebSocket state for logout presence behavior

### Decision 3: Logout scope

**Document recommendation (line 37):** "Option A. Realtime connection ko session ID return/store karna hoga; jab tak ID contract nahi hai, logout presence update ko implement na karein."

**CONFLICT:** This directly contradicts the frozen contract:

| Frozen Contract | This Document |
|---|---|
| `AUTH-ENDPOINT-CONTRACT-DECISION-REQUIRED.md:18` — logout "deactivate the current presence row" | "jab tak ID contract nahi hai, logout presence update ko implement na karein" |
| `AUTH-ENDPOINT-CONTRACT-DECISION-REQUIRED.md:41` — "logout must still clear the current presence row when one exists" | Defers logout presence update |

The frozen contract says logout MUST clear the presence row. This document says to defer it. This is a direct contradiction.

**Additionally:** The `revoke` endpoint (`identity-company.ts:35-46`) already implements session deactivation by ID with `WHERE id = $1 AND user_id = $2`. The infrastructure exists. The question is whether the `logout` endpoint should also do it.

**Classification:** CONFLICT — document defers what frozen contract requires

### Decision 4: Refresh behavior

**Document recommendation (line 43):** "Refresh par user_sessions.last_seen_at update mandatory na banayein"

**Classification:** VERIFIED — refresh is token rotation, not presence heartbeat. Correct.

### Decision 5: Failed-login lockout

**Document (lines 49-57):** Correctly identifies that threshold, counting window, lock duration, etc. need decisions.

**Issue:** The document says "New counter column/table invent nahi karni" — correct, `users.locked_until` exists. But it doesn't recommend any specific policy or even a configuration pattern.

**Missing requirement:** The document should recommend:
- A default lockout policy (e.g., 5 failures in 15 minutes → 30 minute lockout) as a starting point
- Whether the counter resets on successful login
- Whether the counter is per-email or per-IP
- How `locked_until` is set (NestJS code or database function)

Without this, implementation is blocked because the lockout logic cannot be coded.

**Classification:** MISSING REQUIREMENT — no recommended lockout policy or configuration pattern

### Decision 6: Supabase error mapping

**Document (lines 61-73):** Lists the enum values but provides no mapping from Supabase Auth error codes.

**Current code:** `auth-provider.ts:22-24` — 400/422 → `VALIDATION_ERROR`; other → `UNAUTHORIZED`. No error body parsing.

**Missing requirement:** The document must include a mapping table:

| Supabase Auth Response | HTTP Status | login_failure_reason |
|---|---|---|
| `"invalid_grant"` | 401 | `invalid_password` |
| `"email_not_confirmed"` | 401 | `email_not_verified` |
| `"User already registered"` | 400 | N/A (signup, not login) |
| `"Signup disabled"` | 400 | N/A (signup, not login) |
| Network error | N/A | N/A (DEPENDENCY_UNAVAILABLE thrown) |

Without this mapping, the error code → enum conversion is ambiguous.

**Additionally:** The current `SupabaseAuthProvider.call()` method (`auth-provider.ts:22-24`) does NOT parse the response body for error details. It only checks HTTP status. This is a REQUIRED FIX that the document should flag, not just a decision.

**Classification:** MISSING REQUIREMENT — no error code mapping table; no flag that current code doesn't parse error body

### Decision 7: Request metadata

**Document (lines 79-83):** "IP source: trusted reverse-proxy configuration ke baad req.ip" and "User agent: req.headers['user-agent'] ?? NULL"

**Issue:** The document says "available hone par capture honge" — this is vague. `req.ip` and `req.headers['user-agent']` are ALWAYS available in Express. The question is not availability but accuracy (trust proxy for IP) and retention policy for user-agent.

**Missing requirement:** The document should specify:
- `app.set('trust proxy', true)` or specific proxy configuration for accurate IP
- Whether user-agent is stored in full or truncated
- Retention policy for IP and user-agent in `login_history`

**Classification:** MISSING REQUIREMENT — vague "when available" should be "always capture"

### Decision 8: CORS, rate limit, DTO

**Document (lines 87-94):** Correctly identifies these as production gates and defers specific values.

**Classification:** SAFE TO DEFER — correct approach

### Decision 9: Required approval gate

**Document (lines 98-107):** Lists `AuthAuditService` as a new module.

**Issue:** The document lists "known-user security logs" as a gate item. But `user_security_log.user_id` is NOT NULLABLE (`03_users_auth.sql:375`). For unknown-email login failures, there is no `user_id`. The document doesn't address this distinction.

**Missing requirement:** The document should clarify:
- `login_history` covers ALL attempts (user_id nullable)
- `user_security_log` covers ONLY known-user events (user_id NOT NULL)
- Unknown-email failures go to `login_history` only

**Classification:** MISSING REQUIREMENT — no clarification of user_id NULL vs NOT NULL behavior

## 3. Findings Summary

| # | Finding | Classification | Severity |
|---|---|---|---|
| 1 | Signup excluded from login_history creates audit gap | INCORRECT RECOMMENDATION | HIGH |
| 2 | Logout presence update deferred contradicts frozen contract | CONFLICT | HIGH |
| 3 | No recommended lockout policy or configuration pattern | MISSING REQUIREMENT | MEDIUM |
| 4 | No Supabase error code → enum mapping table | MISSING REQUIREMENT | MEDIUM |
| 5 | Current code doesn't parse Supabase Auth error body | MISSING REQUIREMENT (should be flagged) | HIGH |
| 6 | "When available" IP/user-agent should be "always capture" | MISSING REQUIREMENT | LOW |
| 7 | No clarification of user_id NULL vs NOT NULL behavior | MISSING REQUIREMENT | MEDIUM |
| 8 | Presence row timing recommendation is internally consistent | VERIFIED | — |
| 9 | Refresh behavior recommendation is correct | VERIFIED | — |
| 10 | login_history CHECK constraints correctly identified | VERIFIED | — |
| 11 | user_security_log append-only correctly identified | VERIFIED | — |
| 12 | CORS/rate-limit/DTO deferral is correct | SAFE TO DEFER | — |
| 13 | No invented tables/columns/enums/events | VERIFIED | — |

## 4. Required Changes to Decision Document

| # | Section | Change Required |
|---|---|---|
| 1 | §1 Login history scope | Change recommendation: signup SHOULD be in `login_history` with `login_type='email_password'`, `success=TRUE`, `failure_reason=NULL`. This is an authentication event. |
| 2 | §3 Logout scope | Remove "jab tak ID contract nahi hai, logout presence update ko implement na karein." Replace with: "Logout clears the current presence row when one exists (frozen contract). Implement `UPDATE user_sessions SET is_online = false WHERE user_id = $1 AND is_online = true`." |
| 3 | §5 Failed-login lockout | Add recommended default policy: "5 failures in 15 minutes → 30 minute lockout; counter resets on successful login; counter is per-user (not per-IP); `locked_until` set by NestJS code via UPDATE." |
| 4 | §6 Supabase error mapping | Add mapping table from Supabase Auth error codes to `login_failure_reason` enum values. Flag that current `SupabaseAuthProvider.call()` does NOT parse error body — this is a REQUIRED FIX. |
| 5 | §7 Request metadata | Change "available hone par capture honge" to "ALWAYS capture." Add: `app.set('trust proxy', true)` for accurate IP. User-agent stored in full (no truncation). |
| 6 | §9 Approval gate | Add clarification: `login_history` covers ALL attempts (user_id nullable). `user_security_log` covers ONLY known-user events (user_id NOT NULL). Unknown-email failures go to `login_history` only. |

## 5. Conflicts with Frozen Contract

| This Document | Frozen Contract | Resolution |
|---|---|---|
| §3: "logout presence update ko implement na karein" | `AUTH-ENDPOINT-CONTRACT-DECISION-REQUIRED.md:18,41`: logout "deactivate the current presence row" | MUST implement logout presence update per frozen contract |
| §1: signup NOT in login_history | `03_users_auth.sql:389`: "Audit log for login attempts (successful and failed)" — signup IS a successful authentication | signup SHOULD be in login_history |

## 6. What the Document Gets Right

- Correctly identifies that `user_sessions` is NOT for auth sessions (SQL comment)
- Correctly identifies that refresh is token rotation, not presence heartbeat
- Correctly identifies that lockout policy needs explicit decisions
- Correctly identifies that CORS/rate-limit/DTO are production gates
- Correctly identifies that no new tables/columns/enums should be invented
- Correctly identifies the `login_history` CHECK constraint behavior
- Correctly identifies `user_security_log` append-only behavior
- Correctly identifies that `SupabaseAuthProvider` uses `SystemClient` for audit writes

## 7. Classification Legend

| Classification | Meaning |
|---|---|
| VERIFIED | Document's analysis matches code/SQL evidence |
| INCORRECT RECOMMENDATION | Document's recommendation is wrong based on evidence |
| CONFLICT | Document contradicts a frozen contract |
| MISSING REQUIREMENT | Document fails to address a necessary detail |
| SAFE TO DEFER | Deferral is appropriate for this decision |

---

**Reviewer:** OpenCode (independent review against code and SQL baseline)
**Date:** 2026-08-27
**Status:** NOT APPROVED — 2 CONFLICTS, 1 INCORRECT RECOMMENDATION, 5 MISSING REQUIREMENTS
