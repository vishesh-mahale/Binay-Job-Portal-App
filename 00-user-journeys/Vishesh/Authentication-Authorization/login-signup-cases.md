Haan. **Login/signup ko sirf “success hua ya error aaya” ke level par test nahi karna chahiye.** Production job portal me auth flow ke liye ek proper **state + API response + frontend behavior matrix** banana chahiye.

Tumhare case me **Candidate / Employer / HR / Admin**, email-password + Google OAuth, email verification, forgot/reset password jaise flows hain, isliye kaafi cases cover honge.

Main tumhe ek practical checklist de raha hoon jo tum QA/testing ke liye directly use kar sakte ho.

---

# 1. Auth ke major flows

Minimum ye flows cover karo:

```text
SIGNUP
  ├─ Email/password signup
  ├─ Duplicate email
  ├─ Invalid email
  ├─ Weak password
  ├─ Password mismatch
  ├─ Email verification
  └─ Resend verification

LOGIN
  ├─ Valid credentials
  ├─ Wrong password
  ├─ Unknown email
  ├─ Unverified email
  ├─ Disabled/blocked account
  ├─ Wrong role/access
  └─ Rate limiting / too many attempts

GOOGLE LOGIN
  ├─ New Google user
  ├─ Existing account
  ├─ Existing email/password account
  ├─ Cancelled OAuth
  └─ Invalid/expired OAuth token

PASSWORD
  ├─ Change password
  ├─ Forgot password
  ├─ Reset password
  ├─ Expired reset token
  ├─ Invalid reset token
  ├─ Already-used reset token
  └─ New password validation

SESSION
  ├─ Logout
  ├─ Access protected API
  ├─ Expired access token
  ├─ Invalid token
  ├─ Refresh token
  ├─ Logout + refresh
  └─ Multiple devices/sessions

ACCOUNT
  ├─ Profile
  ├─ Email change
  ├─ Account disabled
  └─ Account deletion
```

---

# 2. Signup — cases

Suppose:

```http
POST /auth/signup
```

### A. Successful signup

```json
{
  "email": "user@example.com",
  "password": "StrongPassword@123",
  "role": "candidate"
}
```

Possible:

```http
201 Created
```

Response:

```json
{
  "message": "Account created successfully",
  "user": {
    "id": "...",
    "email": "user@example.com"
  },
  "emailVerificationRequired": true
}
```

Frontend:

```text
Signup successful
       ↓
"Please verify your email"
       ↓
Verification email
```

---

### B. Email already exists

```http
409 Conflict
```

Example:

```json
{
  "code": "EMAIL_ALREADY_EXISTS",
  "message": "An account with this email already exists"
}
```

Frontend should **not** simply show generic "Signup failed".

It should tell user what action is possible:

```text
This email is already registered.
Please login or reset your password.
```

---

### C. Invalid email

```http
400 Bad Request
```

```json
{
  "code": "INVALID_EMAIL",
  "message": "Please enter a valid email address"
}
```

---

### D. Weak password

```http
400 Bad Request
```

```json
{
  "code": "WEAK_PASSWORD",
  "message": "Password does not meet security requirements"
}
```

Frontend ideally validates this before API call too.

---

### E. Missing fields

```http
400 Bad Request
```

Example:

```json
{
  "code": "VALIDATION_ERROR",
  "message": "Validation failed",
  "fields": {
    "email": "Email is required",
    "password": "Password is required"
  }
}
```

---

# 3. Email verification

Signup ke baad ye separate flow hai.

```text
Signup
 ↓
verification email
 ↓
user clicks link
 ↓
GET/POST /auth/verify-email
```

Cases:

### Valid token

```http
200 OK
```

Account:

```text
email_verified = true
```

---

### Invalid token

```http
400 Bad Request
```

```json
{
  "code": "INVALID_VERIFICATION_TOKEN"
}
```

---

### Expired token

```http
410 Gone
```

or `400`, depending on your API contract.

```json
{
  "code": "VERIFICATION_TOKEN_EXPIRED"
}
```

Frontend:

```text
Verification link expired.

[Resend verification email]
```

---

### Already verified

Should be handled gracefully:

```http
200 OK
```

or

```http
409 Conflict
```

But I recommend making this **idempotent** from UX perspective.

---

# 4. Login — most important testing

```http
POST /auth/login
```

## Case 1 — Correct email + password

```http
200 OK
```

Response might contain:

```json
{
  "user": {
    "id": "...",
    "role": "candidate"
  },
  "accessToken": "...",
  "refreshToken": "..."
}
```

Then frontend:

```text
login
 ↓
store/receive session
 ↓
load current user
 ↓
redirect according to role
```

---

## Case 2 — Wrong password

```http
401 Unauthorized
```

```json
{
  "code": "INVALID_CREDENTIALS",
  "message": "Invalid email or password"
}
```

**Important:** Don't reveal:

```text
Email exists but password is wrong
```

because that can enable account/email enumeration.

---

## Case 3 — Email doesn't exist

Prefer the same:

```http
401 Unauthorized
```

```json
{
  "code": "INVALID_CREDENTIALS",
  "message": "Invalid email or password"
}
```

Don't expose:

```text
Email does not exist
```

---

# 5. Unverified email login

This is a very important case.

User:

```text
Signup
 ↓
doesn't verify email
 ↓
tries login
```

Your system needs a deliberate decision.

For example:

```http
403 Forbidden
```

```json
{
  "code": "EMAIL_NOT_VERIFIED",
  "message": "Please verify your email before logging in"
}
```

Frontend:

```text
Email not verified.

[Resend verification email]
```

---

# 6. Disabled / blocked account

Suppose admin disables candidate/employer.

Login attempt:

```http
403 Forbidden
```

```json
{
  "code": "ACCOUNT_DISABLED",
  "message": "Your account has been disabled"
}
```

Frontend should show appropriate message rather than:

```text
Invalid password
```

---

# 7. Google OAuth

Tumhare architecture me ye bhi separately test hona chahiye.

### New Google user

```text
Google
 ↓
OAuth callback
 ↓
No existing user
 ↓
Create account
```

---

### Existing Google user

```text
Google login
 ↓
existing user
 ↓
login
```

---

### Google email already exists with password account

Example:

```text
user@gmail.com
```

already has:

```text
email/password account
```

Then Google login attempts to use same email.

**Is case ka account-linking behavior explicitly decide karo.**

Don't blindly create another account.

Possible response:

```json
{
  "code": "ACCOUNT_ALREADY_EXISTS",
  "message": "An account already exists with this email"
}
```

Then provide account-linking/login path according to your auth design.

---

# 8. Forgot password

```http
POST /auth/forgot-password
```

This flow has an important security requirement.

User enters:

```text
abc@gmail.com
```

### Existing email

System sends reset email.

But response should preferably be:

```http
200 OK
```

```json
{
  "message": "If an account exists with this email, a password reset link has been sent."
}
```

### Non-existing email

**Same response.**

This prevents attackers from checking which emails have accounts.

So:

```text
existing email → same response
non-existing email → same response
```

Very important.

---

# 9. Reset password

User clicks email:

```text
/reset-password?token=XYZ
```

### Valid token

```http
200 OK
```

Password changed.

---

### Expired token

```http
400/410
```

```json
{
  "code": "RESET_TOKEN_EXPIRED"
}
```

Frontend:

```text
This reset link has expired.

[Request new reset link]
```

---

### Invalid token

```json
{
  "code": "INVALID_RESET_TOKEN"
}
```

---

### Already used token

```json
{
  "code": "RESET_TOKEN_ALREADY_USED"
}
```

---

# 10. Change password

Different from forgot password.

### Change password

User is already logged in:

```http
POST /auth/change-password
Authorization: Bearer ...
```

Request:

```json
{
  "currentPassword": "Old@123",
  "newPassword": "New@456"
}
```

### Success

```http
200 OK
```

---

### Wrong current password

```http
401 Unauthorized
```

or a dedicated `INVALID_CURRENT_PASSWORD`.

---

### Weak new password

```http
400 Bad Request
```

---

### Same old/new password

```http
400 Bad Request
```

```json
{
  "code": "PASSWORD_REUSE"
}
```

---

# 11. What happens to sessions after password change/reset?

**This is one of the cases people often forget.**

Suppose:

```text
Laptop → logged in
Mobile → logged in
```

Then password is changed.

You need a deliberate security policy:

```text
Password changed
       ↓
invalidate existing sessions?
       ↓
yes/no
```

For a production portal, I'd generally want **password reset/change to invalidate other sessions**, with the current session behavior explicitly defined.

Test:

```text
Login device A
Login device B
Change password on A
Try API from B
```

Expected behavior must be documented.

---

# 12. Logout

```http
POST /auth/logout
```

### Normal logout

```http
204 No Content
```

or:

```http
200 OK
```

After logout:

```text
access protected API
```

should fail.

---

### Logout twice

This should ideally be **idempotent**.

Meaning:

```text
logout
logout again
```

shouldn't cause weird frontend errors.

---

# 13. Access token expiry

Very important.

```text
Access token expired
       ↓
API
       ↓
401 Unauthorized
```

Frontend:

```text
401
 ↓
try refresh token
 ↓
new access token
 ↓
retry original request
```

But only if refresh succeeds.

---

# 14. Refresh token cases

```http
POST /auth/refresh
```

Test:

### Valid refresh token

```http
200 OK
```

New access token.

### Expired refresh token

```http
401 Unauthorized
```

Frontend:

```text
Refresh failed
 ↓
clear session
 ↓
redirect login
```

### Invalid refresh token

Same idea.

### Refresh token after logout

Should fail if logout invalidates the refresh session/token.

---

# 15. Protected API without token

Example:

```http
GET /candidate/profile
```

without Authorization.

Expected:

```http
401 Unauthorized
```

Not:

```http
403
```

Generally:

```text
401 = authentication missing/invalid
403 = authenticated but not allowed
```

---

# 16. Role-based access

Tumhare portal me ye **bahut important** hai.

Roles:

```text
candidate
employer
hr
admin
```

Example:

Candidate calls:

```http
POST /admin/users
```

Authentication successful hai, but permission nahi.

Expected:

```http
403 Forbidden
```

Example:

```json
{
  "code": "FORBIDDEN",
  "message": "You do not have permission to perform this action"
}
```

---

# 17. Employer vs HR cases

Tumhare architecture me employer/company-head aur HR sub-users hain, so additionally:

```text
Employer
 ├── Company
 └── HR users
```

Test:

### HR accesses another company's data

```text
HR A
 ↓
Company B resource
```

Should fail.

Usually:

```http
403
```

or sometimes `404` deliberately, to avoid resource enumeration.

### HR tries employer-only operation

Should be denied.

### Employer disables HR

HR's subsequent authenticated requests need to follow your account/session policy.

---

# 18. Rate limiting

Ye bhi auth testing ka part hai.

Example:

```text
10 failed logins
 ↓
rate limit
```

Possible:

```http
429 Too Many Requests
```

```json
{
  "code": "RATE_LIMITED",
  "message": "Too many attempts. Please try again later."
}
```

Test:

* repeated login failures
* forgot password spam
* verification resend spam
* reset password requests
* OAuth callback abuse

---

# 19. Backend unexpected errors

Frontend ko sirf known auth errors nahi handle karne chahiye.

Possible:

```http
500 Internal Server Error
```

or:

```http
503 Service Unavailable
```

Frontend:

```text
Something went wrong. Please try again.
```

**Never expose stack trace/database errors to user.**

---

# 20. Network failures

API response hi nahi aaya:

```text
Network error
timeout
connection reset
backend unavailable
```

Frontend should handle:

```text
Unable to connect. Please check your internet connection and try again.
```

---

# 21. Ek important master matrix

Tum testing ke liye ye matrix bana sakte ho:

| Flow            | Case                    |    Expected HTTP |
| --------------- | ----------------------- | ---------------: |
| Signup          | Success                 |              201 |
| Signup          | Invalid input           |              400 |
| Signup          | Duplicate email         |              409 |
| Signup          | Weak password           |              400 |
| Verify          | Valid token             |              200 |
| Verify          | Invalid token           |              400 |
| Verify          | Expired token           |          400/410 |
| Login           | Success                 |              200 |
| Login           | Wrong credentials       |              401 |
| Login           | Email unverified        |              403 |
| Login           | Account disabled        |              403 |
| Login           | Rate limited            |              429 |
| Google          | Success                 |              200 |
| Google          | OAuth failure           |              4xx |
| Forgot password | Any email               |              200 |
| Reset password  | Valid token             |              200 |
| Reset password  | Invalid token           |              400 |
| Reset password  | Expired token           |          400/410 |
| Reset password  | Used token              |              400 |
| Change password | Success                 |              200 |
| Change password | Wrong current password  |          401/400 |
| Change password | Weak new password       |              400 |
| Logout          | Success                 |          204/200 |
| Protected API   | No token                |              401 |
| Protected API   | Expired token           |              401 |
| Protected API   | Invalid token           |              401 |
| Role API        | Insufficient permission |              403 |
| Refresh         | Valid token             |              200 |
| Refresh         | Invalid/expired token   |              401 |
| Any             | Rate limited            |              429 |
| Any             | Server failure          |          500/503 |
| Any             | Network failure         | No HTTP response |

---

# 22. Sirf API status code test mat karna

Har test case me **4 cheezein** check karo:

```text
1. HTTP status
2. Response body/code
3. DB/session state
4. Frontend behavior
```

Example:

### Forgot password

Not enough:

```text
POST /forgot-password → 200 ✅
```

Also check:

```text
✓ response doesn't reveal whether email exists
✓ reset token generated
✓ token expiry correct
✓ email sent
✓ old token behavior
✓ rate limit
✓ frontend message
```

---

# 23. Tumhare job portal ke liye recommended auth test groups

Main tumhare project me testing ko is tarah organize karta:

```text
AUTH-01 Signup
AUTH-02 Email Verification
AUTH-03 Login
AUTH-04 Google OAuth
AUTH-05 Forgot Password
AUTH-06 Reset Password
AUTH-07 Change Password
AUTH-08 Logout
AUTH-09 Access Token
AUTH-10 Refresh Token
AUTH-11 Role/Permission
AUTH-12 Account Status
AUTH-13 Rate Limiting
AUTH-14 Session/Multiple Devices
AUTH-15 Error Handling
```

Aur har group ke andar:

```text
Happy path
Validation failure
Authentication failure
Authorization failure
Expired state
Invalid state
Duplicate/replay
Rate limit
Network/server failure
```

---

## Sabse important

Tum abhi **manual login/signup flow test kar rahe ho**, to random testing mat karo. Pehle ek **Auth Test Matrix** bana lo, phir uske according systematically frontend + NestJS API + Supabase Auth/session behavior verify karo.

Agar tum mujhe **current NestJS auth controller/service/DTOs + frontend login/signup code** de do, to main tumhare **actual implemented APIs** ke according exact matrix bana sakta hoon:

```text
API
→ request
→ possible response
→ HTTP code
→ frontend ko kya karna chahiye
→ DB/Auth state
→ test case
→ expected result
```

Isse ye bhi pata chal jayega ki **tumhare current implementation me kaunse auth cases missing hain**, instead of generic checklist.
