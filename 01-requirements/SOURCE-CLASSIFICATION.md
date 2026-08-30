# Old Requirement Source Classification

[← Requirements index](README.md) · [Main project](../README.md)

यह report बताती है कि पुराने `Binay-App` की requirement-related files के साथ क्या
होगा। इसका purpose traceability है; old files को blindly copy नहीं किया गया।

| Old source | Classification | Clean destination/action |
|---|---|---|
| `Requirement/old_Requirement.txt` | MIXED | Full source `source-inputs/REQUIREMENT.txt` में सुरक्षित; current behavior master requirements में, explicit future items roadmap में और unresolved statements decision के बिना लागू नहीं |
| `Requirement/old_All-Features.md` | MIXED | Categorized source `source-inputs/CLIENT-REQUIRED-FUTURE-CATEGORIZED.md` में सुरक्षित; stable capabilities master requirements में, page count/list implementation contract नहीं और explicit future features roadmap में |
| `Requirement/Referral_requirement/Old_CLIENT-MANUAL-REFERRAL-REQUIREMENT.md` | APPROVED CURRENT | Full original detail preserved; separate Hinglish summary navigation के लिए |
| `database/08_ACTIVE-RESUME-CANDIDATE-SEARCH-POLICY.md` | APPROVED PRODUCT DECISION | `PD-002` में migrated |
| `Pending-item/-- pending-items-for-future.md` | MIGRATED + CLEANED | Detailed tracker `future/-- pending-items-for-future.md` में सुरक्षित; referral configuration, email templates और saved candidates current scope में move; duplicated/time-sensitive provider recommendation हटाई गई |
| `Requirement/old_3_AI model vs parser library.md` | RESEARCH/ADR INPUT | पूरा research content `docs/research/ai/AI-MODEL-VS-PARSER-LIBRARY-RESEARCH.md` में सुरक्षित; AI-worker phase में current official pricing/model facts revalidate करके ADR बनेगा |
| `Requirement/old_AI-PIPELINE.md` | ARCHITECTURE INPUT + STALE EXAMPLES | पूरा content `docs/research/ai/AI-PIPELINE-ARCHITECTURE-INPUT.md` में सुरक्षित; AI/embedding ADR और contracts phase में current SQL/architecture के against refine होगा |
| `Requirement/BACKGROUND-WORKER-ARCHITECTURE-OPTIONS-HINGLISH.md` | ACCEPTED CROSS-SERVICE ARCHITECTURE | Full-detail updated copy same filename से `docs/architecture/background-processing/` में migrated |
| `Requirement/BACKGROUND-WORKER-IMPLEMENTATION-PLAN-HINGLISH.md` | CROSS-SERVICE IMPLEMENTATION PLAN | Full-detail updated copy same filename से `docs/architecture/background-processing/` में migrated; component implementation इससे linked रहेगी |
| `Requirement/old_NESTJS-GUIDE.md` | SERVICE CONTRACT INPUT + HISTORICAL CONFLICTS | Useful responsibilities/examples current architecture के अनुसार rewrite करके `04-nestjs-api/project-docs/NESTJS-IMPLEMENTATION-GUIDE.md` में migrated; obsolete mechanisms को corrected-decision list में trace किया गया |
| `Requirement/old_PRODUCTION-SCHEMA-BLUEPRINT.md` | APPROVED DATABASE CONTRACT + STALE DEPLOYMENT STATUS | Current testing-environment baseline, pre-production edit/reset policy और finalized lifecycle rules के अनुसार updated copy `02-database/schema-docs/PRODUCTION-SCHEMA-BLUEPRINT.md` में migrated |
| `Requirement/oldSearch-Strategy.md` | SEARCH ARCHITECTURE INPUT + STALE CLAIMS | Current PostgreSQL hybrid search और evidence-driven external-engine policy के अनुसार rewritten copy `02-database/schema-docs/SEARCH-STRATEGY.md` में migrated; provider choice future ADR में होगी |
| `Requirement/supabase-query-index-use-approach.md` | ENGINEERING PRACTICE + STALE EXAMPLES | Current schema, RLS, testing reset policy and safe planner analysis के अनुसार updated copy `02-database/schema-docs/supabase-query-index-use-approach.md` में migrated; product requirement नहीं |
| Archived `Pending-item` reviews | OUTDATED | New repository में migrate नहीं होंगे |

## Explicitly not migrated as commitments

- approximate `125–130` UI page count;
- “zero infrastructure cost for more than one year” guarantee;
- unverified provider/model/pricing recommendations;
- old table/column names;
- comments/arrows whose approval status is unclear;
- copied agent opinions without executable/client confirmation।

इनमें कोई item बाद में चाहिए तो उसे fresh requirement/ADR decision के रूप में
approve करना होगा।
