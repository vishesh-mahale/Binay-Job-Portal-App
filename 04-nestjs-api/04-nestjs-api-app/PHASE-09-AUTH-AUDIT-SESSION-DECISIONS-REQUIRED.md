# Phase 09 — Auth Audit & Session Decisions

**Status:** DECISIONS REQUIRED — implementation is not frozen yet  
**Evidence:** `03_users_auth.sql`, `02_enums.sql`, `AUTH-ENDPOINT-CONTRACT-DECISION-REQUIRED.md`, AuthProvider v2 audit

## 1. Login history scope

**Question:** Kya signup ko `login_history` me record karna hai?

- Option A: Sirf password/OAuth login attempts record hon.
- Option B: Signup success ko bhi successful authentication event ke roop me record karein.

**Constraint:** Successful row me `failure_reason = NULL`; failed row me approved enum reason mandatory hai.

**Current position (not frozen):** SQL comment `login_history` ko login attempts ke liye define karta hai, isliye signup ko automatically is table me add nahi karenge. Signup ke baad session milta hai, isliye signup authentication audit gap ko explicit security decision se close karna hoga. `signup` naam ka naya enum value invent nahi karna.

## 2. Presence row timing

**Question:** `user_sessions` row kab create hogi?

- Option A: Successful login ke baad.
- Option B: WebSocket/SSE connection establish hone par.

SQL comment ke mutabik table realtime presence ke liye hai, Supabase Auth session storage ke liye nahi.

**Conflict with frozen contract:** `PHASE-09-B-API-CONTRACT-DECISIONS-HINGLISH.md` D5/D7 me normal logout ko current authenticated presence row tak limited rakha gaya hai. Realtime-only row creation tabhi compatible hogi jab realtime handshake current `user_sessions.id` ko logout tak reliably bind kare. Login-row creation ya session-ID transport me se ek reviewed choice ke bina presence implementation freeze nahi hogi.

## 3. Logout scope

**Question:** Logout par kaunsi presence row deactivate hogi?

- Option A: Sirf selected/current `user_sessions.id`.
- Option B: User ki saari online rows.

Current cookie contract me local `user_sessions.id` nahi hai. `WHERE user_id AND is_online` sab sessions close kar sakta hai.

**CONFLICT TO RESOLVE:** Frozen endpoint contract logout par current presence row deactivate karne ko kehta hai, lekin cookie contract me `user_sessions.id` nahi hai. Selected-session (session ID transport) ya user-wide logout—ek option approve karna hoga. Broad `WHERE user_id AND is_online` update abhi implement nahi karenge, kyunki usse sab sessions band ho sakte hain.

## 4. Refresh behavior

Refresh token rotation authentication renewal hai, presence heartbeat nahi.

**Recommendation:** Refresh par `user_sessions.last_seen_at` update mandatory na banayein. Presence connection/heartbeat path is field ko update kare.

## 5. Failed-login lockout

**Question:** Lockout kab trigger hoga?

Required decisions:

- failure threshold (`N` attempts)
- counting window
- lock duration
- atomic counter/storage location
- successful login par reset behavior

Current code sirf `locked_until` enforce karta hai; threshold set nahi karta. New counter column/table invent nahi karni—approved schema ya migration decision ke bina implementation hold rahegi.

## 6. Supabase error mapping

Provider error code/message ko approved enum me map karna hoga:

```text
invalid_password
user_not_found
email_not_verified
account_locked
too_many_attempts
suspended
banned
invalid_oauth_token
unknown
```

Raw provider error, password, token ya secret response/log me nahi jana chahiye.

## 7. Request metadata

`login_history.ip_address` aur `user_agent` optional columns hain. Auth audit implement karte waqt values capture karni hain; IP accuracy proxy configuration aur retention policy par depend karegi.

- IP source: trusted reverse-proxy configuration ke baad `req.ip`
- User agent: `req.headers['user-agent'] ?? NULL`
- PII redaction aur retention policy apply hogi.
- Unknown-email failure me `login_history.user_id = NULL` valid hai; `user_security_log` me insert nahi ho sakta kyunki uska `user_id NOT NULL` hai.

## 8. CORS, rate limit, DTO

Ye auth implementation ke production gates hain, par exact values abhi freeze nahi hain:

- allowed frontend origins per environment
- credential/cross-origin cookie mode
- login/signup rate limits
- email/password length and format rules

Values approve hone se pehle wildcard CORS, arbitrary limits ya invented password policy add nahi karni.

## 9. Required approval gate

In decisions ke approve hone ke baad hi:

```text
AuthAuditService
→ login_history writes
→ known-user security logs
→ presence lifecycle
→ exact error mapping
→ tests and production gate review
```

**Current decision status:** `OPEN — HUMAN/CLIENT APPROVAL REQUIRED`
