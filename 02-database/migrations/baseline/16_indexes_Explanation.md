# 16 Cross-Domain Indexes — Explanation (Hinglish)

## 1. Is file ka purpose

Har domain ke normal FK/list/lifecycle indexes usi SQL file me hain. `16_indexes.sql` sirf un broader queries ke indexes rakhta hai jo multiple product flows ko support karti hain.

```text
Domain-local index       -> 03–15 wali owning SQL file
Cross-domain query index -> 16_indexes.sql
```

Index “future me shayad kaam aaye” basis par add nahi karna. Har index ka query shape hona chahiye aur realistic data par `EXPLAIN (ANALYZE, BUFFERS)` se verify hoga.

## 2. Final six indexes

| Index | Query/use case |
|---|---|
| `idx_candidate_matching_ready` | Embedding-ready candidates par experience + education browse/filter |
| `idx_candidate_search_skill_ids` | Recruiter skill UUID array contains/overlap filter |
| `idx_application_recruiter_queue` | Job-wise active application workflow, AI score then newest order |
| `idx_resume_stale_processing_jobs` | Stale processing lease recovery by `locked_at` |
| `idx_guest_upload_cleanup` | Expired/revoked guest upload sessions retention cleanup |
| `idx_guest_claim_cleanup` | Expired/revoked/rejected guest claims retention cleanup |

## 3. Candidate search indexes

Candidate discovery me three अलग index families work karti hain:

```text
Keyword search  -> 08 ka GIN(search_vector)
Semantic search -> 08 ka HNSW(embedding)
Skill filter    -> 16 ka GIN(skill_ids)
Normal filters  -> 16 ka experience/education B-tree
```

Example skill filter:

```sql
WHERE skill_ids @> ARRAY[:java_skill_id, :spring_skill_id]::UUID[]
```

PostgreSQL planner query/filter selectivity ke अनुसार suitable index choose karega. NestJS explicitly keyword/vector/filter query likhega; sirf index create karne se search automatically execute nahi hoti.

## 4. Recruiter application queue

Expected query shape:

```sql
WHERE job_id = :job_id
  AND status IN ('applied', 'under_review', 'shortlisted', 'screening')
  AND deleted_at IS NULL
ORDER BY ai_match_score DESC NULLS LAST, applied_at DESC;
```

`NULLS LAST` important hai: AI score abhi generate nahi hua to application queue ke top par nahi aani chahiye. Candidate application hide nahi hogi; woh scored rows ke baad दिखाई देगी.

`status` partial-index predicate me hai, key columns me score se pehle नहीं। Agar key me status pehle होता तो
multiple statuses ki combined queue global score order me नहीं रहती और extra sort लगता।

`09_applications.sql` ka general `(job_id, status, applied_at)` index normal status lists ke liye hai. 16 wala index specifically scored recruiter queue order ke liye hai, isliye exact duplicate nahi hai.

## 5. Resume stale-work recovery

Worker claim ke waqt `locked_at` set hota hai. Recovery query broadly:

```sql
WHERE status = 'processing'
  AND locked_at < :stale_before;
```

Isliye old `updated_at` based index ko `locked_at` par correct kiya गया। `updated_at` unrelated state update se बदल सकता है और lease age ka precise source nahi hai.

Domain worker implementation ko status/lock/attempt rules atomically enforce karne hain; index sirf recovery query fast karta hai.

## 6. Guest retention cleanup

Active expiry queries already मौजूद हैं:

```text
06 -> idx_guest_upload_sessions_expiry (active)
09 -> idx_guest_claims_expiry          (pending)
```

Isliye 16 me active/pending dubara index nahi kiya. Yahan terminal cleanup rows cover hain:

```text
guest upload session -> expired / revoked
guest claim          -> expired / revoked / rejected
```

Cleanup ka matlab blind delete nahi hai. Retention job FK/legal/audit policy check karegi; index eligible rows locate karne me help karta hai.

## 7. Outbox duplicate index kyun हटाया?

Updated `15_infrastructure.sql` me already:

```text
idx_outbox_publish_queue
idx_outbox_stale_publishing
idx_outbox_dead_letter
```

पुराना `idx_outbox_retry_work` same pending/failed claim workload ko overlap karta tha. Extra index:

- हर INSERT/UPDATE par write cost बढ़ाता;
- storage use करता;
- planner ko materially naya access path नहीं देता।

इसलिए उसे 16 से हटाया गया।

## 8. Verification plan

Testing database me representative volume ke baad:

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT ...;
```

Har index ke liye check:

- expected index/bitmap scan use hua?
- rows estimate reasonable hai?
- sort avoid hua ya nahi?
- index size aur write overhead acceptable hai?
- low-use index `pg_stat_user_indexes` me unused to nahi?

Small seed data par sequential scan normal ho sakta hai; us basis par index ko immediately wrong nahi maana jayega. Production-like cardinality aur query frequency dono देखे जाएँगे।

## 9. Important boundary

Indexes authorization नहीं देते। Recruiter/company/candidate visibility predicates और RLS/NestJS permission checks query me independently लागू रहेंगे। `17_rls.sql` review security finalize करेगी।
