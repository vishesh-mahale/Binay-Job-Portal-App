# Supabase PostgreSQL Query and Index Guide

[← Database index](../README.md) · [Search strategy](SEARCH-STRATEGY.md) · [Main project](../../README.md)

## 1. उद्देश्य और status

यह current testing-environment schema के लिए query/index engineering guide है। यह पुराने
`Binay-App/Requirement/supabase-query-index-use-approach.md` का reviewed replacement है। Goal हर
column पर index बनाना नहीं, बल्कि real authorized query shapes को measured तरीके से fast रखना है।

## 2. Query से शुरू करें

हर page/background operation के लिए complete query contract लिखें:

```text
caller और tenant/owner scope
WHERE predicates और JOIN keys
ORDER BY और pagination
expected rows/cardinality
response columns
RLS/policy का effect
```

Example:

```sql
SELECT id, event_name, occurred_at
FROM analytics_events
WHERE company_id = $1
  AND event_category = 'feature'
  AND occurred_at >= $2
ORDER BY occurred_at DESC
LIMIT $3;
```

यह frequent/measured query हो तो candidate index:

```sql
CREATE INDEX idx_analytics_company_feature_time
ON analytics_events(company_id, occurred_at DESC)
WHERE event_category = 'feature';
```

पुराने example में index `(event_name, occurred_at)` था जबकि query category/time पर filter करती थी। वह
column order/query pattern aligned नहीं था; corrected example ऊपर है।

## 3. EXPLAIN सही तरीके से use करें

Testing data पर prefer करें:

```sql
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT ...;
```

- `EXPLAIN ANALYZE` query वास्तव में execute करता है। Mutating query safe test DB या explicit
  transaction + rollback में ही analyze करें।
- केवल estimate चाहिए तो `EXPLAIN` बिना `ANALYZE` query execute नहीं करता।
- `Seq Scan` अपने-आप bug नहीं है। Small table, broad result या low-selectivity predicate में सही हो सकता है।
- `Index Scan` अपने-आप fast होने की guarantee नहीं है। Actual time, rows, loops, buffers और sort देखें।
- Representative statistics जरूरी हैं; testing load के बाद `ANALYZE` करें।

Review करें:

```text
estimated rows vs actual rows
actual time and loops
shared hit/read buffers
rows removed by filter
sort method / disk spill
nested-loop multiplication
RLS-generated predicates
index condition vs residual filter
```

## 4. Multicolumn index order

सामान्य B-tree pattern:

```text
equality/tenant scope columns
-> range column
-> ORDER BY-compatible direction
```

Example recruiter application queue:

```sql
WHERE job_id = $1
  AND status IN (...)
ORDER BY ai_match_score DESC NULLS LAST, applied_at DESC
```

Current partial index query shape के अनुसार है:

```text
(job_id, ai_match_score DESC NULLS LAST, applied_at DESC)
WHERE deleted_at IS NULL
  AND status IN ('applied','under_review','shortlisted','screening')
```

`status` partial predicate में है, score से पहले key column नहीं है; इससे combined statuses की queue
global score order use कर सकती है।

हर possible permutation के लिए index न बनाएँ; highest-value measured shapes चुनें।

## 5. Partial indexes

Partial index केवल predicate satisfy करने वाली rows रखता है। Query predicate planner को index predicate
imply करने देना चाहिए। Current examples:

```text
resume_parsing_jobs(locked_at)
WHERE status = 'processing' AND locked_at IS NOT NULL

outbox_events(available_at, occurred_at, id)
WHERE status IN ('pending', 'failed')

outbox_events(lease_expires_at)
WHERE status = 'publishing'

interview_schedule_blocks(interviewer_id, start_time)
WHERE is_booked = false
```

Schedule query `is_booked = false` नहीं लगाती तो available-slot partial index intended तरीके से use नहीं
होगा। Parameterized/generic plans भी realistic prepared query के साथ verify करें।

## 6. Current schema-aligned examples

### Resume parsing queue

Current column `status` है; पुराना `deep_track_status` मौजूद नहीं है। Queue claim broadly:

```sql
SELECT id
FROM resume_parsing_jobs
WHERE status = 'queued'
  AND available_at <= now()
ORDER BY priority DESC, available_at, created_at
FOR UPDATE SKIP LOCKED
LIMIT $1;
```

Current queue index:

```text
(priority DESC, available_at, created_at)
WHERE status = 'queued'
```

Stuck-processing recovery का separate partial index `updated_at WHERE status = 'processing'` है।

### Interview availability

```sql
SELECT id, start_time, end_time
FROM interview_schedule_blocks
WHERE interviewer_id = $1
  AND is_booked = false
  AND start_time >= $2
ORDER BY start_time
LIMIT $3;
```

Current partial `(interviewer_id, start_time)` index suitable candidate है। Overlap integrity GiST
exclusion constraint enforce करती है, B-tree index नहीं।

### Analytics

Existing indexes event name/time, user/time, company/time, entity और trace/request IDs cover करते हैं।
Category-specific partial index तभी add करें जब actual frequent report और plan उसकी need prove करें।

### Candidate/job search

FTS के लिए GIN, cosine vector search के लिए HNSW और candidate skill-array containment के लिए GIN
operator-specific indexes हैं। इन्हें normal B-tree rules से evaluate नहीं करना है। Full policy
[Search Strategy](SEARCH-STRATEGY.md) में है।

## 7. Foreign keys और uniqueness

- PostgreSQL child-side foreign-key index automatically नहीं बनाता। Common join/delete-check paths review करें।
- `PRIMARY KEY` और `UNIQUE` supporting indexes बनाते हैं; duplicate manual index न बनाएँ।
- Partial unique indexes business identity/lifecycle enforce कर सकती हैं; performance index समझकर drop न करें।
- Composite FK के referenced identity पर matching unique constraint/index आवश्यक है।

## 8. Pagination और result shape

- Unbounded list query नहीं।
- Stable cursor/keyset pagination prefer करें; deep `OFFSET` expensive/unstable हो सकता है।
- Ordering deterministic हो, जैसे `(occurred_at DESC, id DESC)` और index design उसे consider करे।
- JSONB/text/vector-heavy tables पर unnecessary `SELECT *` avoid करें।
- Large aggregates interactive list से अलग; aggregate tables/background summaries use करें।

## 9. RLS और authorization-aware planning

Supabase RLS hidden security predicates जोड़ सकती है:

- `anon`, `authenticated` और server/worker paths अलग test करें।
- Tenant/company/owner policy joins और indexes inspect करें।
- Service-role plan देखकर client RLS performance assume न करें।
- Security bypass करके performance fix न करें; policy/query/index साथ tune करें।
- NestJS authenticated identity से scope derive करे; client owner/company IDs trust न करे।

## 10. Write cost और over-indexing

हर extra index writes, storage और vacuum/maintenance cost बढ़ाता है। Duplicate, unused और overlapping
indexes review करें। Drop से पहले constraint ownership, telemetry और rollback plan verify करें।

## 11. Safe schema workflow

Current testing environment में baseline अभी refinable है:

```text
query contract
-> representative seed/load data
-> existing indexes inspect
-> EXPLAIN (ANALYZE, BUFFERS)
-> measured index change
-> baseline edit हो तो test DB explicit reset + full 01–18 rerun
-> correctness/concurrency/RLS/performance tests
```

Production baseline freeze/deployment के बाद index change नई reviewed forward-only migration में जाएगी।
`CREATE INDEX CONCURRENTLY` जैसी operational choice deployment tooling/transaction rules से plan होगी।

## 12. Query-index documentation contract

Index comment में रखें:

```text
owner module/use case
representative query/predicate/order
partial predicate meaning
integrity या performance purpose
benchmark/test reference जब available हो
```

API/query code बदलने पर owning index tests/docs review करें।

## 13. Feature checklist

1. Authorized query और expected cardinality लिखी?
2. `WHERE/JOIN/ORDER BY/GROUP BY` और cursor shape clear है?
3. Existing PK/unique/FK/domain/cross-domain index check किया?
4. Representative data और correct RLS role से plan run किया?
5. Seq/index scan context के साथ evaluate किया?
6. Before/after timing, buffers और rows compare किए?
7. Write/storage cost consider किया?
8. Correctness, pagination और concurrency tests pass हैं?
9. Testing baseline reset/rerun या production change migration सही path से हुई?
10. Index purpose और coverage docs update हुए?

## 14. Acceptance criteria

- Referenced table/column names current schema में exist करें।
- Frequent list/claim/search queries bounded और deterministic हों।
- Queue claims `SKIP LOCKED`, status predicate और ordering के साथ test हों।
- RLS roles के under representative plans verify हों।
- FK paths और unique-index duplication audit हो।
- GIN/HNSW/trigram operator compatibility test हो।
- New index measurable improvement दे और unacceptable write regression न लाए।
- Production-size expectation पर repeatable realistic benchmark हो।

## 15. Original document coverage audit

| Original section | Current treatment |
|---|---|
| Start from query pattern | Preserved/expanded with auth, ordering, cardinality and RLS |
| `EXPLAIN ANALYZE` | Preserved/corrected with execution warning, buffers and Seq Scan nuance |
| Build matching indexes | Preserved; misaligned analytics example corrected |
| Partial-index predicates | Preserved/expanded with current examples |
| Query-index workflow | Preserved in safe schema workflow/checklist |
| Schema comments | Preserved as documentation contract |
| Next.js + Supabase practices | Updated to Next.js parameters -> NestJS authorization -> PostgreSQL/RLS |
| Common project indexes | Stale `deep_track_status` and speculative examples replaced with actual baseline indexes |
| Do not over-index | Preserved/expanded with write/storage/constraint risks |
| Safety checklist | Preserved/expanded to RLS, concurrency and environment lifecycle |

Useful guidance remove नहीं हुई। Incorrect columns, index/query mismatch और unsafe planner assumptions को
current replacements के साथ explicitly corrected किया गया है।
