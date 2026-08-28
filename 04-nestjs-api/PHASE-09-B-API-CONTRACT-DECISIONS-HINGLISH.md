# Phase 09-B — API Contract Freeze Decisions

Status: `D1-D8 DECISIONS RESOLVED — API CONTRACT DETAILS REVIEW PENDING`

Ye sheet `PHASE-09-B-API-CONTRACT-PROPOSAL.md` ke open decisions ko human approval ke liye record karti hai. Jab tak har decision ka option aur rationale approve nahi hota, proposed routes ko public/frozen contract na maana jaye.

## D1 — Auth bootstrap boundary — APPROVED

Kya `POST /api/v1/auth/bootstrap` NestJS endpoint rahega, ya Supabase callback/trigger ke bahar hi account bootstrap complete hoga?

Options ko endpoint responsibility ke roop me samjho: (A) endpoint nahi, (B) endpoint sirf trigger-created row read/summary return kare. NestJS `public.users` row create nahi karega; existing `handle_new_user()` trigger ka ownership bina approved change ke replace nahi hoga.

**Decision:** Approved — NestJS auth signup/login/verification boundary own karega aur Supabase Auth provider ko call karega. `auth.users` insert ke baad `handle_new_user()` trigger `public.users` row banayega. NestJS kabhi `public.users` row manually create nahi karega. Separate `POST /auth/bootstrap` endpoint nahi banega; successful signup/verification ke baad safe account summary `GET /api/v1/auth/me` se milegi. Auth-related outbox event tabhi hoga jab approved contract exist kare.

## D2 — Company creation eligibility — APPROVED

Kaun company create kar sakta hai?

- Any authenticated user
- Approved employer role only
- Platform-admin approved account only

**Decision:** Approved — active authenticated `employer` user company register karega aur wahi `companies.owner_id` banega. Platform `admin` exceptional administrative flow me company create kar sakta hai. `candidate` company create nahi kar sakta. `owner_id` hamesha verified JWT `sub` se server derive hoga; request body se accept nahi hoga.

## D3 — Membership invitation model — APPROVED (current scope)

Baseline me invitation token/table nahi hai.

- Existing user ke inactive membership row ka self-accept
- New invitation table/token ke saath external-email flow (approved migration + contract required)

Option A sirf existing signed-up user ke liye possible hai, kyunki `company_members.user_id` `NOT NULL` hai. Option B external email ke liye nayi invitation table/token migration maangega. Jab tak decide na ho, `MEMBERSHIP-ACCEPT` implement nahi hoga.

Accept (pending/inactive first membership) aur rejoin (previously deactivated membership) alag flows hain; unhe ek hi authorization rule na maana jaye.

**Decision:** Approved for current scope — केवल registered user को existing `company_members` inactive row के माध्यम से add/invite किया जाएगा; वही user login के बाद अपना membership accept करेगा. Unregistered email invitation current scope में नहीं है. Future external invitation के लिए अलग invitation table/token, expiry, email/outbox contract और reviewed migration आवश्यक होगी. Accept और rejoin अलग flows रहेंगे.

## D4 — Organization API shape — APPROVED

Branch, department aur team ke liye:

- Separate nested REST resources
- One organization-admin command endpoint

**Decision:** Approved — branches, departments और teams के लिए अलग nested REST resources होंगे. तीनों existing SQL tables, fields और relationship rules के अनुसार अलग controllers/DTOs रखेंगे; combined organization command endpoint नहीं बनेगा.

## D5 — Presence session revoke scope — APPROVED

`user_sessions` realtime-presence table hai, Supabase Auth session table nahi.

- Sirf ek owned presence row deactivate/revoke
- User ki sabhi presence rows revoke

Supabase Auth token revoke ko is decision me automatically assume nahi kiya jayega.

**Decision:** Approved — normal logout/revoke केवल current authenticated presence session row पर लागू होगा. दूसरे devices की presence sessions प्रभावित नहीं होंगी. “Logout all devices” current scope में अलग capability नहीं है. यह Supabase Auth token revoke से अलग है; उसका निर्णय D7 में रहेगा.

## D6 — Owner/last-admin protection and rejoin — APPROVED

Confirm karo:

- Sole owner/last admin leave ya deactivate se pehle transfer mandatory hoga?
- Rejoin self-service hoga ya owner/admin approval chahiye?
- Rejoin par original `joined_at` preserve hoga ya update?

**Decision:** Approved — sole active owner/last admin leave या deactivate नहीं कर सकता; पहले ownership transfer या company deactivation जरूरी है. Department-head, team-lead और manager references पहले reassign होंगे. Previously associated user rejoin request कर सकता है, लेकिन membership activation owner/admin approval के बाद होगी. Existing `company_members` row ही reactivate होगी; duplicate row नहीं बनेगी. Original `joined_at` audit history के लिए preserve होगा और `updated_at` बदलेगा. Owner user account suspend/deactivate/delete करने से पहले ownership transfer guard अनिवार्य है.

## D8 — Ownership transfer — APPROVED (single-owner model)

Kya company owner ownership transfer kar sakta hai? Agar haan, to target user eligibility, approval, audit/history aur last-owner protection kya hoga? Baseline me dedicated transfer endpoint/command ka final contract nahi hai.

**Decision:** Approved — current scope में हर company का एक primary owner रहेगा, जैसा `companies.owner_id` में defined है. दूसरा employer user केवल active company member/authorized employer हो सकता है; co-owner model अभी नहीं होगा. Ownership transfer केवल current owner से eligible active company member को होगा, और sole owner leave/deactivate से पहले transfer या company deactivation अनिवार्य रहेगा. Transfer business row और audit/history के साथ एक atomic NestJS transaction में होगा.

## D7 — Token-level Auth revocation — APPROVED (current scope)

Kya presence-row handling ke alawa Supabase Auth token/session revoke bhi chahiye?

Agar haan, provider call DB transaction ke baad hoga; DB transaction ke andar external call nahi hoga.

**Decision:** Approved — normal logout में NestJS current presence session बंद करेगा और `Set-Cookie` से Secure, HttpOnly auth cookie clear करेगा. हर logout पर अलग Supabase token-revoke call नहीं होगा. Password reset, account suspension या security incident के लिए future में अलग approved AuthProvider revoke flow बनाया जा सकता है; वह DB transaction के बाहर चलेगा.

## Freeze gate

Sabhi D1–D8 approve hone ke baad:

1. Proposal aur API catalog update honge.
2. Exact paths, actors, DTOs, errors aur client boundary freeze honge.
3. Independent review hoga.
4. Tabhi controller implementation start hogi.

**Current status: NOT READY FOR API CODING.**
