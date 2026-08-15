# Job and Candidate Search Strategy

[← Database index](../README.md) · [Schema blueprint](PRODUCTION-SCHEMA-BLUEPRINT.md) · [Main project](../../README.md)

## 1. Document status

यह current production search architecture का human-readable contract है। यह पुराने
`Binay-App/Requirement/oldSearch-Strategy.md` का reviewed replacement है। Current Supabase testing
environment में PostgreSQL FTS, `pg_trgm`, filters और `pgvector` schema मौजूद है। External search
engine अभी selected या deployed नहीं है।

Search implementation का executable truth current SQL baseline और बाद की migrations होंगी। इस
document में कोई fixed provider, unsupported capacity guarantee या calendar-based migration promise
नहीं है।

## 2. Search एक नहीं, कई अलग problems हैं

### आसान overview — हमारे search layers

हमारे job portal में अभी तीन internal search layers हैं और एक optional future external layer है:

| Layer | Technology | काम | Expected behavior | Status |
|---|---|---|---|---|
| **Layer 1** | PostgreSQL relational filters | Location, work mode, salary, experience, skills और lifecycle जैसे exact conditions | सही indexes के साथ fast narrowing; actual latency tests से verify होगी | Current production architecture |
| **Layer 2** | PostgreSQL FTS + targeted `pg_trgm` | Jobs/candidates का keyword search; selected skill/title typo lookup | Index-backed lexical retrieval; dataset/query पर benchmark जरूरी | Current production architecture |
| **Layer 3** | `pgvector` semantic search | Meaning-based job/candidate retrieval, matching और recommendations | HNSW-assisted similarity; compatible embeddings और measured tuning जरूरी | Current production architecture |
| **Layer 4** | Meilisearch/OpenSearch/other external engine | Advanced typo tolerance, instant suggestions, facets या larger search workload | Product/SLO evidence और selected provider पर निर्भर | Future evaluation; अभी selected नहीं |

```text
Current request
  -> Layer 1 exact filters
  -> Layer 2 keyword signal (जब query text हो)
  -> Layer 3 semantic signal (जब compatible embedding available हो)
  -> explicit hybrid ranking

Future Layer 4
  -> measured need और approved ADR के बाद ही add होगा
```

पुरानी table में Meilisearch को fixed तीसरी layer और PostgreSQL/pgvector को guaranteed “Fast” कहा गया
था। Current table वही आसान overview preserve करती है, लेकिन बिना benchmark के speed guarantee या पहले
से provider commitment नहीं करती।

```text
Exact/structured filter
  -> location, work mode, salary, experience, status, skills

Keyword search
  -> Java, Spring Boot, backend developer

Fuzzy lookup
  -> skill/title autocomplete और छोटे typo cases

Semantic retrieval
  -> "scalable distributed backend" का अर्थ समझकर relevant profile/job

Business ranking
  -> relevance + recency + required skills + permissions + product rules
```

इन सभी को केवल embedding या केवल FTS से solve नहीं करना है। NestJS query use case explicitly सही
signals combine करेगा।

## 3. Current production stack

| Capability | Technology | Current purpose |
|---|---|---|
| Relational filters | PostgreSQL columns/indexes | eligibility और exact narrowing |
| Keyword search | PostgreSQL `tsvector` + GIN | jobs और candidates का lexical retrieval |
| Targeted fuzzy lookup | `pg_trgm` | skill/title suggestion या controlled typo tolerance |
| Semantic search | `pgvector` + HNSW | meaning-based retrieval/ranking |
| Source of truth | Relational domain tables | editable and governed business data |
| Search projection | `jobs` search fields और `candidate_search_profiles` | query-optimized derived data |

यह “तीन services हमेशा sequence में चलेंगी” वाला design नहीं है। Current system एक PostgreSQL-based
hybrid search है। हर request के intent के अनुसार filters, FTS और vector signals चुने जाएँगे।

## 4. Job search projection

`jobs` table में relevant search state है:

```text
normal filter columns
  status, employment_type, work_mode, experience_level,
  location, salary, category, published/expires dates

search_vector
  weighted keyword representation

embedding
  semantic representation

embedding_status/model/version/generated_at
  vector lifecycle और compatibility metadata
```

### `search_vector` कब update होता है?

PostgreSQL functions/triggers `jobs.search_vector` को job insert/update, job-skill changes और relevant
canonical skill-name changes पर refresh करते हैं। यह AI profile या embedding का copy नहीं है। इसका
input job title/content/location/category/employment fields और linked skill names का weighted text है।

### Job embedding कब बनती है?

Job create/edit transaction background work के लिए outbox event लिखती है। AI/profile worker approved
job content से normalized ideal-candidate representation बनाता है और configured embedding model से
vector generate करता है। Result compatible `embedding_model`, `embedding_version` और timestamp के साथ
persist होता है। Content change जिससे semantic meaning बदलता है, embedding को stale/pending करके नई
generation schedule करेगा।

Embedding generation HTTP request को block नहीं करेगी। जब embedding ready न हो, job keyword/filter
search में फिर भी दिखाई दे सकती है।

## 5. Candidate search projection

Candidate canonical source एक table नहीं, पूरा aggregate है:

- `candidate_profiles`
- active `candidate_skills`
- active `candidate_experiences`
- active `candidate_educations`
- active `candidate_projects`
- active `candidate_certifications`
- active `candidate_languages`
- active `candidate_awards`
- active `candidate_links`

Projection worker इनसे `candidate_search_profiles` बनाता है:

```text
source_profile_revision / projection_revision
professional_title / normalized_titles
skill_ids / skill_names
locations
total_experience_years
highest_education_level
searchable_text
search_vector
embedding + model/version
generated_at
```

Candidate की एक logical profile-save transaction revision exactly `+1` करती है और outbox event लिखती
है। Worker उसी requested revision का projection बनाता है। Upsert से पहले current revision दोबारा check
होती है; stale worker newer projection overwrite नहीं कर सकता।

Candidate resume upload अपने-आप canonical/search profile नहीं बदलता। केवल approved canonical merge या
candidate-confirmed profile change नई projection/embedding trigger करती है।

## 6. Embedding compatibility rule

दो vectors केवल तभी directly compare किए जाएँगे जब उनका embedding space compatible हो:

```text
same provider contract
+ same model
+ same dimension
+ same version/preprocessing contract
= valid similarity comparison
```

Job को एक model और candidate को unrelated दूसरे model से embed करके cosine similarity निकालना valid
ranking नहीं है, भले दोनों vectors की dimension `768` हो। Model migration के समय old/new vectors को
versioned रखें, backfill करें और query में compatible version filter करें।

User search query की embedding भी उसी active model/version से बनेगी जिस vector corpus को query किया
जा रहा है। Raw query embeddings सामान्यतः durable business record नहीं हैं; privacy-safe search log
policy अलग होगी।

## 7. Candidate jobs कैसे search करेगा?

```text
Candidate query + filters
        |
        +--> authorization/publication rules
        +--> exact filters (published, active, location, mode, salary...)
        +--> FTS candidates using jobs.search_vector
        +--> optional compatible query embedding -> jobs.embedding similarity
        |
        v
bounded candidate set / scores
        |
        v
normalized hybrid score + deterministic tie-break
        |
        v
cursor-paginated job results
```

Example intent `Java backend jobs in Noida, hybrid`:

- `Noida` और `hybrid` exact filters हो सकते हैं।
- `Java backend` FTS score देगा।
- Semantic vector related terms जैसे distributed services/scalable API को additional relevance दे सकता
  है।
- Unpublished, expired, soft-deleted या unauthorized confidential job पहले ही exclude होगी।

## 8. HR candidate कैसे search करेगा?

```text
Authenticated HR/employer
        |
        +--> company membership + permission + lawful visibility scope
        +--> exact filters (skills, location, experience, education...)
        +--> candidate_search_profiles.search_vector keyword retrieval
        +--> compatible job/query embedding semantic retrieval
        |
        v
hybrid rank
        |
        v
authorized candidate summary DTO
```

HR search केवल relevance problem नहीं है; authorization और candidate visibility पहले-class filters हैं।
Search index/projection में row होने का अर्थ हर recruiter उसे पढ़ सकता है, ऐसा नहीं है। RLS/service
policy और NestJS authorization final response को govern करेंगे।

अगर Vishesh ने canonical profile में `Microservices` confirm करके save किया, revision bump और projection
rebuild के बाद keyword query `microservices` उसे retrieve कर सकती है। Query `scalable architecture` पर
keyword hit जरूरी नहीं, लेकिन compatible semantic embedding उसे relevant rank दे सकती है।

## 9. Hybrid ranking

FTS rank और cosine similarity अलग scales पर होते हैं; उन्हें raw जोड़ना गलत हो सकता है। Initial
implementation deterministic normalization/configured weights use करेगी। Conceptually:

```text
final_score =
    keyword_weight  * normalized_keyword_score
  + semantic_weight * normalized_semantic_score
  + business boosts/penalties
```

Rules:

- Exact eligibility filters score नहीं, hard constraints हैं।
- Missing embedding candidate/job को automatically invisible न बनाए। Keyword/filter fallback रहे।
- Zero-result और low-confidence behavior explicit हो।
- Tie-break stable हो, जैसे score के बाद published/generated timestamp और UUID।
- Offset pagination के बजाय stable cursor prefer करें।
- Weights guess करके permanent न करें; anonymized relevance test set और search analytics से tune करें।

Alternative Reciprocal Rank Fusion (RRF) lexical और semantic result lists combine करने के लिए evaluate
की जा सकती है। Final formula API/search ADR या tested query contract में freeze होगी।

## 10. Index usage

Current relevant indexes broadly:

- GIN on `jobs.search_vector` और `candidate_search_profiles.search_vector`।
- HNSW cosine indexes on completed/available job and candidate embeddings।
- GIN on candidate `skill_ids`।
- B-tree/partial indexes for common job status/filter and candidate filter paths।
- Trigram index on canonical skill name for controlled fuzzy lookup।

Indexes query shape के आधार पर use होते हैं। हर filter column पर blind index नहीं जोड़ना है। Realistic
data volume पर `EXPLAIN (ANALYZE, BUFFERS)` और production-like query distribution से validate करें।
“100k records तक निश्चित रूप से fast” जैसी बिना measurement guarantee नहीं दी जाएगी।

## 11. Update और background flow

```text
NestJS business transaction
  -> canonical/job change
  -> revision/status metadata
  -> outbox_events INSERT
COMMIT
  -> Supabase async webhook
  -> NestJS Outbox Dispatcher
  -> Google Cloud Tasks Queue
  -> Cloud Run FastAPI projection/embedding worker
  -> compatible projection/result + processed_events
```

FTS fields जो DB triggers maintain करते हैं synchronous transaction में update हो सकते हैं। AI profile,
embedding और candidate aggregate projection asynchronous हैं। Search API eventual consistency को status/
revision metadata से समझेगी और stale data को newer state बताकर misrepresent नहीं करेगी।

## 12. External search engine future decision

Meilisearch, OpenSearch या कोई अन्य engine अभी committed architecture नहीं है। PostgreSQL projection
external sync के लिए suitable base देता है, लेकिन provider selection future ADR से होगी।

External engine तभी evaluate करें जब measured evidence हो:

- PostgreSQL search latency/SLO proper indexing और query tuning के बाद भी unmet हो।
- Required typo tolerance, autocomplete, facets या multilingual analysis PostgreSQL design से practical
  तरीके से पूरा न हो।
- Dataset/query concurrency और operational cost external engine justify करें।
- Team sync, replay, deletion, privacy और outage operations own कर सके।

External index source of truth नहीं बनेगा। Sync transactional outbox/change stream से idempotently होगी।
Index unavailable होने पर documented degradation/fallback होगा। Search engine को जोड़ने से pgvector
automatically replace होगा, यह assumption नहीं है; chosen engine capability और ADR decide करेगी।

Calendar (`6–12 months`) या arbitrary record thresholds external engine adoption decide नहीं करेंगे।

## 13. Security और privacy

- Candidate search output authorized DTO तक सीमित हो; raw evidence/resume/storage paths expose न हों।
- Confidential job की company identity visibility policy लागू हो।
- Search logs में raw sensitive resume/profile text या query embeddings blindly store न करें।
- Query rate limits, abuse detection और expensive vector-query bounds रखें।
- Soft-deleted/inactive records projection/query से exclude हों और purge/sync policy follow करें।
- External search add होने पर tenant/visibility filters mandatory और tested हों।

## 14. Observability

Track करें:

- query type: filter/keyword/semantic/hybrid;
- latency percentiles और timeout/error rate;
- candidate-set sizes और index/query plan regressions;
- zero-result और reformulation rate;
- click/save/apply or recruiter-contact outcome where privacy policy allows;
- embedding/projection lag and stale revision count;
- model/version coverage and incompatible-vector skips;
- external sync lag/failure if introduced later.

## 15. Acceptance tests

- Published active jobs ही public search में आएँ।
- Candidate search authorization company/application/visibility rules bypass न करे।
- Keyword, filters और semantic-only scenarios individually और hybrid रूप में test हों।
- Missing embedding पर lexical/filter fallback काम करे।
- Different embedding model/version vectors compare न हों।
- Profile revision `N+1` के बाद worker revision `N` projection overwrite न करे।
- Skill add/remove के बाद candidate projection और keyword results expected state में जाएँ।
- Job content/skill changes `search_vector` refresh करें और semantic-relevant changes re-embedding schedule करें।
- Pagination duplicates/skips न बनाए और tie ordering deterministic हो।
- Query plans realistic seed volume पर intended indexes use करें।
- Redelivered projection/index-sync event duplicate state या side effect न बनाए।

## 16. Final decision summary

```text
Current production search
  = PostgreSQL relational filters
  + PostgreSQL FTS
  + targeted pg_trgm
  + compatible pgvector semantic retrieval
  + explicit NestJS hybrid ranking/authorization

Future external search
  = evidence-driven ADR
  = PostgreSQL remains source of truth
  = outbox-based idempotent sync
```

## 17. Original document coverage audit

यह mapping पुराने `Search-Strategy.md` की useful information silently खोने से रोकती है:

| Original section | Treatment in this document |
|---|---|
| Three-layer overview table | **Updated and preserved** as four-layer overview; exact filters अलग layer बने और external engine optional रखा |
| PostgreSQL FTS explanation | **Preserved and expanded** in current stack, job/candidate projection, query flows and index sections |
| Job FTS SQL example | **Concept preserved**, लेकिन outdated demo SQL को production query contract नहीं माना; current trigger-maintained `jobs.search_vector` explain किया |
| Candidate FTS example | **Preserved and expanded** using `candidate_search_profiles.search_vector` and authorization flow |
| FTS limitations | **Updated**: keyword/semantic/fuzzy responsibilities अलग कीं; unsupported “100k पर slow” claim हटाकर measurement rule दिया |
| pgvector meaning and use cases | **Preserved and expanded** with job/candidate/query compatibility, model migration and fallback rules |
| Gemini-only embedding example | **Updated** to provider-neutral compatible embedding contract; fixed provider architecture नहीं है |
| Meilisearch explanation | **Preserved** under external-search decision; Meilisearch के साथ OpenSearch/other options भी open हैं |
| “Meilisearch pgvector replace नहीं करेगा” | **Preserved with correction**: replacement chosen engine capabilities/ADR पर depend करेगा; semantic requirement disappear नहीं होती |
| Phase-wise adoption plan | **Updated** from calendar/record thresholds to measurable latency, capability, cost and operational triggers |
| Future sync flow | **Preserved and strengthened** as PostgreSQL source of truth + idempotent outbox sync/replay/deletion policy |
| Cost/speed estimates | **Not carried forward as facts** because they were unverified and time-sensitive; benchmark/provider ADR required |
| Final recommendation | **Preserved in corrected form**: current PostgreSQL hybrid search, external engine only after evidence and ADR |

किसी item को बिना replacement के silently remove नहीं किया गया है। जिन numerical guarantees को नहीं
रखा गया, उनका reason unverified/time-sensitive होना है—उनका functional intent measurement और future
ADR rules में रखा गया है।
