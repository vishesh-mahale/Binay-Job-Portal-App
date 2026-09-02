# Next.js Web Frontend — Binay Job Portal

**Directory Structure:**
- Application Source: `03-nextjs-web/03-nextjs-web-app/`
- Documentation, ADRs & Design Plans: `03-nextjs-web/`

---

## 1. Project Structure

```text
03-nextjs-web/03-nextjs-web-app/
├── .env.example              # Environment variables template
├── .env.local                # Local environment overrides
├── .gitignore                # Package-level git ignore rules
├── jest.config.js            # Jest test configuration (ts-jest, JSDOM, setupFilesAfterEnv)
├── jest.setup.ts             # Jest DOM matchers setup (@testing-library/jest-dom)
├── next.config.ts            # Next.js config (fail-closed API URL validation, rewrites)
├── package.json              # Dependencies and lifecycle scripts
├── postcss.config.mjs        # PostCSS configuration (Tailwind CSS 3.4)
├── tailwind.config.ts        # Tailwind CSS design tokens and theme
├── tsconfig.json             # Strict TypeScript compiler options
└── src/
    ├── middleware.ts         # Protected route edge middleware (/dashboard/:path*)
    ├── middleware.spec.ts    # Edge middleware unit test suite (307 redirect & pass-through)
    ├── app/
    │   ├── globals.css       # Global styles and Tailwind directives
    │   ├── layout.tsx        # Root HTML shell layout (AuthProvider wrapper)
    │   ├── page.tsx          # Landing / Entry portal page
    │   ├── login/            # Sign In UI page & validation (safe redirectTo & hash error handling)
    │   ├── signup/           # Register UI page & validation (instant onboarding)
    │   ├── verify-email/     # Email verification pending screen
    │   ├── unauthorized/     # 401 Unauthorized status screen
    │   ├── forbidden/        # 403 Access Denied status screen
    │   ├── dashboard/        # Role-based dashboard router & entry portals
    │   │   ├── page.tsx      # Central role router
    │   │   ├── candidate/    # Candidate role entry portal
    │   │   ├── employer/     # Employer & HR role entry portal
    │   │   └── admin/        # Admin role entry portal
    │   └── auth-pages.spec.tsx # Jest unit tests for Auth pages, UserSummary & safe redirect
    ├── context/
    │   └── auth-context.tsx  # AuthProvider context hook (user, login, signup, logout)
    ├── components/
    │   ├── role-guard.tsx    # Client-side role authorization guard (UX helper)
    │   ├── role-guard.spec.tsx # RoleGuard unit test suite (role routing & effect stability)
    │   └── ui/               # Reusable design system primitives
    │       ├── alert.spec.tsx
    │       ├── alert.tsx
    │       ├── badge.tsx
    │       ├── button.spec.tsx
    │       ├── button.tsx
    │       ├── card.tsx
    │       ├── input.tsx
    │       ├── label.tsx
    │       └── spinner.tsx
    ├── lib/
    │   ├── api-client.spec.ts # API client unit and 401 retry tests
    │   ├── api-client.ts      # Centralized typed fetch client
    │   ├── errors.spec.ts     # Error mapping test suite
    │   ├── errors.ts          # Standard API error envelope & mapping
    │   └── utils.ts           # Class merging & safe redirect URL helper (getSafeRedirectUrl)
    └── types/
        ├── api.ts             # Canonical API response envelopes
        └── auth.ts            # Authentication models & UserSummary (reconciled with NestJS /auth/me)
```

---

## 2. Environment Variables & Security Policy

| Variable | Required | Default (Dev) | Fail-Closed Policy |
|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | Yes (in preprod/prod) | `http://localhost:3000` | In `production` or `preprod`, a missing `NEXT_PUBLIC_API_URL` throws an explicit configuration error at build/startup. Localhost fallback is strictly forbidden outside development. |

### Zero-Trust & Security Boundaries
- **Server Enforcement Authority:** Next.js Edge Middleware (`middleware.ts`) and `RoleGuard` are UX and access-routing helpers only. Cryptographic JWT verification, session validity, database checks, and role authorization policies remain strictly enforced server-side by NestJS `AuthGuard`.
- **Public Signup & Role Onboarding:** Public signup accepts email, password, and `register_as` (`'candidate' | 'employer'`). NestJS validates `register_as` and authoritatively provisions `public.users.role`. Client metadata or `app_metadata` role claims are strictly ignored/forbidden. Public signup as `hr` or `admin` is rejected with HTTP 400 Bad Request. HR is invitation-based only; Admin is controlled provisioning only.
- **Email Verification Callback Slice (COMPLETE):** Implemented on Next.js `/verify-email` page adhering 100% strictly to native Supabase Auth callback parsing rules. Success occurs ONLY when `type === 'signup'` AND a non-empty `access_token` is present AND no error/error_code parameters exist. Tokens are parsed in-memory only and immediately scrubbed via `history.replaceState`. Real inbox email verification is COMPLETE and empirically verified via Brevo Custom SMTP (`noreply@collabfor.com`) and Cloudflare DNS (`collabfor.com`).
- **Explicit `AUTH_AUTO_CONFIRM_EMAIL` Policy:** When `AUTH_AUTO_CONFIRM_EMAIL=false`, accounts are created in `pending_verification` status with zero session cookies. Clicking the confirmation link sent via Brevo SMTP confirms the email in `auth.users.email_confirmed_at` and enables post-confirmation login which reconciles `public.users.status` to `active`.
- **Safe Open Redirect Protection:** `getSafeRedirectUrl()` validates `redirectTo` query parameters, restricting navigation to same-origin relative paths starting with `/`.
- **No Token Storage in Web Storage:** Access and refresh tokens are managed exclusively via HttpOnly cookies (`binay_access_token`, `binay_refresh_token`, `binay_presence_session`) issued by NestJS.

---

## 3. Real Email Verification & Custom SMTP (COMPLETE)

* **Domain & DNS:** `collabfor.com` purchased on Cloudflare; SPF, DKIM, DMARC, and `auth` branded subdomain authenticated.
* **Brevo Custom SMTP:** `smtp-relay.brevo.com`:587 connected to Supabase Auth. Senders verified as `noreply@collabfor.com`.
* **Supabase Auth Config:** Confirm email = `ON`, Site URL = `http://localhost:3001`, Redirect URL = `http://localhost:3001/verify-email`.
* **Empirical DB Evidence:**
  - `auth.users.email_confirmed_at`: `2026-09-02T08:42:13.615Z` (Verified via Brevo email link click).
  - `public.users.status`: `pending_verification` (signup) $\rightarrow$ `active` (post-confirmation login).

### 3.1 Future Production UI Hardening Backlog (Deferred for Motive API Testing)

During future production UI development, the following 11 mandatory UX requirements must be strictly implemented and verified:
1. **Zero Visible Flash:** Email link click must have zero visible flash of Home Page DOM.
2. **Minimal Loading Shell:** Root callback hash (`access_token`, `error`, `error_code`, `error_description`) detection renders a minimal full-screen loading shell.
3. **Safe Effect Redirect:** Redirect logic must reside in a safe effect/blocking redirect strategy (never inline render).
4. **Deterministic `/verify-email` State:** Callback state must be deterministic (valid signup token $\rightarrow$ success, expired/consumed token $\rightarrow$ error, no hash $\rightarrow$ pending).
5. **No Card Flips:** Zero intermediate pending or opposite card flash between success/error states.
6. **SSR/Hydration Safety:** Prevent SSR/hydration mismatches and browser console warnings.
7. **Immediate Hash Scrubbing:** URL hash immediately scrubbed via `history.replaceState`.
8. **Token Isolation:** Tokens strictly forbidden from being logged, stored in `localStorage`/`sessionStorage`/analytics/query string, or forwarded to custom APIs.
9. **Resilient Browser Tests:** Add automated tests covering slow network conditions and 2nd-click expired-link browser flows.
10. **Precise UX Documentation:** Document as "flash minimized" unless proven zero-flash by real multi-browser automated tests.
11. **Supabase Auth Authority:** Supabase Auth remains the sole authority for confirmation tokens and verification state; custom token/resend flows forbidden.

---

## 4. Verification Status

### Frontend Web App Verification (03-nextjs-web/03-nextjs-web-app)

| Gate | Status | Output / Evidence |
|---|---|---|
| **TypeScript Strict Check** | `PASS` | `node ./node_modules/typescript/bin/tsc --noEmit` -> Exit code `0` (0 errors) |
| **Frontend Jest Test Suites** | `PASS` | `npm.cmd test -- --runInBand` -> **7 suites / 45 tests passed** (Exit code `0`) |
| **Next.js Production Build** | `PASS` | `npm.cmd run build` -> Exit code `0` (auth and dashboard routes added). |
| **Backend Jest Test Suites** | `PASS` | `npm.cmd test -- --runInBand` -> **33 suites / 217 tests passed** (Exit code `0`) |

---

## 5. Live Auth Integration Flow Verification

**Batch 2 Execution Result:** `PASS 100%` (`node scripts/batch2-real-auth-flow-test.cjs`)
**Batch 3 Execution Result:** `PASS 100%` (`node scripts/batch3-real-auth-flow-test.cjs` — Candidate & Employer signups return HTTP 201 active, `/auth/me` roles verified as `"candidate"` and `"employer"`, forbidden signups `admin`/`hr` rejected with HTTP 400).

| Step | Target Endpoint | Executed Action | Observed Result |
|---|---|---|---|
| **1. Candidate Signup** | `POST /api/v1/auth/signup` | Candidate registration (`register_as: 'candidate'`) | `Status 201`. User created; `public.users.role` provisioned as `'candidate'`. |
| **2. Candidate Role Check** | `GET /api/v1/auth/me` | Fetch candidate profile post-login | `Status 200`. Returned `role: 'candidate'`. Frontend redirects to `/dashboard/candidate`. |
| **3. Employer Signup** | `POST /api/v1/auth/signup` | Employer registration (`register_as: 'employer'`) | `Status 201`. User created; `public.users.role` provisioned as `'employer'`. |
| **4. Employer Role Check** | `GET /api/v1/auth/me` | Fetch employer profile post-login | `Status 200`. Returned `role: 'employer'`. Frontend redirects to `/dashboard/employer`. |
| **5. Role Rejection** | `POST /api/v1/auth/signup` | Public signup as `register_as: 'admin'` or `'hr'` | `Status 400 Bad Request`. Forbidden role signup rejected. |

