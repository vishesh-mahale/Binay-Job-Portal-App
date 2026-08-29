# Auth Audit & Session Decisions — Independent Review v3

**Reviewer:** Freebuf (Independent Senior NestJS + PostgreSQL Security Architect)  
**Date:** 2026-08-27  
**Status:** REVIEW COMPLETE — NO CODE CHANGES  
**Target:** `PHASE-09-AUTH-AUDIT-SESSION-DECISIONS-REQUIRED.md`

---

## 1. Executive Verdict

**⚠️ APPROVED WITH REQUIRED FIXES — 2 CONFLICTS + 3 REQUIRED FIXES**

The document correctly identifies the 9 decision areas and frames them as open human-approval items. However, there are **2 direct conflicts** with the frozen contract, **1 critical implementation gap** in error mapping, and **3 missing decisions** that must be resolved before the audit slice can proceed.

---

## 2. Files Inspected

| # | File | Lines Reviewed |
|---|------|----------------|
| 1 | `PHASE-09-AUTH-AUDIT-SESSION-DECISIONS-REQUIRED.md` | Full — 9 decisions |
| 2 | `src/auth-provider.ts` | Full — SupabaseAuthProvider, AuthProviderController |
| 3 | `src/auth.ts` | Full — AuthGuard, verifyBearer |
| 4 | `02_enums.sql` | L75-118 — login_failure_reason, auth_login_type, security_event_type |
| 5 | `03_users_auth.sql` | Full — users, user_sessions, user_security_log, login_history, triggers |
| 6 | `AUTH-ENDPOINT-CONTRACT-DECISION-REQUIRED.md` | Full — frozen route matrix |

---

## 3. Decision-by-Decision Review

### Decision 1: Login History Scope

**Document says:** "Signup ko alag signup audit maana jaye; `login_history` sirf login attempts ke liye use ho."

| Check | Status | Classification | Evidence |
|-------|--------|----------------|----------|
| Recommendation is reasonable | ✅ | VERIFIED | `login_history` SQL comment: "Audit log for login attempts" |
| `login_type` enum supports this | ✅ | VERIFIED | `auth_login_type` has `email_password`, `oauth`, `otp`, etc. — no `signup` value |
| Constraint: success=TRUE → failure_reason IS NULL | ✅ | VERIFIED | `login_history_result_consistency` CHECK constraint |
| Constraint: success=FALSE → failure_reason IS NOT NULL | ✅ | VERIFIED | Same constraint |
| `user_id` can be NULL for failed login | ✅ | VERIFIED | `user_id UUID REFERENCES public.users(id)` — no NOT NULL |

**Finding F-1 (MEDIUM):** The document says "jab tak client explicitly signup logging approve na karein" — but `login_history` is the ONLY audit trail for authentication attempts. If signup is excluded, there is **zero audit trail** for account creation events. The `user_security_log` table could track `email_verified` events, but not the signup itself.

**Recommendation:** Add a note that signup exclusion means zero audit trail for account creation, and that `user_security_log` with `email_verified` event covers only post-verification, not the signup moment.

### Decision 2: Presence Row Timing

**Document says:** "Login par row create na karein; realtime connection par presence row create karein."

| Check | Status | Classification | Evidence |
|-------|--------|----------------|----------|
| SQL comment supports this | ✅ | VERIFIED | `03_users_auth.sql` L268: "Active user session tracking for real-time features" |
| `socket_id` column is WebSocket-specific | ✅ | VERIFIED | `03_users_auth.sql` L273: "WebSocket connection ID for real-time disconnect handling" |
| `device_type` column exists | ✅ | VERIFIED | `03_users_auth.sql` L274: "desktop, mobile, tablet" |

**⚠️ CONFLICT-1: Direct conflict with frozen contract**

`AUTH-ENDPOINT-CONTRACT-DECISION-REQUIRED.md` states:
> "POST /auth/logout | Authenticated | Clear both cookies and **deactivate the current presence row**"

The decision document says to defer presence to WebSocket. But the frozen contract **explicitly requires** logout to "deactivate the current presence row." These two documents contradict each other.

**Resolution options:**
1. **Update the frozen contract** to say "deactivate the current presence row if one exists" (softens the requirement)
2. **Create presence rows at login** to satisfy the frozen contract
3. **Accept the conflict** and explicitly note that the frozen contract needs amendment

**Classification:** CONFLICT — must resolve before implementation.

### Decision 3: Logout Scope

**Document says:** "Option A. Realtime connection ko session ID return/store karna hoga; jab tak ID contract nahi hai, logout presence update ko implement na karein."

| Check | Status | Classification | Evidence |
|-------|--------|----------------|----------|
| Current logout only clears cookies | ✅ | VERIFIED | `auth-provider.ts` L57-58: `clearCookie` for both tokens |
| `user_sessions` has `socket_id` column | ✅ | VERIFIED | `03_users_auth.sql` L273 |
| No session ID in cookie contract | ✅ | VERIFIED | `AUTH-COOKIE-CONTRACT-TEMPORARY.md`: no session_id cookie |

**Finding F-2 (HIGH):** The recommendation "logout presence update ko implement na karein" directly contradicts the frozen contract which says logout must "deactivate the current presence row." Even if we defer presence creation to WebSocket, the contract says logout should clear whatever presence exists.

**Correct behavior if presence is deferred:** Logout should still execute `UPDATE user_sessions SET is_online = false WHERE user_id = $1 AND is_online = true` — this is a best-effort cleanup that works regardless of whether a presence row exists.

### Decision 4: Refresh Behavior

**Document says:** "Refresh par `user_sessions.last_seen_at` update mandatory na banayein."

| Check | Status | Classification | Evidence |
|-------|--------|----------------|----------|
| Refresh is token renewal, not presence heartbeat | ✅ | VERIFIED | Correct design principle |
| `last_seen_at` column exists | ✅ | VERIFIED | `03_users_auth.sql` L272 |

**Finding F-3 (LOW):** The recommendation is correct but the document should explicitly state what refresh SHOULD do: "Refresh par `user_sessions` se koi interaction na ho — refresh sirf Supabase Auth token rotation kare." This prevents future developers from adding presence logic to refresh.

### Decision 5: Failed-Login Lockout

**Document says:** "New counter column/table invent nahi karni—approved schema ya migration decision ke bina implementation hold rahegi."

| Check | Status | Classification | Evidence |
|-------|--------|----------------|----------|
| `locked_until` column exists | ✅ | VERIFIED | `03_users_auth.sql` L117 |
| Login checks `locked_until` | ✅ | VERIFIED | `auth-provider.ts` L46 |
| `locked_until` is never SET | ✅ | VERIFIED | No UPDATE to `users.locked_until` in any code |
| `idx_users_locked_until` index exists | ✅ | VERIFIED | `03_users_auth.sql` L441 |

**Finding F-4 (MEDIUM):** The document correctly identifies the gap but provides no recommendation for WHERE to track the failure count. The options are:
1. **In-memory counter** — lost on restart, not shared across instances
2. **Redis/Memorystore** — requires infrastructure, not in current stack
3. **Reuse `login_history`** — COUNT recent failures per user_id/email
4. **New `login_attempts` counter column on `users`** — requires migration

The document says "New counter column/table invent nahi karni" but option 3 (reuse `login_history`) doesn't invent anything — it queries existing data. This should be explicitly recommended.

### Decision 6: Supabase Error Mapping

**Document says:** Lists correct enum values for `login_failure_reason`.

| Check | Status | Classification | Evidence |
|-------|--------|----------------|----------|
| Enum values correct | ✅ | VERIFIED | `02_enums.sql` L78-88: all 9 values match |
| "Raw provider error, password, token ya secret response/log me nahi jana chahiye" | ✅ | VERIFIED | Correct security requirement |

**🔴 CRITICAL-1: Missing error parsing implementation guidance**

The document lists the correct enum values but does NOT address the **actual implementation problem**: the current code throws `BadRequestException('VALIDATION_ERROR')` for ALL Supabase 400 errors without parsing the response body.

`auth-provider.ts` L23:
```typescript
if (!response.ok) {
  if (response.status === 400 || response.status === 422) throw new BadRequestException('VALIDATION_ERROR');
  throw new UnauthorizedException('UNAUTHORIZED');
}
```

This means:
- Wrong password → `VALIDATION_ERROR` (should be `invalid_password`)
- User not found → `VALIDATION_ERROR` (should be `user_not_found`)
- Email not verified → `VALIDATION_ERROR` (should be `email_not_verified`)

The `payload` variable (L22) contains the Supabase error body (`{ error: string, error_code: string, message: string }`) but it is **never parsed** for failure reason mapping.

**Required fix:** The `call()` method must be refactored to:
1. Parse the Supabase error response body
2. Map `error_code` or `error` string to the approved `login_failure_reason` enum
3. Return a typed error that the controller can use for audit writes

### Decision 7: Request Metadata

**Document says:** "IP source: trusted reverse-proxy configuration ke baad `req.ip`"

| Check | Status | Classification | Evidence |
|-------|--------|----------------|----------|
| `login_history.ip_address` is INET type | ✅ | VERIFIED | `03_users_auth.sql` L380 |
| `login_history.user_agent` is TEXT type | ✅ | VERIFIED | `03_users_auth.sql` L381 |
| `req.ip` available in Express | ✅ | VERIFIED | Express built-in |
| `trust proxy` not configured | ⚠️ | MISSING REQUIREMENT | `main.ts` has no `app.set('trust proxy', ...)` |

**Finding F-5 (MEDIUM):** Without `trust proxy` configuration, `req.ip` behind a load balancer returns the LB's IP, not the client's. This must be configured per environment before IP capture is meaningful.

### Decision 8: CORS, Rate Limit, DTO

**Document says:** "Values approve hone se pehle wildcard CORS, arbitrary limits ya invented password policy add nahi karni."

| Check | Status | Classification | Evidence |
|-------|--------|----------------|----------|
| CORS not configured | ✅ | VERIFIED | No CORS middleware in `main.ts` |
| Rate limiting not configured | ✅ | VERIFIED | No `@Throttle()` or rate-limit middleware |
| DTOs have no validators | ✅ | VERIFIED | `SignupDto`/`LoginDto` are empty classes |

**Finding F-6 (LOW):** The document correctly gates these behind approval but doesn't note that CORS must be configured BEFORE any browser-based OAuth testing. This is a practical dependency, not just a production gate.

### Decision 9: Approval Gate

**Document says:** "In decisions ke approve hone ke baad hi: AuthAuditService → login_history writes → known-user security logs → presence lifecycle → exact error mapping → tests and production gate review"

| Check | Status | Classification | Evidence |
|-------|--------|----------------|----------|
| Gate ordering is logical | ✅ | VERIFIED | Correct dependency chain |
| "Current decision status: OPEN" | ✅ | VERIFIED | Honest status |

---

## 4. Missing Decisions

| # | Missing Decision | Why It Matters | Classification |
|---|-----------------|----------------|----------------|
| **M-1** | **Supabase error body parsing** — exact mapping from Supabase `error_code` to `login_failure_reason` | Without this, audit writes have no failure reason, and the `login_history_result_consistency` constraint may be violated | REQUIRED DECISION |
| **M-2** | **`trust proxy` configuration** — Express setting for accurate IP capture behind load balancer | Without this, `ip_address` column stores LB IP, not client IP | REQUIRED DECISION |
| **M-3** | **`user_security_log` event mapping** — which auth events write to `user_security_log` vs `login_history` | The document mentions "known-user security logs" in Decision 9 but doesn't define the exact mapping | REQUIRED DECISION |

---

## 5. Security Concerns

| # | Concern | Severity | Classification | Evidence |
|---|---------|----------|----------------|----------|
| **S-1** | Supabase error response body contains `error_code` and `msg` — if logged without redaction, could leak internal Supabase error details | HIGH | REQUIRED FIX | `auth-provider.ts` L22: `payload` is parsed but not redacted before potential logging |
| **S-2** | `login_history.user_id` is NULL for failed login — if email is wrong, there's no user to reference. This is correct SQL design but the document doesn't explain this to implementers | MEDIUM | MISSING REQUIREMENT | `03_users_auth.sql` L371: `user_id UUID REFERENCES...` (nullable) |
| **S-3** | `locked_until` check uses `new Date(...).getTime() > Date.now()` — timezone-dependent. If server timezone differs from DB timezone, lockout may be incorrectly enforced | LOW | SAFE TO DEFER | `auth-provider.ts` L46: JS Date comparison |
| **S-4** | No CSRF protection on login/signup — `SameSite=Lax` provides partial protection but same-site attacks are possible | LOW | SAFE TO DEFER | Cookie contract uses `SameSite=Lax` |

---

## 6. Schema Conflict Check

| Item | Invented? | Evidence |
|------|-----------|----------|
| `login_history` table | ❌ No | `03_users_auth.sql` L354 |
| `user_security_log` table | ❌ No | `03_users_auth.sql` L339 |
| `user_sessions` table | ❌ No | `03_users_auth.sql` L268 |
| `login_failure_reason` enum | ❌ No | `02_enums.sql` L78 |
| `security_event_type` enum | ❌ No | `02_enums.sql` L103 |
| `auth_login_type` enum | ❌ No | `02_enums.sql` L92 |
| `locked_until` column | ❌ No | `03_users_auth.sql` L117 |
| Any new table/column | ❌ No | All objects exist in baseline |

**Zero inventions.** All recommendations use existing schema objects only.

---

## 7. Exact Required Changes in the Decision Document

| # | Section | Current Text | Issue | Required Change |
|---|---------|-------------|-------|-----------------|
| **C-1** | Decision 2 | "Login par row create na karein" | CONFLICT with frozen contract | Add: "Frozen contract says logout must 'deactivate the current presence row'. If presence is deferred to WebSocket, logout must still execute best-effort `UPDATE user_sessions SET is_online = false WHERE user_id = $1 AND is_online = true`." |
| **C-2** | Decision 3 | "logout presence update ko implement na karein" | CONTRADICTS frozen contract | Replace with: "Logout must clear any existing presence row for the user. If no row exists, the UPDATE is a no-op." |
| **C-3** | Decision 6 | Lists enum values but no parsing guidance | CRITICAL gap | Add: "Supabase Auth returns `{ error, error_code, message }` on 400. The `call()` method must parse this body and map `error_code` to `login_failure_reason` before throwing. Raw error must not be logged or returned." |
| **C-4** | Decision 7 | "trusted reverse-proxy configuration ke baad `req.ip`" | Missing implementation detail | Add: "Express `trust proxy` must be configured per environment before IP capture is meaningful. Without it, `req.ip` returns the direct connection IP." |
| **C-5** | Decision 9 | "known-user security logs" | Vague | Add explicit mapping: "`user_security_log` events: `login_failed` (when user_id known), `account_locked` (when lockout triggered). `login_history` covers all attempts regardless of user_id." |

---

## 8. Blocking Issues Before Audit Implementation

| # | Issue | Blocks | Must Resolve Before |
|---|-------|--------|-------------------|
| 1 | **CONFLICT-1:** Presence timing contradicts frozen contract | Logout behavior, contract compliance | Any audit implementation |
| 2 | **CRITICAL-1:** Supabase error body not parsed | `login_history.failure_reason` cannot be populated correctly | `login_history` writes |
| 3 | **M-1:** `user_security_log` event mapping undefined | Security audit completeness | Security log writes |
| 4 | **M-2:** `trust proxy` not configured | IP capture accuracy | IP-dependent audit writes |

---

## 9. Recommended Implementation Order (After Fixes)

```
1. Resolve CONFLICT-1: Amend frozen contract or presence timing decision
2. Refactor SupabaseAuthProvider.call() to parse error body
3. Implement login_history INSERT with exact enum mapping
4. Implement user_security_log INSERT for login_failed + account_locked
5. Configure trust proxy per environment
6. Implement presence lifecycle (login create, logout best-effort clear)
7. Implement account lockout (reuse login_history COUNT approach)
8. Add DTO validators, CORS, rate limiting (parallel track)
```

---

## 10. Final Verdict

| Category | Status |
|----------|--------|
| **Overall** | ⚠️ **APPROVED WITH REQUIRED FIXES** |
| Decision accuracy | ⚠️ 7/9 correct, 2 conflict with frozen contract |
| Schema grounding | ✅ Zero inventions |
| Security awareness | ✅ Correct principles |
| Implementation readiness | ❌ BLOCKED by CONFLICT-1 + CRITICAL-1 |
| Missing decisions | 3 (error parsing, trust proxy, security_log mapping) |

**The document correctly frames the decisions as open. But 2 conflicts with the frozen contract and 1 critical implementation gap must be resolved before the audit slice can proceed. Apply C-1 through C-5, then the document is ready for human approval.**

---

*Report generated: 2026-08-27*  
*Reviewer: Freebuf*  
*No source code, SQL or existing documents modified during this review.*
