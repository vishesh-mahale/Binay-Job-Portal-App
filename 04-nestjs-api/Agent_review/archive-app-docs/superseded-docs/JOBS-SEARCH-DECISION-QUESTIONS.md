# Jobs और Search — Coding से पहले खुले निर्णय

यह document केवल उन details को capture करता है जो current API catalog में `TBD` हैं। कोई route,
DTO या business behavior यहाँ assume नहीं किया गया है। इन्हें freeze किए बिना jobs/search endpoint
implementation शुरू नहीं होगी।

## निर्णय 1 — Job API surface

- Job create, draft update, publish, pause, resume और archive के exact routes क्या होंगे?
- क्या अलग lifecycle endpoint होगा या एक command endpoint?
- Employer/HR/owner/admin के प्रत्येक अधिकार क्या होंगे?

## निर्णय 2 — Job approval

- `auto_approve_jobs` का owner/admin configuration path क्या होगा?
- Approval required होने पर reviewer कौन होगा और कौन-कौन से transitions valid होंगे?
- Rejected job को edit करके दोबारा submit करने का flow क्या होगा?

## निर्णय 3 — Expiry

- `expires_at` के बाद physical `expired` transition कौन करेगा?
- Existing scheduler/dispatcher sweep या Supabase Cron में कौन authoritative रहेगा?
- Expiry पर केवल DB state/outbox होगा या in-app notification भी बनेगी?

## निर्णय 4 — Job search API

- Candidate/public search का exact route और response DTO क्या होगा?
- FTS, semantic/vector और future external search layers का rollout order क्या होगा?
- Pagination cursor-based होगी या bounded offset-based?
- कौन से filters current हैं और कौन future?

## निर्णय 5 — Recruiter candidate search

- HR candidate-search route और permission boundary क्या होगी?
- Company tenant scope कैसे enforce होगा?
- Ranking explanation और saved-candidate state response में आएगा या अलग endpoint होगा?

## निर्णय 6 — Contracts और tests

- Job enrichment/search events में कौन से existing contracts use होंगे?
- Missing event contract को `TBD` रखना है या नया versioned contract बनाना है?
- Acceptance, authorization-negative और concurrency tests की minimum सूची क्या होगी?

## Agent review instruction

हर reviewer exact repository source/SQL citation के साथ recommendation दे। Missing detail को invent न
करे; conflict मिलने पर उसे `NEEDS_DECISION` mark करे। Response इसी directory में reviewer-name वाली
file में लिखा जाए।
