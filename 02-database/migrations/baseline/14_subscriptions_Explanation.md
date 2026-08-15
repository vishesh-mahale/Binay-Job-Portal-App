# 14 Subscriptions and Billing — Explanation (Hinglish)

## 1. Is file ka scope

`14_subscriptions.sql` commercial data ko represent karta hai:

```text
Plan
  -> Company subscription history
       -> Invoice
            -> Optional coupon redemption
```

Payment provider ka exact selection, checkout API, webhook signature, retry aur refund contract abhi separately approve hoga. Isliye schema generic `provider` + provider IDs rakhta hai; Stripe/Paddle kisi vendor ko hard-code nahi karta.

## 2. Tables

| Table | Kaam |
|---|---|
| `subscription_plans` | Pricing tier, features aur commonly queried limits |
| `company_subscriptions` | Company ki current aur historical subscription periods |
| `invoices` | Immutable amount/currency/billing snapshot aur payment status |
| `coupons` | Percentage/fixed discount configuration aur limits |
| `coupon_plan_eligibility` | Coupon किन plans par valid hai |
| `coupon_redemptions` | Invoice par actually applied discount ka immutable record |

## 3. Plan flow

Admin NestJS se plan create/edit/deactivate karega:

```text
Free / Starter / Pro / Enterprise
  |-- display price
  |-- currency
  |-- feature flags
  |-- job/team/storage limits
  |-- trial days
```

Monthly price required hai; quarterly/yearly price NULL hone ka matlab plan us interval par offered nahi hai.
NestJS subscription create karte waqt selected `billing_interval` ka corresponding plan price available hona verify karega.

`features` JSONB capability booleans ke liye hai. Frequently checked numeric limits dedicated columns me single source of truth hain. Public pricing API sirf `is_active = true AND is_public = true` plans ka safe DTO return karegi.

## 4. Subscription history

Purane schema me `UNIQUE(company_id)` tha. Usse canceled subscription ke baad nayi row create nahi ho sakti thi aur old row overwrite karne par history lose hoti.

Final rule:

```text
Company A
  Pro subscription #1  -> canceled (historical immutable row)
  Enterprise #2        -> active current row
```

Partial unique index ek company ke liye ek time par sirf ek current row allow karta hai:

```text
active / past_due / trialing / incomplete = current
canceled / expired                        = historical
```

Plan/billing interval change ke liye current subscription terminal ki jayegi aur new subscription row बनेगी. Renewal me same current row ka period/counters update ho sakta hai.

## 5. Provider-neutral behavior

Manual/free subscription me provider NULL ho sakta hai. Paid adapter configure hone par normalized provider key aur external IDs store ho sakte hain.

```text
NestJS checkout/webhook adapter
         |
         v
validated provider event
         |
         v
company_subscriptions / invoices update
         |
         +--> audit_logs + outbox event (same business transaction where relevant)
```

Provider secret, webhook signing key, card number, CVV aur raw provider payload in tables me store nahi honge. Webhook idempotency/verification ka exact contract provider decision ke saath freeze hoga.

## 6. Invoice rules

Invoice amount smallest currency unit me hai:

```text
INR 999.00 -> 99900 paise
USD 19.99  -> 1999 cents
```

Equation database enforce karta hai:

```text
amount_total = amount_subtotal + amount_tax - amount_discount
```

Company, subscription, amount, currency, line items, billing snapshot aur period immutable hain. Allowed payment lifecycle:

```text
pending -> succeeded -> partially_refunded -> refunded
   |
   +----> failed -> pending / succeeded
```

`paid_at` successful payment ke baad immutable hai. Invoice PDF bucket/path ek baar attach hone ke baad replace nahi hoga. Corrected financial document ke liye approved credit/refund/reissue workflow use hoga, silent invoice rewrite nahi.

`amount_refunded` smallest currency unit me actual refund track karta hai: `succeeded` par zero,
`partially_refunded` par zero se zyada lekin total se kam, aur `refunded` par invoice total ke barabar.

Composite FK ensure karti hai ki Company A ki invoice Company B ki subscription se attach na ho.

## 7. Coupon rules

Percentage coupon:

```text
discount_type       = percentage
discount_percentage = 10.00
discount_amount     = NULL
discount_currency   = NULL
```

Fixed coupon:

```text
discount_type       = fixed_amount
discount_percentage = NULL
discount_amount     = 50000   -- INR 500.00
discount_currency   = INR
```

Coupon code uppercase canonical form me store hota hai. Validity, global usage, per-company usage, first-purchase rule, minimum amount aur eligible plan NestJS transaction me validate honge.

`coupon_plan_eligibility` me coupon ke liye koi row nahi hai to coupon all active plans ke liye eligible maana jayega. Rows present hain to sirf listed plans eligible hain.

## 8. Coupon redemption transaction

```text
BEGIN
  coupon row lock
  -> active/date/usage/first-purchase/plan validate
  -> invoice create with discount
  -> coupon_redemptions insert
  -> coupons.used_count increment
  -> audit/outbox if required
COMMIT
```

Database verify karta hai:

- invoice aur redemption same company ke hain;
- redemption subscription invoice wali hi hai;
- currency invoice se match karti hai;
- redeemed amount invoice discount se zyada nahi;
- same coupon same invoice par duplicate nahi;
- redemption insert ke baad immutable hai.

Concurrency-safe usage limit ke liye NestJS transaction coupon row ko `FOR UPDATE` lock karegi. Sirf `used_count` read karke unlocked update karna allowed nahi.

## 9. Usage counters

`jobs_used_this_month`, `storage_used_bytes`, `api_calls_this_month` fast entitlement checks ke denormalized counters hain. Ye billing proof/source of truth nahi hain.

- counter negative nahi ho sakta;
- worker/NestJS controlled transaction update karega;
- billing period rollover par approved reset/recalculation hoga;
- drift detection authoritative usage records/metrics se hogi.

## 10. RLS and authorization

`17_rls.sql` final pass me:

- public ko sirf active + public plan safe columns milen;
- company billing data sirf authorized billing permission wale active members ko mile, every member ko nahi;
- bank/provider identifiers, billing address aur internal overrides safe DTO se return hon;
- plans/coupons mutate karna admin-only ho;
- subscription/invoice/redemption mutations trusted NestJS/provider workflow-only hon;
- provider/webhook caller direct browser role na ho;
- cross-company invoice/subscription/coupon access tests mandatory hon.

## 11. Responsibility summary

SQL:

- monetary/date/JSON integrity;
- one current subscription;
- cross-company composite FKs;
- immutable invoice/redemption history;
- provider identity uniqueness and query indexes.

NestJS:

- plan/coupon administration;
- entitlement and coupon business-policy evaluation;
- checkout/provider adapter authorization;
- webhook verification/idempotency after provider contract approval;
- transactional coupon usage and subscription transitions;
- safe billing DTO/PDF signed URL.

Next.js:

- pricing, billing history and admin forms;
- never calculates authoritative payable amount;
- never directly changes payment/subscription status.
