# User Journey: Signup & Email Verification

## Step 1: Initial Signup Request

**API Endpoint:** `POST {{baseUrl}}/api/v1/auth/signup`

### API Response
```json
{
    "status": "pending_verification",
    "user_id": "0800da27-8b1b-4e26-b3a9-9b6fabab2059"
}
```

### Database Verification (Before Verification)

#### 1. Query: `select * from auth.users;`

| Column Name | Value |
| :--- | :--- |
| `instance_id` | `00000000-0000-0000-0000-000000000000` |
| `id` | `0800da27-8b1b-4e26-b3a9-9b6fabab2059` |
| `aud` | `authenticated` |
| `role` | `authenticated` |
| `email` | `visansiddh@gmail.com` |
| `encrypted_password` | `$2a$10$ZxEGbMIgcUiwptrkpT7RkOD2Btk3kwok749hT9A4Gktgh1H5Iuocm` |
| `email_confirmed_at` | `null` |
| `invited_at` | `null` |
| `confirmation_token` | `6018685f931811bc80d0ac86b469b3fcb59374521979210e884894ee` |
| `confirmation_sent_at` | `2026-09-16 04:31:10.960135+00` |
| `recovery_token` | *(blank)* |
| `recovery_sent_at` | `null` |
| `email_change_token_new` | *(blank)* |
| `email_change` | *(blank)* |
| `email_change_sent_at` | `null` |
| `last_sign_in_at` | `null` |
| `raw_app_meta_data` | `{"provider":"email","providers":["email"],"application_role":"candidate"}` |
| `raw_user_meta_data` | `{"sub":"0800da27-8b1b-4e26-b3a9-9b6fabab2059","email":"visansiddh@gmail.com","email_verified":false,"phone_verified":false}` |
| `is_super_admin` | `null` |
| `created_at` | `2026-09-16 04:31:10.907495+00` |
| `updated_at` | `2026-09-16 04:31:12.626372+00` |
| `phone` | `null` |
| `phone_confirmed_at` | `null` |
| `phone_change` | *(blank)* |
| `phone_change_token` | *(blank)* |
| `phone_change_sent_at` | `null` |
| `confirmed_at` | `null` |
| `email_change_token_current` | *(blank)* |
| `email_change_confirm_status` | `0` |
| `banned_until` | `null` |
| `reauthentication_token` | *(blank)* |
| `reauthentication_sent_at` | `null` |
| `is_sso_user` | `false` |
| `deleted_at` | `null` |
| `is_anonymous` | `false` |

#### 2. Query: `select * from public.users;`

| Column Name | Value |
| :--- | :--- |
| `id` | `0800da27-8b1b-4e26-b3a9-9b6fabab2059` |
| `email` | `visansiddh@gmail.com` |
| `first_name` | `visansiddh` |
| `middle_name` | `null` |
| `last_name` | *(blank)* |
| `display_name` | `visansiddh` |
| `phone` | `null` |
| `avatar_path` | `null` |
| `role` | `candidate` |
| `status` | `pending_verification` |
| `last_password_changed_at` | `null` |
| `locked_until` | `null` |
| `deleted_at` | `null` |
| `deleted_reason` | `null` |
| `created_at` | `2026-09-16 04:31:10.904583+00` |
| `updated_at` | `2026-09-16 04:31:12.71217+00` |

---

## Step 2: Delay & Duplicate Signup Attempt

kafi time tk mail ki link click nhi kri 

and phir se postman se same req bheji to below resp aaya

```json
{
    "status": "pending_verification",
    "user_id": "d3aa2ac3-184d-42ac-a4e5-785c3c30e5f6"
}
```

2nd mail aaya mujhe

---

## Step 3: Clicking Verification Links

### Attempt A: 1st Mail Link (Expired Link)
uske baad 1st mail me aayi hui link pr click kiya to 

```text
http://localhost:3001/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired&sb=
```

Email link is invalid or has expired ye wala page aaya

### Attempt B: 2nd Mail Link (Valid Link)
2nd mail me aayi hui link pr click kiya

Email Verified! wala page open hua

```text
http://localhost:3001/#access_token=eyJhbGciOiJFUzI1NiIsImtpZCI6ImQ2NTQ5NDZkLTY3ZjUtNDI0Ni1iOTBkLTA1M2ZkNjRhOTNkZiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJodHRwczovL2p6cHZzc3J5b291Y3lnbnVpZmtiLnN1cGFiYXNlLmNvL2F1dGgvdjEiLCJzdWIiOiJkM2FhMmFjMy0xODRkLTQyYWMtYTRlNS03ODVjM2MzMGU1ZjYiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzg5NTM1NTc4LCJpYXQiOjE3ODk1MzE5NzgsImVtYWlsIjoidmlzYW5zaWRkaEBnbWFpbC5jb20iLCJwaG9uZSI6IiIsImFwcF9tZXRhZGF0YSI6eyJhcHBsaWNhdGlvbl9yb2xlIjoiY2FuZGlkYXRlIiwicHJvdmlkZXIiOiJlbWFpbCIsInByb3ZpZGVycyI6WyJlbWFpbCJdfSwidXNlcl9tZXRhZGF0YSI6eyJlbWFpbCI6InZpc2Fuc2lkZGhAZ21haWwuY29tIiwiZW1haWxfdmVyaWZpZWQiOnRydWUsInBob25lX3ZlcmlmaWVkIjpmYWxzZSwic3ViIjoiZDNhYTJhYzMtMTg0ZC00MmFjLWE0ZTUtNzg1YzNjMzBlNWY2In0sInJvbGUiOiJhdXRoZW50aWNhdGVkIiwiYWFsIjoiYWFsMSIsImFtciI6W3sibWV0aG9kIjoib3RwIiwidGltZXN0YW1wIjoxNzg5NTMxOTc4fV0sInNlc3Npb25faWQiOiIxNDFkNjY1My0wMjE1LTQwNjQtOWVhNC1mZGViZjgzYTJkODIiLCJpc19hbm9ueW1vdXMiOmZhbHNlfQ.8xcdyoOl4MaRbrE_a9nvwzdzqou-BDUOykBhdjYgN9tAXDpzH21wCW2ya98kD3nlxdxJ9ya8HNgcpFAjltJv-A&expires_at=1789535578&expires_in=3600&refresh_token=rb2xhidrteun&sb=&token_type=bearer&type=signup
```

---

## Step 4: Database Verification (After Verification)

### 📊 Summary of Changed Fields (Step 1 vs Step 4):
- 🟡 `email_confirmed_at`: `null` ➔ `2026-09-16 04:35:34.930638+00` (**UPDATED**)
- 🟡 `confirmation_token`: `6018685f...` ➔ *(cleared/blank)* (**UPDATED**)
- 🟡 `last_sign_in_at`: `null` ➔ `2026-09-16 04:35:34.943274+00` (**UPDATED**)
- 🟡 `raw_user_meta_data`: `"email_verified": false` ➔ `"email_verified": true` (**UPDATED**)
- 🟡 `updated_at`: `2026-09-16 04:31:12...` ➔ `2026-09-16 04:35:34.986975+00` (**UPDATED**)
- 🟡 `confirmed_at`: `null` ➔ `2026-09-16 04:35:34.930638+00` (**UPDATED**)

---

#### 1. Query: `select * from auth.users;`

| Column Name | Value | Status / Change vs Step 1 |
| :--- | :--- | :--- |
| `instance_id` | `00000000-0000-0000-0000-000000000000` | Unchanged |
| `id` | `0800da27-8b1b-4e26-b3a9-9b6fabab2059` | Unchanged |
| `aud` | `authenticated` | Unchanged |
| `role` | `authenticated` | Unchanged |
| `email` | `visansiddh@gmail.com` | Unchanged |
| `encrypted_password` | `$2a$10$ZxEGbMIgcUiwptrkpT7RkOD2Btk3kwok749hT9A4Gktgh1H5Iuocm` | Unchanged |
| `email_confirmed_at` | `2026-09-16 04:35:34.930638+00` | 🟡 **CHANGED** *(was null)* |
| `invited_at` | `null` | Unchanged |
| `confirmation_token` | *(blank)* | 🟡 **CHANGED** *(was 6018685f9318...)* |
| `confirmation_sent_at` | `2026-09-16 04:31:10.960135+00` | Unchanged |
| `recovery_token` | *(blank)* | Unchanged |
| `recovery_sent_at` | `null` | Unchanged |
| `email_change_token_new` | *(blank)* | Unchanged |
| `email_change` | *(blank)* | Unchanged |
| `email_change_sent_at` | `null` | Unchanged |
| `last_sign_in_at` | `2026-09-16 04:35:34.943274+00` | 🟡 **CHANGED** *(was null)* |
| `raw_app_meta_data` | `{"provider":"email","providers":["email"],"application_role":"candidate"}` | Unchanged |
| `raw_user_meta_data` | `{"sub":"0800da27-8b1b-4e26-b3a9-9b6fabab2059","email":"visansiddh@gmail.com","email_verified":true,"phone_verified":false}` | 🟡 **CHANGED** *(email_verified: false ➔ true)* |
| `is_super_admin` | `null` | Unchanged |
| `created_at` | `2026-09-16 04:31:10.907495+00` | Unchanged |
| `updated_at` | `2026-09-16 04:35:34.986975+00` | 🟡 **CHANGED** *(was 2026-09-16 04:31:12...)* |
| `phone` | `null` | Unchanged |
| `phone_confirmed_at` | `null` | Unchanged |
| `phone_change` | *(blank)* | Unchanged |
| `phone_change_token` | *(blank)* | Unchanged |
| `phone_change_sent_at` | `null` | Unchanged |
| `confirmed_at` | `2026-09-16 04:35:34.930638+00` | 🟡 **CHANGED** *(was null)* |
| `email_change_token_current` | *(blank)* | Unchanged |
| `email_change_confirm_status` | `0` | Unchanged |
| `banned_until` | `null` | Unchanged |
| `reauthentication_token` | *(blank)* | Unchanged |
| `reauthentication_sent_at` | `null` | Unchanged |
| `is_sso_user` | `false` | Unchanged |
| `deleted_at` | `null` | Unchanged |
| `is_anonymous` | `false` | Unchanged |

#### 2. Query: `select * from public.users;`

| Column Name | Value | Status / Change vs Step 1 |
| :--- | :--- | :--- |
| `id` | `0800da27-8b1b-4e26-b3a9-9b6fabab2059` | Unchanged |
| `email` | `visansiddh@gmail.com` | Unchanged |
| `first_name` | `visansiddh` | Unchanged |
| `middle_name` | `null` | Unchanged |
| `last_name` | *(blank)* | Unchanged |
| `display_name` | `visansiddh` | Unchanged |
| `phone` | `null` | Unchanged |
| `avatar_path` | `null` | Unchanged |
| `role` | `candidate` | Unchanged |
| `status` | `pending_verification` | Unchanged |
| `last_password_changed_at` | `null` | Unchanged |
| `locked_until` | `null` | Unchanged |
| `deleted_at` | `null` | Unchanged |
| `deleted_reason` | `null` | Unchanged |
| `created_at` | `2026-09-16 04:31:10.904583+00` | Unchanged |
| `updated_at` | `2026-09-16 04:31:12.71217+00` | Unchanged |

---

## Step 5: Post Verification Action

uske baad Signup page pr gye


