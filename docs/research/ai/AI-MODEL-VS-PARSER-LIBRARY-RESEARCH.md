# AI Model vs Parser Library — Resume Parsing Options & Cost Comparison

> **Last updated:** July 2026  
> **Purpose:** Compare all major resume parsing options in the market — dedicated APIs, LLMs, document services, and open-source libraries — with published pricing so you can explain choices clearly to the client and pick the right stack for Binay-App.

---

## Short answer

Yes — you can use AI models **or** dedicated resume parsers **or** a **hybrid** of both.

For **Binay-App** (1,000+ concurrent uploads, cost-sensitive, AI matching required), the recommended stack remains:

1. **Fast track:** lightweight text extraction (PyMuPDF / Docling / OCR) — instant name for UI  
2. **Deep track:** **Gemini 2.5 Flash** (or **GPT-4o mini** as fallback) — structured JSON extraction  
3. **Embeddings:** **Gemini `embedding-001`** — pgvector matching (see `AI-PIPELINE.md`)

Dedicated parsers (Affinda, RChilli, Textkernel) are better when you want **pre-built HR field taxonomy** and **zero prompt engineering**, but they cost **10–100× more per resume** than raw LLM parsing at MVP scale.

---

## Five categories of resume parsing in the market

| Category | What it is | Best for |
|---|---|---|
| **A. Dedicated resume parsing APIs** | Purpose-built CV/resume extractors with HR taxonomies | ATS integrations, enterprise HR tech, multilingual at scale |
| **B. General-purpose LLM APIs** | Send PDF/text → get structured JSON via prompt + schema | Flexible extraction, gap analysis, screening questions, lowest cost at MVP volume |
| **C. Cloud document intelligence** | OCR + layout + forms extraction (not resume-specific) | Text extraction layer before LLM; scanned PDFs |
| **D. Document-to-LLM pipelines** | Parse document to markdown/JSON, then optionally extract | RAG pipelines, complex layouts, agentic parsing |
| **E. Open-source / Python libraries** | Local parsers, OCR, NLP — no per-call API fee | Fast track, cost control, deterministic fields |

---

## Category A — Dedicated resume parsing APIs

These are **specialized products** built for recruitment. They return structured candidate profiles (skills, experience, education, job titles) without you writing extraction prompts.

| Provider | Type | Starting price | Approx. cost per resume | Free trial | Notes |
|---|---|---|---|---|---|
| **[Affinda](https://www.affinda.com/recruitment-ai-pricing/)** | Resume + job parser API | **$800/yr** (6,000 credits) | **~$0.07–0.13** at low volume; **<$0.01** at millions/yr | 14 days | Credit-based; Docker self-host option; 95%+ accuracy claimed |
| **[RChilli](https://www.rchilli.com/pricing)** | Resume + job parser API | **$75/mo** (500 credits) | **~$0.15/resume** at entry tier; drops with volume | 100 free credits | 40+ languages; 200+ resume fields; Oracle ecosystem |
| **[Textkernel](https://www.textkernel.com/)** (Sovren) | Enterprise parser + taxonomy | **$99/mo** (500 credits) | **~$0.20/resume** at entry; custom at scale | 500 credits | Skills/job-title normalization; LLM parser add-on (higher cost, higher accuracy) |
| **[Daxtra](https://www.daxtra.com/products/resume-parsing-software/)** | Enterprise parser + matcher | **Custom quote** | Contact sales | Demo available | 150+ fields; 40+ languages; on-premise option |
| **[HireAbility ALEX](https://www.hireability.com/)** | Grammar-based parser | **Custom quote** | Contact sales | 30 parses / 30 days | Privacy-first (vendor claims no storage); 50+ languages |
| **[Hirize](https://www.hirize.ai/)** | LLM-first parsing API | **Credit-based** | Confirm on vendor site | Free trial | Single API call → structured JSON; modern dev UX |

### Affinda — published tiers (annual)

| Annual credits | Annual price (USD) | Cost per parse |
|---|---|---|
| 6,000 | $800 | ~$0.133 |
| 36,000 | $2,500 | ~$0.069 |
| 240,000 | $9,000 | ~$0.038 |
| 780,000 | $18,000 | ~$0.023 |
| 780,000+ | Tailored | **<$0.01** |

### RChilli — published tiers

| Plan | Credits | Price |
|---|---|---|
| Standard (monthly) | 500 | $75/mo |
| Standard (annual) | 6,000 | $75/mo equivalent packs |
| Startup incubator | 3,000 | $150 one-time |

**When to choose Category A:** You need a **turnkey HR parser** with skills taxonomy, job-title normalization, and compliance — and you are willing to pay **$0.07–0.20+ per resume** instead of building prompts yourself.

---

## Category B — General-purpose LLM APIs (DIY resume parsing)

You send resume text (or PDF as multimodal input) with a JSON schema prompt. The model returns structured fields. This is what **Binay-App's `AI-PIPELINE.md`** describes.

> **Typical resume parse:** ~1,000–2,000 input tokens + ~300–800 output tokens (varies by resume length and schema size).

### LLM API pricing (per 1M tokens, July 2026)

| Model / Provider | Input ($/1M) | Output ($/1M) | Context | Multimodal (PDF/image) | Best resume use |
|---|---|---|---|---|---|
| **Gemini 2.5 Flash-Lite** | $0.10 | $0.40 | 1M | Yes | Cheapest Gemini tier; bulk parsing |
| **Gemini 2.5 Flash** ⭐ | $0.30 | $2.50 | 1M | Yes | **Current Binay-App choice** — parse + vision |
| **Gemini 2.5 Pro** | $1.25 | $10.00 | 1M | Yes | Hard resumes, complex reasoning |
| **Gemini 3.6 Flash** | $1.50 | $7.50 | 1M | Yes | Newer tier; higher quality, higher cost |
| **GPT-4o mini** | $0.15 | $0.60 | 128K | Yes | Cheapest major LLM for text parsing |
| **GPT-4o** | $2.50 | $10.00 | 128K | Yes | Higher accuracy; expensive at scale |
| **Claude Haiku 4.5** | $1.00 | $5.00 | 200K | Yes | Fast Anthropic tier |
| **Claude Sonnet 4.6** | $3.00 | $15.00 | 200K | Yes | Strong reasoning; premium cost |
| **Claude Opus 4.6** | $5.00 | $25.00 | 200K | Yes | Overkill for bulk parsing |
| **Azure OpenAI** | Same as OpenAI ± markup | Same | Same | Yes | Enterprise compliance, private endpoints |
| **AWS Bedrock** | Varies by model | Varies | Varies | Yes | Multi-model gateway in AWS |

### Estimated cost per resume (parse only, 1,500 input + 500 output tokens)

| Model | Cost per resume | 1,000 resumes/mo | 5,000 resumes/mo | 10,000 resumes/mo |
|---|---|---|---|---|
| **Gemini 2.5 Flash-Lite** | ~$0.00035 | **~$0.35** | **~$1.75** | **~$3.50** |
| **GPT-4o mini** | ~$0.00053 | **~$0.53** | **~$2.65** | **~$5.30** |
| **Gemini 2.5 Flash** | ~$0.00170 | **~$1.70** | **~$8.50** | **~$17.00** |
| **Gemini 2.5 Pro** | ~$0.00688 | **~$6.88** | **~$34.40** | **~$68.80** |
| **GPT-4o** | ~$0.00875 | **~$8.75** | **~$43.75** | **~$87.50** |
| **Claude Haiku 4.5** | ~$0.00400 | **~$4.00** | **~$20.00** | **~$40.00** |
| **Affinda (entry tier)** | ~$0.133 | **~$133** | **~$665** | **~$1,330** |
| **RChilli (entry tier)** | ~$0.150 | **~$150** | **~$750** | **~$1,500** |

> **Note:** Add a second call for **embeddings** (`Gemini embedding-001` — largely free tier / very low cost). Full pipeline ≈ **2× API calls per resume** but embedding cost is negligible compared to parsing.

### Cost-saving tips for LLM parsing

| Technique | Savings |
|---|---|
| **Batch API** (OpenAI, Google) | ~50% off for non-real-time jobs |
| **Prompt / context caching** | Up to ~90% off repeated system prompts |
| **Hybrid routing** | Fast parser for clean PDFs; LLM only for failed/low-confidence |
| **Flash-Lite / GPT-4o mini** for bulk; Flash/Pro for retry only | 60–80% vs always using Pro |

**When to choose Category B:** You want **maximum flexibility**, **lowest cost at MVP volume**, and you already have a **FastAPI + queue** pipeline (as in Binay-App). Best value for 1,000–50,000 resumes/month.

---

## Category C — Cloud document intelligence (OCR + layout)

These extract **text, tables, and layout** from documents. They are **not resume-specific** — you still need an LLM or custom logic to map fields to candidate profile.

| Provider | Service | Pricing (approx.) | Cost per 2-page resume |
|---|---|---|---|
| **[Azure Document Intelligence](https://azure.microsoft.com/pricing/details/ai-document-intelligence/)** | Read (OCR) | **$1.50 / 1,000 pages** | ~$0.003 |
| | Layout / Prebuilt | **$10 / 1,000 pages** | ~$0.020 |
| | Custom extraction | **$30 / 1,000 pages** | ~$0.060 |
| **[AWS Textract](https://aws.amazon.com/textract/pricing/)** | Detect text (OCR) | **$1.50 / 1,000 pages** | ~$0.003 |
| | Analyze forms + tables | **$15–70 / 1,000 pages** | ~$0.030–0.140 |
| **Google Document AI** | OCR + specialized parsers | Custom / usage-based | Contact Google Cloud |

**Free tiers:** Azure gives **500 pages/month free**; AWS Textract has a **90-day free tier** for new accounts.

**When to choose Category C:** Scanned PDFs, image resumes, or poor-quality documents where you need reliable OCR **before** sending text to an LLM. Use as **Stage 1** in the hybrid pipeline — not as the full parser alone.

---

## Category D — Document-to-LLM pipeline services

These convert documents to clean markdown/JSON; extraction may be a separate step.

| Provider | Pricing model | Cost per page (approx.) | Free tier |
|---|---|---|---|
| **[LlamaParse](https://www.llamaindex.ai/pricing)** | Credits: **$1.25 / 1,000 credits** | Fast: **$0.00125** · Cost-effective: **$0.00375** · Agentic: **$0.0125** · Agentic Plus: **$0.05625** | 10K credits/mo |
| **[Unstructured.io](https://unstructured.io/pricing)** | **$0.03/page** after free tier | **$0.030** | 15,000 pages/mo free |

**When to choose Category D:** Complex layouts (multi-column, tables, charts) where PyMuPDF fails but you don't want a dedicated resume API. Good **middle layer** between OCR and LLM.

---

## Category E — Open-source / Python libraries (no per-resume API fee)

| Library / Tool | Cost | Strengths | Weaknesses |
|---|---|---|---|
| **PyMuPDF (fitz)** | Free | Fast PDF text extraction | Struggles with scans, columns, graphics |
| **python-docx** | Free | Native DOCX parsing | DOCX only |
| **Docling** (IBM) | Free | Strong layout + table extraction | Heavier; needs GPU for speed at scale |
| **spaCy** | Free | NLP, NER, skill matching | Needs training/rules for resume-specific fields |
| **Tesseract OCR** | Free | Scanned PDF / image text | No structure; noisy output |
| **pdfplumber** | Free | Table extraction from PDFs | Slower; layout-dependent |
| **LangChain / Instructor** | Free (orchestration) | Structured output from any LLM | Not a parser itself |

**Infrastructure cost only:** You pay for **CPU/RAM** on your worker (e.g. Cloud Run), not per document. At 1,000 resumes in a burst, queue + horizontal workers matter more than library choice.

**When to choose Category E:** **Fast track** name extraction, cost control, and deterministic preprocessing before any paid API call.

---

## Side-by-side: which option for Binay-App?

| Requirement | Best fit |
|---|---|
| Handle 1,000 uploads at once without crashing | **Queue + workers** (not model choice) — Redis/BullMQ or Google Cloud Tasks |
| Keep cost minimum | **Hybrid:** PyMuPDF/Docling (free) + **Gemini 2.5 Flash-Lite or Flash** (~$2–17/mo for 10K resumes) |
| Parse messy / multilingual resumes | **Gemini 2.5 Flash** (multimodal) or **Affinda/RChilli** if budget allows |
| AI match scoring + gap analysis | **LLM required** — dedicated parsers don't replace this; use Gemini + pgvector |
| Screening question generation | **LLM required** — Gemini / GPT-4o mini |
| Enterprise client wants "industry standard parser" | **Textkernel** or **Daxtra** as optional premium tier |
| Scanned/image resumes | Add **Azure Read OCR** or **Tesseract** as Stage 0 (~$0.003/resume) |

---

## Recommended architecture for Binay-App (unchanged — now with cost proof)

```
📄 RESUME UPLOAD
      │
      ▼
┌─────────────────────────────────┐
│ Stage 0: PyMuPDF / Docling      │  Cost: ~$0 (worker compute only)
│ → instant name for UI           │  Latency: <500ms
└─────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────┐
│ Stage 1 (async queue):          │
│ Gemini 2.5 Flash                │  Cost: ~$0.0017/resume
│ → structured JSON               │  (or GPT-4o mini @ ~$0.0005)
└─────────────────────────────────┘
      │
      ├──────────────────────────────────┐
      ▼                                  ▼
┌──────────────────┐          ┌──────────────────────┐
│ PostgreSQL JSONB │          │ Gemini embedding-001 │
│ resume_data      │          │ → pgvector           │  Cost: ~$0/resume (free tier)
└──────────────────┘          └──────────────────────┘
      │
      ▼ (optional — low confidence only)
┌─────────────────────────────────┐
│ Retry with Gemini 2.5 Pro         │  Cost: ~$0.007/resume (only ~5–10% of docs)
│ OR Affinda API fallback           │  Cost: ~$0.13/resume (premium clients only)
└─────────────────────────────────┘
```

### Monthly cost estimate — full Binay-App pipeline

Assuming **5,000 resumes/month**, 2-page average, hybrid pipeline:

| Component | Monthly cost |
|---|---|
| Cloud Run worker (parsing) | ~$0–5 (free tier / low usage) |
| Google Cloud Tasks (queue) | $0 (free tier) |
| Gemini 2.5 Flash (parse) | **~$8.50** |
| Gemini embedding-001 | **~$0–1** |
| AWS RDS PostgreSQL (db.t4g.micro) | **~$10** |
| **Total** | **~$18–25/month** |

Compare to **RChilli-only** at 5,000 parses: **~$750/month** minimum at entry tier.

---

## What is the difference between AI models and Python libraries?

### Option 1: Python libraries
- Faster, cheaper, more deterministic
- Best for: basic extraction, predictable fields, fast-track name/email
- Examples: PyMuPDF, Docling, spaCy, Tesseract

### Option 2: AI models / dedicated parsers
- Better for inconsistent formats, reasoning, ambiguous fields, multilingual content
- Best for: full profile extraction, gap analysis, screening questions, semantic matching
- Examples: Gemini, GPT-4o mini, Affinda, RChilli, Textkernel

### Option 3: Hybrid (recommended)
1. Library/OCR for fast text + name extraction  
2. LLM for deep structured parsing in background queue  
3. Dedicated parser API only as **fallback** for low-confidence or enterprise tier  

This gives the best balance of **cost, speed, accuracy, and scalability**.

---

## How other job portals parse resumes

Most large platforms use a combination of:

- OCR engines (Azure, Textract, Tesseract)
- Document parsers (PyMuPDF, Docling, LlamaParse)
- NLP pipelines (spaCy, custom NER)
- AI/LLM extraction (Gemini, GPT, Claude)
- Dedicated parsers (Textkernel, Daxtra) at enterprise tier
- Rule-based extraction for known fields
- Human review for edge cases

---

## Client-friendly summary

> "We can use dedicated resume parsers like Affinda or RChilli, but they cost roughly **$0.07–0.20 per resume** at MVP volumes. For our scale target, a **hybrid approach** is more practical: free local parsing for speed, then **Gemini AI** for full extraction at about **$0.002 per resume** — roughly **50–100× cheaper**. Dedicated parsers can be added later as a premium accuracy tier for enterprise clients."

---

## Decision matrix — quick pick

| If your priority is… | Choose |
|---|---|
| **Lowest cost** | PyMuPDF + GPT-4o mini or Gemini Flash-Lite |
| **Best quality / multimodal PDFs** | Gemini 2.5 Flash (current stack) |
| **Zero prompt work, HR taxonomy built-in** | Affinda or RChilli |
| **Enterprise compliance + skills ontology** | Textkernel or Daxtra |
| **Privacy / no document storage** | HireAbility (custom) |
| **Scanned PDFs** | Azure Read OCR + LLM |
| **Complex layouts (tables, columns)** | Docling or LlamaParse + LLM |

---

## Bottom line

- **Yes**, many AI models and dedicated parsers can handle resume parsing.  
- **For Binay-App**, stick with the **hybrid queue architecture** in `4_resume_architecture.md` and **Gemini** in `AI-PIPELINE.md` — it is the most cost-effective at your target volume.  
- **Dedicated parsers** are worth evaluating only if a client explicitly pays for premium accuracy or requires vendor-certified HR taxonomies.  
- **Always verify pricing** on vendor websites before signing — rates in this document reflect **published prices as of July 2026** and change frequently.

---

## Related documents

| File | Topic |
|---|---|
| `4_resume_architecture.md` | Queue-based async parsing architecture |
| `AI-PIPELINE.md` | Gemini parse + embedding + pgvector flow |
| `Pending_Confirmation.md` | Production infra cost estimates |
| `Search-Strategy.md` | PostgreSQL FTS + pgvector search layers |
> [← AI research index](README.md) · [Research library](../README.md) · [Main project](../../../README.md)
>
> **Document status:** यह पुराने project से पूरी तरह सुरक्षित रखा गया research input है। यह
> approved product requirement या accepted Architecture Decision Record (ADR) नहीं है। इसमें
> लिखे model names, capabilities, pricing और provider recommendations को FastAPI/AI-worker
> implementation से पहले current official sources से दोबारा verify करना जरूरी है।
