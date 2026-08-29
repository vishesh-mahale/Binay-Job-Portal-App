# Job/Application Transition Policy - Agent Review Questions

**Purpose:** Is document ka answer multiple independent agents se lena hai.
Is stage par koi transition silently final nahi maana jayega.

## Source of truth to inspect

- `02-database/migrations/baseline/02_enums.sql`
- `02-database/migrations/baseline/05_jobs.sql`
- `02-database/migrations/baseline/05_jobs_Explanation.md`
- `02-database/migrations/baseline/09_applications.sql`
- `02-database/migrations/baseline/09_applications_Explanation.md`
- `01-requirements/product-decisions/PD-003-APPLICATION-HISTORY.md`
- `04-nestjs-api/PHASE-04-STATE-MACHINES-AND-TRANSACTIONS.md`
- `04-nestjs-api/DECISION-01-NESTJS-SUPABASE-ACCESS-MODEL-HINGLISH.md`

## A. Job lifecycle questions

Baseline job states:

```text
draft, pending_approval, published, paused, closed, expired, archived
```

1. Exact allowed transitions kya honge?
2. `draft -> pending_approval` mandatory hai ya owner direct publish kar sakta hai?
3. `pending_approval -> draft` allowed hai?
4. `pending_approval -> published` ka actor kaun hai?
5. `published -> paused` aur `paused -> published` kaun kar sakta hai?
6. `published/paused -> closed` allowed hai? Kaun kar sakta hai?
7. `published -> expired` automatic system transition hoga ya manual bhi?
8. `archived` ka entry point kya hoga?
9. `closed`, `expired` aur `archived` terminal states hain?
10. Terminal job ko reopen karna allowed hai? Agar nahi, repost par new `job_id` confirm karein.
11. Company owner, primary HR, HR member aur admin ke transition permissions kya hain?
12. Har transition mein reason, actor, timestamp aur audit event required hai?
13. Job status update ke saath outbox event required hai? Event contract existing hai ya new contract chahiye?

## B. Application lifecycle questions

Baseline application states:

```text
applied, under_review, shortlisted, screening,
interview_scheduled, interview_completed, selected,
offer_extended, offer_accepted, offer_declined,
rejected, withdrawn, on_hold
```

1. Exact allowed application transitions kya honge?
2. Candidate sirf `applied -> withdrawn` kar sakta hai ya later states se bhi withdraw kar sakta hai?
3. HR/recruiter kaun-se states change kar sakta hai?
4. Company owner/admin ko HR se extra permission milegi?
5. `rejected` terminal state hai? Kya rejected application reopen ho sakti hai?
6. `withdrawn` terminal state hai? Kya candidate withdraw ke baad same job par reapply kar sakta hai?
7. `selected -> offer_extended` mandatory sequence hai?
8. `offer_declined` ke baad application terminal hai?
9. `on_hold` se kaun-se states mein return allowed hai?
10. `interview_scheduled -> interview_completed` interview module automatically karega ya HR status command karega?
11. `selected` aur `offer_accepted` ke beech exact business meaning kya hai?
12. Rejection par `rejection_reason` mandatory hai?
13. Har status change ke saath `application_status_history`, audit record aur outbox event same transaction mein likhenge?
14. Invalid transition par fail-closed error/status code kya hoga?
15. Guest application ke status transitions registered application ke same honge?

## C. Cross-cutting rules

1. Direct `job_applications.status` UPDATE blocked rahega aur `change_application_status(...)` hi canonical path hoga?
2. Job status ke liye bhi DB function/canonical NestJS command chahiye?
3. Status transition idempotency ka behavior kya hoga—same target status repeat request success ya conflict?
4. Concurrent status updates mein row lock/optimistic versioning kaunsa use hoga?
5. Realtime notification SSE se jayegi? Chat WebSocket se unrelated rahega?
6. Status history immutable aur append-only rahegi?
7. Transition policy ko API Catalog aur NestJS guards mein kaise map karenge?

## Required agent output

Agent ko:

- actual enum/SQL se evidence dena hai;
- proposed transition graph dena hai;
- actor/permission matrix deni hai;
- terminal states clearly list karne hain;
- existing DB function se mismatch identify karna hai;
- invented event/column/role nahi add karna hai;
- unresolved business decisions ko `NEEDS_CLARIFICATION` mark karna hai;
- report isi folder mein apne naam se save karni hai.

