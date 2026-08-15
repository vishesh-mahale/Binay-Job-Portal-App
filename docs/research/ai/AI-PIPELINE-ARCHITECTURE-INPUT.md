# 🤖 AI Pipeline Architecture — Job Portal

> **Current schema mapping:** Generic uploads are in `06_documents.sql`, immutable
> parsing jobs/results are in `07_resume_processing.sql`, canonical editable facts
> are in `08_candidates.sql`, and application snapshots are in
> `09_applications.sql`. Older `06_candidates`/`07_resumes` labels in diagrams are
> historical and are superseded by this mapping.

## Complete Flow: Resume Upload → Match Score

---

## 📌 1. Samajhne Wali Baat

**Teen alag cheezein hain, inhe mix mat karna:**

| # | Component | Kaam | Example |
|---|-----------|------|---------|
| 1 | **AI Model (Gemini)** | Resume se text/data nikalna | PDF se name, email, skills extract karna |
| 2 | **Embeddings API** | Text ko **number ki list (vector)** mein convert karna | "React Developer" → [0.12, 0.45, 0.78, ...] |
| 3 | **pgvector** | Un numbers ki list ko DB mein store karna aur 2 lists ki similarity nikalna | 95% match dena |

---

## 📌 2. "Embeddings" Ka Matlab — 5 Saal Ke Bachche Ko Samjhao

### 🔹 Pahle Samjho: Computers Ko Numbers Chahiye

Computer English nahi samajhta. Woh sirf **numbers** samajhta hai.

```
"React Developer"  → Computer: 🤷‍♂️ kya hai yeh?
[0.12, 0.45, 0.78] → Computer: 🎉 acha! yeh number hai, samajh gaya!
```

### 🔹 Embedding = Text Ka Number-mein Translation

Har cheez ka ek **numeric fingerprint** (vector) banta hai:

```
"React Developer"           → [0.12, 0.45, 0.78, 0.23, 0.91, ...]
"Frontend Engineer React"   → [0.11, 0.44, 0.80, 0.22, 0.90, ...]  ✅ Similar
"Java Backend Developer"     → [0.90, 0.12, 0.34, 0.87, 0.11, ...]  ❌ Different
```

**Jaise aapke fingerprints unique hote hain, waise hi har text ka ek unique numeric fingerprint hota hai — use kehte hain "embedding" ya "vector".**

### 🔹 Similarity Kaise Nikalti Hai?

Do vectors ki **distance** measure karte hain:
- **Pass hain** → Distance kam (95% match) ✅
- **Far hain** → Distance zyada (20% match) ❌

```
Vector A: [0.12, 0.45, 0.78]
Vector B: [0.11, 0.44, 0.80]

cosine_distance(A, B) = 0.05 (bahut kam) → 95% match!
```

**Yeh similarity nikalne ka kaam pgvector karta hai.**

---

## 📌 3. Complete AI Pipeline — Diagram

```
📄 RESUME UPLOAD (PDF/DOCX)
         │
         ▼
┌───────────────────────────────────────┐
│  STEP 1: Gemini API (AI Model)        │
│  - PDF se text extract karo           │
│  - Structured JSON banao:              │
│    { "name": "Shubham",               │
│      "skills": ["React","Node"],       │
│      "experience": "3 years",          │
│      "education": "B.Tech" }           │
└───────────────────────────────────────┘
         │
         ├──────────────────────────────────────────────┐
         ▼                                              ▼
┌──────────────────────────────┐     ┌──────────────────────────────────┐
│ STEP 2A: PostgreSQL          │     │ STEP 2B: Gemini Embedding API    │
│ Relational Tables            │     │ (models/embedding-001)           │
│ - skills table               │     │                                  │
│ - experience table           │     │ "Shubham, React, 3 years..."     │
│ - education table            │     │         →                        │
│ - certifications table       │     │ [0.12, 0.45, 0.78, ...]         │
│                              │     │         → vector ban gaya        │
│ (Aapke SQL files se          │     │                                  │
│  yeh tables ban chuki hain   │     │ ✅ PURE GEMINI — ek hi provider  │
│  - 06_candidates, 07_resumes)│     │    ek hi API key, sab manage!    │
└──────────────────────────────┘     └──────────────────────────────────┘
         │                                              │
         │                                              ▼
         │                           ┌──────────────────────────────────┐
         │                           │ STEP 3: pgvector Column          │
         │                           │ Resume table mein:                │
         │                           │ embedding = [0.12, 0.45, ...]    │
         │                           │ (yeh vector yahan store hoga)    │
         │                           └──────────────────────────────────┘
         │                                              │
         ▼                                              ▼
    ┌─────────────────────────────────────────────────────────┐
    │  JAB JOB POST HOGI — MATCHING HOGA                      │
    │                                                         │
    │  1. Job Description ka bhi vector banayein               │
    │     "Senior React Developer" → [0.15, 0.42, ...]        │
    │                                                         │
    │  2. pgvector se query:                                  │
    │     SELECT *,                                            │
    │        resume_embedding <-> job_embedding                │
    │        AS similarity_score                               │
    │     FROM resumes                                         │
    │     ORDER BY similarity_score                            │
    │     LIMIT 10;                                            │
    │                                                         │
    │  3. Result:                                             │
    │     Shubham → 95% 🥇                                    │
    │     Priya  → 82% 🥈                                     │
    │     Rahul  → 45% ❌                                     │
    └─────────────────────────────────────────────────────────┘
```

---

## 📌 4. Embeddings Kaun Banayega? (Aapke Sawalon Ka Jawab)

### Q1: "OpenAI kyu? Gemini bhi to use kar sakte hain"

**Bilkul! Gemini hi use karo.** OpenAI sirf example tha. RECOMMENDED approach: **Sirf Gemini (Google) use karo** — ek hi provider, ek API key, sab easy!

### ✅ FINAL: Pure Gemini (Parse + Embeddings, ek hi provider)

```python
import google.generativeai as genai

genai.configure(api_key="GEMINI_API_KEY")

# Step 1: Parse Resume - Gemini 2.5 Flash
parse_response = genai.GenerativeModel('gemini-2.5-flash').generate_content(
    [pdf_file, "Extract structured JSON: name, skills, experience, education"],
    generation_config={"response_mime_type": "application/json"}
)
parsed_data = parse_response.text  # { "name": "...", "skills": ["React", "Node"] }

# Step 2: Embedding - bhi Gemini se!
embedding_result = genai.embed_content(
    model='models/embedding-001',
    content=str(parsed_data),
    task_type="retrieval_document"
)
vector = embedding_result['embedding']  # [0.12, 0.45, 0.78, ...]

# Step 3A: Raw/normalized parse result resume_parsed_data mein immutable INSERT
# Step 3B: Candidate-confirmed canonical tables se searchable_text banao
# Step 3C: Final vector candidate_search_profiles.embedding mein UPSERT
```

Important: `candidate_profiles.parsed_json` और `candidate_profiles.embedding`
current schema में नहीं हैं। Raw resume output canonical profile नहीं है। Permanent
candidate embedding approved canonical profile/projection से बनती है।

---

### Q2: "2 alag calls kyu? Ek mein kyu nahi ho sakta?"

**Nahi ho sakta.** Kyunki dono kaam ke liye **alag models** chahiye:

| | Parse Call | Embedding Call |
|---|---|---|
| **Model** | `gemini-2.5-flash` | `models/embedding-001` |
| **Output** | Structured JSON (text) | Number ki list [0.12, 0.45, ...] |
| **Kaam** | Reasoning + Extraction | Numeric fingerprint banana |

**Analogy:** Jaise aap ek doctor se tooth extraction AUR eye check-up ek saath nahi karwa sakte — alag specialist chahiye. Waise hi parse aur embedding ke liye alag models/methods chahiye.

**Timing:** ~2-3 seconds total for both calls. Acceptable hai — background mein process karo, user ko "Processing..." dikhao.

---

### Cost Estimate (Pure Gemini)

```
10,000 resumes per month
Each resume = 2 calls (parse ~500 tokens + embed ~500 tokens)

Gemini 2.5 Flash: $0.15/1M tokens → ~$1.50
Gemini embedding-001: Free tier (60 req/min free)

Total AI Cost: ~$1.50/month (≈ ₹125)
```

---

## 📌 5. Complete Code Example — RESULT

### FastAPI Worker (Background में चलता है)

यह browser से upload लेने वाला public endpoint नहीं है। Cloud Tasks private/OIDC
authenticated endpoint को call करती है। FastAPI restricted worker DB role से
worker-owned tables में result save करती है।

```text
Cloud Task
  -> private FastAPI endpoint(event_id, parsing_job_id)
  -> processed_events check
  -> resume_parsing_jobs atomic claim/lease
  -> private Storage se document read
  -> OCR/parser/LLM call
  -> output schema validation
  -> BEGIN
       resume_parsed_data immutable INSERT
       resume_parsing_artifacts/events INSERT
       resume_parsing_jobs = completed
       processed_events INSERT
       optional next outbox_events INSERT
     COMMIT
```

Candidate की canonical skill/education/experience automatically overwrite नहीं होगी।
Active merge policy के अनुसार suggestions/evidence बनेंगे। Projection handler बाद में
confirmed canonical tables पढ़कर `candidate_search_profiles` rebuild करेगा।

### Matching Query (pgvector):

```sql
-- Sabse matching candidates nikalo ek job ke against
SELECT
    csp.candidate_id,
    cp.professional_title,
    csp.skill_names,
    1 - (csp.embedding <=> j.embedding) AS semantic_similarity
FROM candidate_search_profiles csp
JOIN candidate_profiles cp ON cp.id = csp.candidate_id
CROSS JOIN jobs j
WHERE j.id = 'job-uuid-here'
  AND csp.embedding IS NOT NULL
  AND j.embedding IS NOT NULL
ORDER BY semantic_similarity DESC
LIMIT 10;
```

---

## 🏁 Summary

```
📄 RESUME UPLOAD
    │
    ▼
Outbox → Webhook → Dispatcher → Cloud Tasks → Private FastAPI
    │
    ▼
Parsed output ──► resume_parsed_data + evidence
    │
    ▼
Confirmed canonical profile ──► candidate_search_profiles
    │
    ▼
Embedding model ──► candidate_search_profiles.embedding
    │
    ▼
Job embedding + filters + FTS + vector similarity ──► HR search
```

Job और candidate embeddings compatible provider/model/version से बनने चाहिए। Provider
और model configuration deploy-time decision है; database में model/version metadata
track करना जरूरी है।
> [← AI research index](README.md) · [Research library](../README.md) · [Main project](../../../README.md)
>
> **Document status:** पुराने project से पूरा preserved architecture/research input। यह final
> implementation contract या accepted ADR नहीं है। इसमें मौजूद flow explanations उपयोगी हैं,
> लेकिन किसी पुराने table/column name, provider/model, synchronous processing assumption या
> pricing detail को implementation में सीधे उपयोग नहीं करना है। Current SQL baseline,
> approved background-worker architecture, shared contracts और future accepted ADR को authority
> माना जाएगा। AI-worker phase में इस document को उन्हीं sources के against refine किया जाएगा।
