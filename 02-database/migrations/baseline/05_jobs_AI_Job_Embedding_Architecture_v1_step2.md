# AI Job Embedding Architecture v1 — Step 2

यही सबसे अच्छा सवाल है। और इसका जवाब ही पूरे architecture को define करता है।

**मेरा final answer है:**

> **Embedding का input केवल JSONB नहीं होगा।**
> **Embedding का input = Jobs table + Related tables + AI JSONB** का combined semantic representation होगा।

यानी मैं केवल JSONB से embedding **नहीं** बनाऊँगा।

---

## हमारे पास कौन-कौन से data sources हैं?

### 1. Jobs Table

```
Title
Description
Responsibilities
Requirements
Benefits
Employment Type
Work Mode
Experience Level
Category
Location
```

ये सब important हैं।

---

### 2. Job Skills

```
Java
Spring Boot
Kafka
Docker
AWS
```

ये भी बहुत important हैं।

---

### 3. Job Categories

```
Engineering
Backend
```

ये भी semantic meaning देते हैं।

---

### 4. AI JSONB

```
Domain:
FinTech

Architecture:
Microservices

Soft Skills:
Leadership

Inferred Concepts:
Distributed Systems
```

ये AI की understanding है।

---

# तो Embedding Builder क्या करेगा?

वह इन सभी sources को combine करेगा।

उदाहरण:

```
Title:
Senior Java Developer

Category:
Engineering > Backend

Employment Type:
Full Time

Work Mode:
Hybrid

Experience:
7–10 years

Location:
Pune, India

Required Skills:
Java
Spring Boot
Kafka
Docker
AWS

Responsibilities:
Design scalable backend services
Mentor junior developers

Benefits:
Health Insurance
WFH

AI Inferred:
Domain: FinTech
Architecture: Microservices
Concepts: Distributed Systems, Event Driven Architecture
```

**यही पूरा semantic text** embedding model को जाएगा।

---

## फिर JSONB की ज़रूरत क्यों?

JSONB का काम अलग है।

वह explainable AI profile है।

उदाहरण:

```
"Why did AI rank this candidate?"

→ क्योंकि inferred.domain = FinTech
→ क्योंकि required_skills में Kafka है
→ क्योंकि leadership inferred है
```

यह JSONB से मिलेगा।

Embedding यह नहीं बता सकती कि match क्यों हुआ।

---

## इसलिए responsibilities साफ़ हैं

### Jobs table

Source of truth.

### Related tables

Skills, Categories, Locations जैसी structured information.

### JSONB

AI द्वारा निकाली गई अतिरिक्त understanding (जो सीधे text में नहीं लिखी हो सकती)।

### Embedding

इन सबका semantic mathematical representation.

---

## इसलिए मैं production में Embedding Builder ऐसे लिखूँगा:

```
Input

Jobs Table
      +
Job Skills
      +
Job Categories
      +
Job Locations
      +
AI JSONB
      │
      ▼
Embedding Builder
      │
      ▼
One Clean Semantic Text
      │
      ▼
Embedding API
      │
      ▼
768-Dimensional Vector
```

### यही approach मैं तुम्हारे job portal के लिए recommend करता हूँ।

क्यों?

* **Jobs table** factual information देता है।
* **Related tables** normalized business data देती हैं।
* **AI JSONB** AI की inferred understanding जोड़ता है।
* **Embedding Builder** इन सबको एक high-quality semantic text में बदलता है।

इससे embedding सबसे rich और accurate बनती है, और भविष्य में अगर तुम नया field जोड़ो (जैसे `industry`, `security_clearance`, `travel_required`), तो केवल Builder update करना होगा—पूरी AI pipeline नहीं। यही scalable architecture बड़े production systems में अपनाया जाता है।



## Final current decision

Embedding input = Jobs table + Job Skills + Job Category + Job Locations + AI JSONB -> Embedding Builder -> Semantic Text -> Embedding Model -> 768 Vector -> jobs.embedding.

## Background execution flow

HR submits job.

NestJS validates and saves `jobs`, `job_skills`, `job_locations` and the outbox
event in one transaction.

Supabase asynchronous Database Webhook wakes the NestJS Outbox Dispatcher. The
dispatcher places a deterministic task in Google Cloud Tasks, which calls the
private Cloud Run FastAPI worker.

FastAPI Task 1 generates the validated AI Job Profile JSONB. FastAPI Task 2
invokes the Embedding Builder.

Builder combines business data (jobs, skills, category, locations) with AI JSONB extracted/inferred fields.

Builder ignores metadata like confidence/model/timestamps.

Builder creates one clean semantic text.

Semantic text is sent to the embedding model.

The configured model returns a 768-dimensional vector.

Store vector plus `embedding_model`, `embedding_version` and
`embedding_generated_at` in `jobs`.

## Compatibility rule

Job, candidate and search-query vectors are comparable only when they use the
same compatible embedding provider/model/version and dimension. Equal `768`
dimensions alone do not make vectors compatible. Incompatible vectors must be
skipped or regenerated through a reviewed re-embedding workflow.

## Recommendation

Create JobEmbeddingBuilderService and ResumeEmbeddingBuilderService so both use the same semantic rules.
