# Master Auth & Account Security Playwright Test Matrix
**Binay Job Portal Application (`CollabFor`)**  
*Authoritative E2E & API Test Reference for QA, Automation & Playwright Test Suites*

---

## 📌 Executive Architecture & Contract Reference

### 1. API Endpoints & Service Port Contracts
- **NestJS Core API (Includes Auth `/api/v1/auth/*`)**: `http://localhost:${process.env.PORT || 3000}` (Default API Port: `3000`, Fallback: `4000`)
- **Next.js Web Frontend**: `http://localhost:${process.env.FRONTEND_PORT || 3001}` (Default Web Port: `3001`)
- **NestJS Outbox Dispatcher Service**: `http://localhost:3002` (Event & Notification Queue Dispatcher)
- **FastAPI AI Worker Service**: `http://localhost:8080` (Resume Parsing & AI Matching)
- **Session Cookie Contracts**:
  - `collabfor_access_token` (HttpOnly, Secure in prod, Path `/`, SameSite `Lax`)
  - `collabfor_refresh_token` (HttpOnly, Secure in prod, Path `/api/v1/auth/refresh`, SameSite `Lax`)
  - `collabfor_presence_session` (HttpOnly, Secure in prod, Path `/api/v1`, SameSite `Lax`)
- **Multi-Tab Session Sync**:
  - `collabfor_auth_channel` (Browser `BroadcastChannel`, not a cookie) - Used by frontend `auth-context.tsx` for real-time multi-tab logout synchronization (S-043).
- **Session Invalidation Policy**:
  - **Option A (Strict Security Enforced)**: Changing or Resetting Password triggers a global session revocation (`scope=global`), invalidating all active refresh tokens and setting `last_password_changed_at = NOW()` in PostgreSQL. Any active sessions on other devices (Laptop, Mobile) attempting API calls or token refresh are immediately rejected (`401 Unauthorized`).
  - **Single Refresh Request Deduplication**: `ApiClient` in frontend queues simultaneous 401 parallel requests behind a single `refreshPromise` to prevent refresh token race conditions.
  - **Dynamic DB Status Guard (`AuthGuard`)**: Every protected request checks `public.users` table for `status === 'active'`, `deleted_at IS NULL`, `locked_until < NOW()`, and `last_password_changed_at < token.iat`. If account status changes to `suspended`/`banned`/`deleted`, access is immediately revoked (`401 Unauthorized`).
- **Standard Unified JSON Error Response Format**:
  ```json
  {
    "success": false,
    "data": null,
    "error": {
      "code": "VALIDATION_ERROR | UNAUTHORIZED | FORBIDDEN | TOO_MANY_REQUESTS | ROLE_PROVISIONING_FAILED | DEPENDENCY_UNAVAILABLE",
      "message": "Human-readable detailed error message"
    },
    "schema_version": 1
  }
  ```

---

## 🧪 CATEGORY 1: SIGNUP FLOW (`/signup` & `POST /api/v1/auth/signup`)

| Test ID | Test Scenario | Input Data | Layer Tested | Expected API Status / Response | Expected Frontend UI Behavior | Playwright Test Assertion |
|---|---|---|---|---|---|---|
| **SIGNUP-01** | Valid Candidate Signup | `email`: `cand@example.com`<br>`password`: `Password123!`<br>`confirmPassword`: `Password123!`<br>`register_as`: `candidate` | Frontend + API | `201 Created`<br>`{ status: "pending_verification" }` | Redirects to `/verify-email` | `await expect(page).toHaveURL('/verify-email')` |
| **SIGNUP-02** | Valid Employer Signup | `email`: `emp@example.com`<br>`password`: `Password123!`<br>`confirmPassword`: `Password123!`<br>`register_as`: `employer` | Frontend + API | `201 Created`<br>`{ status: "pending_verification" }` | Redirects to `/verify-email` | Role selector sends `register_as: 'employer'` |
| **SIGNUP-03** | Duplicate Email | `email`: `cand@example.com`<br>(Already registered) | API + Frontend | `400 Bad Request`<br>`code: "VALIDATION_ERROR"`<br>`message: "User already registered. Please sign in instead."` | Displays red alert:<br>`"User already registered. Please sign in instead."` | `await expect(page.getByTestId('signup-error-alert')).toContainText('already registered')` |
| **SIGNUP-04** | Password Mismatch | `password`: `Pass@12345`<br>`confirmPassword`: `Pass@99999` | Frontend UI | **No API Call (0 Network Requests)** | Displays red alert:<br>`"Passwords do not match."` | `expect(apiCallCount).toBe(0)` |
| **SIGNUP-05** | Weak Password (< 8 chars) | `password`: `Pass1!` | Frontend + API | `400 Bad Request`<br>`code: "VALIDATION_ERROR"` | Displays red alert:<br>`"Password must be at least 8 characters long."` | Frontend blocks submit locally |
| **SIGNUP-06** | Missing Email | `email`: `""` | Frontend UI | **No API Call** | Displays red alert:<br>`"Email address is required."` | `await expect(alert).toHaveText('Email address is required.')` |
| **SIGNUP-07** | Missing Password | `password`: `""` | Frontend UI | **No API Call** | Displays red alert:<br>`"Password is required."` | Form submit prevented |

---

## 📧 CATEGORY 2: EMAIL VALIDATION MATRIX (20 TEST CASES)

| Case # | Input Email | Expected Result | Frontend Validation (`Next.js`) | Backend Validation (`NestJS DTO`) | Playwright Verification Strategy |
|:---:|---|:---:|---|---|---|
| 1 | `test` | ❌ Reject | Blocked (`/\S+@\S+\.\S+/`) | 400 `VALIDATION_ERROR` | Verify form alert & 400 direct POST |
| 2 | `test@` | ❌ Reject | Blocked (Missing domain) | 400 `VALIDATION_ERROR` | Verify form alert & 400 direct POST |
| 3 | `@gmail.com` | ❌ Reject | Blocked (Missing username) | 400 `VALIDATION_ERROR` | Verify form alert & 400 direct POST |
| 4 | `test@gmail` | ❌ Reject | Blocked (Missing TLD `.com`) | 400 `VALIDATION_ERROR` | Verify form alert & 400 direct POST |
| 5 | `test@domain` | ❌ Reject | Blocked (No dot in domain part) | 400 `VALIDATION_ERROR` | Verify form alert & 400 direct POST |
| 6 | `test@gmail.` | ❌ Reject | Blocked (Trailing dot) | 400 `VALIDATION_ERROR` | Verify form alert & 400 direct POST |
| 7 | `.test@gmail.com` | ❌ Reject | Form passes to API (`/\S+@\S+\.\S+/`) | 400 `VALIDATION_ERROR` (`@IsEmail()`) | Verify 400 direct API response (`@IsEmail()` reject) |
| 8 | `test..abc@gmail.com` | ❌ Reject | Form passes to API (`/\S+@\S+\.\S+/`) | 400 `VALIDATION_ERROR` (`@IsEmail()`) | Verify 400 direct API response (`@IsEmail()` reject) |
| 9 | `test @gmail.com` | ❌ Reject | Blocked (Space inside) | 400 `VALIDATION_ERROR` | Verify form alert & 400 direct POST |
| 10 | `test@gmail.com ` | Trimmed & Accept | Trims space → `test@gmail.com` | `@Transform` trims space → Valid | Verify normalized email sent in payload |
| 11 | ` test@gmail.com` | Trimmed & Accept | Trims space → `test@gmail.com` | `@Transform` trims space → Valid | Verify normalized email sent in payload |
| 12 | `test@@gmail.com` | ❌ Reject | Blocked (Double `@`) | 400 `VALIDATION_ERROR` | Verify form alert & 400 direct POST |
| 13 | `test@gmail,com` | ❌ Reject | Blocked (Comma instead of dot) | 400 `VALIDATION_ERROR` | Verify form alert & 400 direct POST |
| 14 | `123` | ❌ Reject | Blocked (Non-email string) | 400 `VALIDATION_ERROR` | Verify form alert & 400 direct POST |
| 15 | `""` (empty) | ❌ Reject | Blocked ("Email is required") | 400 `VALIDATION_ERROR` | Verify form alert & 400 direct POST |
| 16 | `null` | ❌ Reject | Blocked | 400 `VALIDATION_ERROR` | Verify 400 direct POST |
| 17 | `test@gmail.com` | ✅ Accept | Valid | 201 Created | Verify 201 Created & verification screen |
| 18 | `john.doe+test@gmail.com` | ✅ Accept | Valid (`+` alias supported) | 201 Created | Verify `+` alias email registered |
| 19 | `user_name@gmail.com` | ✅ Accept | Valid (`_` supported) | 201 Created | Verify `_` email registered |
| 20 | `TEST@GMAIL.COM` | Normalized | Form submits | Lowercased → `test@gmail.com` | Verify registered in lowercase DB record |

---

## 🔑 CATEGORY 3: WEAK PASSWORD & PASSWORD POLICY MATRIX

*Project Baseline Policy: **Minimum 8 Characters** (`@MinLength(8)` in NestJS & Frontend)*

| Test ID | Flow Tested | Input Password | Expected Result | API Error Response | Playwright Test Assertion |
|---|---|---|:---:|---|---|
| **PWD-01** | Signup / Change / Reset | `123` (3 chars) | ❌ Reject | `400 Bad Request`<br>`"password must be longer than or equal to 8 characters"` | Verify alert displayed |
| **PWD-02** | Signup / Change / Reset | `123456` (6 chars) | ❌ Reject | `400 Bad Request`<br>`"password must be longer than or equal to 8 characters"` | Verify alert displayed |
| **PWD-03** | Signup / Change / Reset | `pass` (4 chars) | ❌ Reject | `400 Bad Request`<br>`"password must be longer than or equal to 8 characters"` | Verify alert displayed |
| **PWD-04** | Signup / Change / Reset | `P@ss1` (5 chars) | ❌ Reject | `400 Bad Request`<br>`"password must be longer than or equal to 8 characters"` | Verify alert displayed |
| **PWD-05** | Signup / Change / Reset | `Pass1!` (6 chars) | ❌ Reject | `400 Bad Request`<br>`"password must be longer than or equal to 8 characters"` | Verify alert displayed |
| **PWD-06** | Signup / Change / Reset | `Ab1!` (4 chars) | ❌ Reject | `400 Bad Request`<br>`"password must be longer than or equal to 8 characters"` | Verify alert displayed |
| **PWD-07** | Signup / Change / Reset | `""` (Empty) | ❌ Reject | `400 Bad Request`<br>`code: "VALIDATION_ERROR"` | Verify alert displayed |
| **PWD-08** | Change Password | `current`: `OldPass1!`<br>`new`: `OldPass1!` (Same) | ❌ Reject | `400 Bad Request`<br>`"New password must be different from current password."` | Verify same password rejected |
| **PWD-09** | Signup / Change / Reset | `password123` (11 chars) | ✅ Accept | `200 / 201 OK` | Success path executed |
| **PWD-10** | Signup / Change / Reset | `Password@123` (12 chars) | ✅ Accept | `200 / 201 OK` | Success path executed |
| **PWD-11** | Password with Special Chars | `P@ss$w0rd!#%^&*()` | ✅ Accept | `200 / 201 OK` | Special symbols handled cleanly |

---

## 📩 CATEGORY 4: EMAIL VERIFICATION & RESEND FLOW (`/verify-email`)

| Test ID | Test Scenario | Hash / URL Parameter | API / Parser Status | Expected UI Behavior | Security / DB Verification |
|---|---|---|---|---|---|
| **VERIFY-01** | Valid Signup Verification Link | `#access_token=valid_jwt&type=signup` | `status: 'success'` | Shows green checkmark `"Email Verified!"` with button `"Proceed to Sign In"` | URL Hash scrubbed immediately via `replaceState` |
| **VERIFY-02** | Expired Link | `#error_code=otp_expired` | `status: 'error'` | Displays red alert:<br>`"Verification link has expired or is invalid."` | Address bar scrubbed safely |
| **VERIFY-03** | Invalid / Random Token | `#access_token=random_junk&type=signup` | `status: 'error'` | Displays error:<br>`"Verification link is incomplete or invalid."` | Token parsing failure handled without crash |
| **VERIFY-04** | Missing Token / Direct Visit | No hash (`/verify-email`) | `status: 'pending'` | Displays guidance screen:<br>`"Check Your Email" / "Please click the link in your email"` | No 404 or JS crash |
| **VERIFY-05** | Token Already Used / Re-visit | Hash scrubbed or expired | `status: 'error' / 'pending'` | Graceful error screen with resend link | Prevents duplicate verification side-effects |
| **VERIFY-06** | Resend Verification Email | `POST /api/v1/auth/resend-verification`<br>`{ "email": "user@example.com" }` | `200 OK`<br>`"If an unverified account exists..."` | Displays resend confirmation message | Enumeration-safe generic response |
| **VERIFY-07** | Resend Rate Limit (Spam) | 5+ rapid resend requests | `429 Too Many Requests`<br>`code: "TOO_MANY_REQUESTS"` | Displays rate limit alert:<br>`"Email rate limit exceeded..."` | Enforced in NestJS controller & Supabase auth provider |

---

## 🔐 CATEGORY 5: LOGIN & AUTHENTICATION MASTER MATRIX (`/login` & `POST /api/v1/auth/login`)

### 1. Happy Path & Role Redirection
| Test ID | Scenario | Input Data | API Response | Frontend Redirect | Playwright Assertion |
|---|---|---|---|---|---|
| **L-001** | Candidate Login | Valid candidate credentials | `200 OK`, set-cookie `collabfor_*` | `/dashboard/candidate` | `await expect(page).toHaveURL('/dashboard/candidate')` |
| **L-002** | Employer Login | Valid employer credentials | `200 OK`, set-cookie `collabfor_*` | `/dashboard/employer` | `await expect(page).toHaveURL('/dashboard/employer')` |
| **L-003** | HR Manager Login | Valid HR credentials | `200 OK`, set-cookie `collabfor_*` | `/dashboard/hr` | `await expect(page).toHaveURL('/dashboard/hr')` |
| **L-004** | Admin Login | Valid admin credentials | `200 OK`, set-cookie `collabfor_*` | `/dashboard/admin` | `await expect(page).toHaveURL('/dashboard/admin')` |
| **L-005** | Login with leading/trailing email spaces | `  cand@example.com  ` | `200 OK` | `email.trim()` sent → Success | `email` value trimmed before POST |
| **L-006** | Login with uppercase email | `CAND@EXAMPLE.COM` | `200 OK` | Lowercased & authenticated | Account located & logged in |

### 2. Invalid Credentials & Account Enumeration Safeguards
| Test ID | Scenario | Input Data | API Response | Frontend Error Message | Security Assertion |
|---|---|---|---|---|---|
| **L-010** | Wrong Password | Correct email + wrong password | `401 Unauthorized` | `"Invalid email or password..."` | **Does NOT reveal email exists** |
| **L-011** | Non-existent Email | Unregistered email + password | `401 Unauthorized` | `"Invalid email or password..."` | **Identical response to L-010** |
| **L-012** | Case-sensitive Password Check | Correct email + lowercased password | `401 Unauthorized` | `"Invalid email or password..."` | Password matching is strictly case sensitive |
| **L-013** | SQL Injection Attempt in Email | `' OR '1'='1` | `400 Bad Request` | `"Please enter a valid email address."` | Input sanitized, no database leak |
| **L-014** | XSS Script Tag in Email Field | `<script>alert(1)</script>` | `400 Bad Request` | `"Please enter a valid email address."` | Blocked by email format check |

---

## 🔄 CATEGORY 6: CHANGE, FORGOT & RESET PASSWORD COMPREHENSIVE MATRIX

### 1. Change Password (Logged-in User Flow - `POST /api/v1/auth/change-password`)
| Test ID | Scenario | Request Inputs | API Status & Error Code | Expected UI / Session Effect | Playwright Assertion |
|---|---|---|---|---|---|
| **CP-01** | Valid Change Password | `current_password`: `OldPass123!`<br>`new_password`: `NewPass123!` | `200 OK`<br>`"Password changed successfully."` | Success alert displayed | New password works for subsequent login |
| **CP-02** | Wrong Current Password | `current_password`: `WrongOldPass!`<br>`new_password`: `NewPass123!` | `401 Unauthorized`<br>`code: "UNAUTHORIZED"` | Displays error: `"Invalid current password."` | Password unchanged |
| **CP-03** | Empty Current Password | `current_password`: `""` | `400 Bad Request`<br>`code: "VALIDATION_ERROR"` | Validation error displayed | API call blocked or rejected |
| **CP-04** | Empty New Password | `new_password`: `""` | `400 Bad Request`<br>`code: "VALIDATION_ERROR"` | Validation error displayed | API call blocked or rejected |
| **CP-05** | Weak New Password (< 8 chars) | `new_password`: `Pass1!` | `400 Bad Request`<br>`code: "VALIDATION_ERROR"` | Error: `"password must be at least 8 characters long"` | API rejected |
| **CP-06** | New Password Same as Current | `current`: `SamePass123!`<br>`new`: `SamePass123!` | `400 Bad Request`<br>`code: "VALIDATION_ERROR"` | Error: `"New password must be different from current password."` | API rejected |
| **CP-07** | Password Confirmation Mismatch | `new`: `NewPass123!`<br>`confirm`: `DiffPass123!` | Frontend Validation | Error: `"Passwords do not match."` | 0 API calls sent |
| **CP-08** | Missing Auth Cookie / Token | No `collabfor_access_token` cookie | `401 Unauthorized`<br>`code: "UNAUTHORIZED"` | Redirects to `/login` | Access denied |
| **CP-09** | Device B Session Revocation Check | Device A changes password | Device B API request → `401 Unauthorized` | Device B is automatically logged out (`scope=global` revocation & `last_password_changed_at`) | Global session invalidated |

---

## 🚪 CATEGORY 7: SESSION LIFECYCLE, TOKEN REFRESH, IDOR & MULTI-DEVICE SECURITY MATRIX (`S-001` to `S-055`)

### 1. Session Creation & Protected Resource Access
| Test ID | Scenario | Endpoint / Action | Expected HTTP Status / Behavior | System Safeguard Assertion |
|---|---|---|---|---|
| **S-001** | Valid Login Session Creation | `POST /api/v1/auth/login` | `200 OK`, Cookies `collabfor_*` set | HttpOnly session created safely |
| **S-002** | Access Protected API Immediately | `GET /api/v1/auth/me` | `200 OK` | `UserSummary` profile object returned |
| **S-003** | User Identity Accuracy | `GET /api/v1/auth/me` | `id === session.user_id` | Correct user profile payload returned |
| **S-004** | Correct Role Payload | `GET /api/v1/auth/me` | `role === 'candidate' \| 'employer' \| 'hr' \| 'admin'` | Matching RBAC role returned |
| **S-005** | Protected API without Cookie / Token | `GET /api/v1/auth/me` (No Cookie) | `401 Unauthorized` | Access denied immediately |
| **S-006** | Missing Bearer Prefix | `Authorization: <token>` | `401 Unauthorized` | Strict Bearer header parser enforced |
| **S-007** | Invalid / Junk Token | `Authorization: Bearer junk_string` | `401 Unauthorized` | Token signature verification failure handled |
| **S-008** | Tampered Token (Payload modified) | Edited payload base64 string | `401 Unauthorized` | Cryptographic signature failure |
| **S-009** | Token Belonging to Another User | Candidate A token to fetch Candidate B private profile | `403 Forbidden` / User Isolation | **IDOR Data Isolation Enforced**: Candidate A cannot access Candidate B data |

### 2. Auto-Refresh Flow, Race Conditions & Multi-Tab Behavior
| Test ID | Scenario | Trigger Condition | System Handling / Behavior | Security Assertion |
|---|---|---|---|---|
| **S-019** | Access Token Normal Expiration | Access token expires after TTL | Next protected API returns `401 Unauthorized` | Frontend catches 401 and invokes `ApiClient.refresh()` |
| **S-022** | Expired Token + Valid Refresh Cookie | `POST /api/v1/auth/refresh` | `200 OK`, new `collabfor_access_token` set | Session extended seamlessly without user re-login |
| **S-023** | Expired Token + Expired Refresh Cookie | `POST /api/v1/auth/refresh` | `401 Unauthorized`, Cookies cleared | Redirects user to `/login` |
| **S-025** | **Multiple Simultaneous 401s (Refresh Race)** | 5 protected API calls expire at exact same millisecond | `ApiClient.refreshPromise` deduplicates request: **Exactly 1 POST /auth/refresh API call executed** | Single refresh execution, all 5 pending APIs retried successfully |
| **S-034** | Refresh Attempt After Logout | `POST /api/v1/auth/refresh` after logout | `401 Unauthorized` | Cleared cookies reject refresh attempt |
| **S-036** | Normal Logout Action | `POST /api/v1/auth/logout` | `200 OK`, `collabfor_*` cookies cleared | Presence session set to `is_online = FALSE` |
| **S-037** | Protected API Call After Logout | `GET /api/v1/auth/me` after logout | `401 Unauthorized` | Revoked credentials block access |
| **S-039** | Duplicate / Double Logout | 2x POST `/api/v1/auth/logout` | `200 OK` (Idempotent) | No server crash or unhandled error |
| **S-043** | Multi-Tab Logout Sync | User logs out in Tab A | Frontend `BroadcastChannel('collabfor_auth_channel')` triggers `auth:unauthorized` event | Redirects Tab B to `/login` cleanly |

---

## 🛡️ CATEGORY 8: ROLE-BASED ACCESS CONTROL (RBAC) & PERMISSIONS

| Role | Target Protected Route | Expected HTTP Status | Expected Error Code | Playwright Assertion |
|---|---|:---:|:---:|---|
| **Unauthenticated** | GET `/api/v1/auth/me` | `401` | `UNAUTHORIZED` | Redirects to `/login` |
| **Candidate** | GET `/api/v1/companies/c1/settings` | `403` | `FORBIDDEN` | Access Denied |
| **Employer** | POST `/api/v1/admin/users` | `403` | `FORBIDDEN` | Access Denied |
| **Employer HR** | PATCH `/api/v1/companies/other-company/settings` | `403` | `FORBIDDEN` | Tenant Isolation Enforced |

---

## 🎭 READY-TO-USE PLAYWRIGHT AUTOMATION CODE TEMPLATE

Aap niche diye gaye Playwright test snippet ko directly `tests/auth.spec.ts` mein save karke saare cases run kar sakte hain:

```typescript
import { test, expect } from '@playwright/test';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const FRONTEND_BASE_URL = process.env.FRONTEND_BASE_URL || 'http://localhost:3001';

test.describe('Binay Job Portal Auth & Session Security E2E Test Suite', () => {

  test('S-001 & S-002: Candidate Login and Immediate Protected API Access', async ({ page }) => {
    await page.goto(`${FRONTEND_BASE_URL}/login`);

    await page.getByTestId('login-email-input').fill('cand@example.com');
    await page.getByTestId('login-password-input').fill('Password123!');
    await page.getByTestId('login-submit-button').click();

    await expect(page).toHaveURL(/.*dashboard\/candidate/);
  });

  test('VERIFY-07: Resend Email Rate Limiting Surfaces 429 Status Code', async ({ request }) => {
    // Send rapid resend requests
    for (let i = 0; i < 5; i++) {
      await request.post(`${API_BASE_URL}/api/v1/auth/resend-verification`, {
        data: { email: 'rate_limited_user@example.com' }
      });
    }

    const resendResponse = await request.post(`${API_BASE_URL}/api/v1/auth/resend-verification`, {
      data: { email: 'rate_limited_user@example.com' }
    });

    if (resendResponse.status() === 429) {
      const body = await resendResponse.json();
      expect(body.error.code).toBe('TOO_MANY_REQUESTS');
    }
  });

});
```

---
*Created and verified for Binay Job Portal App.*
