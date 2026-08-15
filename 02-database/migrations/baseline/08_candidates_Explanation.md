# 08 Candidates — Detailed Hinglish Explanation

## 1. Is file ka kaam

`08_candidates.sql` candidate ki current editable professional identity rakhti
hai. Resume AI output aur candidate-confirmed profile अलग रहते हैं.

```text
Resume parsed evidence
        ├── optional review/merge → Canonical candidate profile
        └── latest active profile resume facts
                         ↓
Canonical profile + latest active resume
                         ↓ revision/resume identity + outbox
Search projection + embedding
```

## 2. Four data layers

| Layer | Tables | Meaning |
|---|---|---|
| Identity | `candidate_profiles` | Basic current profile/preferences |
| Canonical facts | skills, experience, education etc. | Candidate-editable truth |
| Evidence | four evidence tables | Information kahan se aayi |
| Projection/audit | search profile + history | Search speed and change trail |

Canonical tables candidate की editable truth हैं। Approved active-resume policy के अनुसार
latest active profile resume के parsed facts canonical rows को overwrite किए बिना search
projection में additional, clearly-labelled facts की तरह शामिल हो सकते हैं।

## 3. `candidate_profiles`

Signup/onboarding ke बाद one registered candidate ki one row.

| Field group | Example | Writer/time |
|---|---|---|
| Identity | title, summary | Candidate onboarding/profile API |
| Location | city/state/country | Candidate |
| Preferences | work mode, relocation, travel | Candidate |
| Availability | notice period, available date | Candidate |
| Salary expectation | min/max/currency | Candidate |
| Work eligibility | authorization/sponsorship | Candidate |
| Search visibility | `is_open_to_work` | Candidate |
| Revision | `profile_revision` | NestJS DB function once per save |
| Lifecycle | completed/created/updated/deleted | Service/database |

Example:

```json
{
  "professional_title": "Senior Java Developer",
  "city": "Noida",
  "preferred_work_mode": "hybrid",
  "remote_experience": true,
  "notice_period_days": 30,
  "expected_salary_min": 1800000,
  "expected_salary_max": 2400000,
  "is_open_to_work": true,
  "profile_revision": 7
}
```

## 4. Profile documents and links

### `candidate_profile_documents`

Uploaded document ko candidate profile role/version se जोड़ती है:

```text
Candidate Rahul + Resume + Version 1 + not current
Candidate Rahul + Resume + Version 2 + current
```

Only one active current document per role. File registry `06` mein रहती है.

### `candidate_links`

LinkedIn/GitHub/portfolio/website jaise extensible links:

```json
{
  "link_type": "github",
  "label": "My GitHub",
  "url": "https://github.com/rahul",
  "primary_source_type": "candidate_manual"
}
```

## 5. Canonical fact tables

| Table | Example data |
|---|---|
| `candidate_skills` | Java, Spring Boot, Docker |
| `candidate_experiences` | ABC — Backend Developer |
| `candidate_educations` | B.Tech — Computer Science |
| `candidate_certifications` | AWS Developer Associate |
| `candidate_projects` | Payment Processing Platform |
| `candidate_languages` | English — Professional |
| `candidate_awards` | Employee of the Year |

Common important fields:

```text
candidate_id
primary_source_type
verification_status
candidate_confirmed_at
created_at / updated_at / deleted_at
```

`primary_source_type` example:

```text
candidate_manual
resume_ai
candidate_corrected
assessment
recruiter_verified
```

## 6. Skill example: manual vs AI

### Manual skill

```json
{
  "candidate_id": "candidate-rahul",
  "skill_id": "skill-java",
  "primary_source_type": "candidate_manual",
  "verification_status": "self_declared",
  "candidate_confirmed_at": "2026-08-13T10:00:00Z"
}
```

### AI suggestion accepted

```text
resume_parsed_data says Docker
→ candidate reviews/accepts
→ canonical candidate_skills row
→ candidate_skill_evidence row links resume/result
```

AI data blindly profile overwrite नहीं करती.

## 7. Evidence tables

Dedicated evidence:

```text
candidate_skill_evidence
candidate_experience_evidence
candidate_education_evidence
candidate_certification_evidence
```

Example evidence:

```json
{
  "candidate_skill_id": "candidate-skill-docker",
  "evidence_type": "resume_ai",
  "document_id": "doc-101",
  "parsing_result_id": "result-301",
  "extracted_value": {"skill": "Docker"},
  "confidence_score": 82.5,
  "status": "active"
}
```

Payload/source/confidence immutable. Allowed status:

```text
active → superseded
active → rejected
active → invalidated
```

Terminal row reactivate नहीं; new evidence insert.

## 8. Candidate Accept/Correct/Reject flow

```text
AI extracted: Java, Docker, 5 years
→ UI review
→ Java Accept
→ Docker Reject
→ 5 years Correct to 4 years
```

One transaction:

```text
canonical facts write
evidence transitions/additions
profile_change_history rows
bump_candidate_profile_revision() exactly once
candidate.profile.changed outbox event
```

Five changed rows still one logical revision.

## 9. `profile_change_history`

Har changed entity ka before/after audit:

```json
{
  "profile_revision": 8,
  "entity_type": "candidate_skill",
  "entity_id": "candidate-skill-id",
  "operation": "insert",
  "change_source": "candidate_manual",
  "before_data": null,
  "after_data": {"skill": "Kafka"}
}
```

History update/delete नहीं होगी.

## 10. `candidate_search_profiles`

Recruiter search ke लिए rebuildable projection:

```text
professional title
skills
normalized titles
locations
total experience
highest education
search_vector
embedding
active resume document/result identity
fact source/trust labels
```

Kaun likhega: background projection worker, candidate नहीं.

Kab:

```text
Canonical profile save OR active profile resume selection/parse completion
→ outbox
→ worker loads active canonical facts + latest active resume parse
→ duplicate fact पर confirmed canonical source को priority
→ normalized search text/vector/embedding
→ current profile revision + active resume document/result identity check
→ projection upsert
```

Example:

```json
{
  "candidate_id": "candidate-rahul",
  "source_profile_revision": 8,
  "projection_revision": 8,
  "active_resume_document_id": "resume-document-v2",
  "active_resume_parsing_result_id": "resume-result-v2",
  "professional_title": "Senior Java Developer",
  "skill_names": ["Java", "Spring Boot", "Kafka"],
  "fact_sources": {
    "skills": {
      "Java": "canonical_confirmed",
      "Kafka": "active_resume"
    }
  },
  "total_experience_years": 4.2,
  "embedding_model": "embedding-model",
  "embedding_version": 1
}
```

`embedding_model` और numeric `embedding_version` job embedding के compatible contract से
match होने चाहिए। अलग/incompatible embedding spaces को similarity query में compare नहीं करेंगे।

## 11. Stale worker example

```text
Worker revision 8 bana raha hai
Candidate edit → revision 9
Worker write se pehle current revision dekhta hai
8 != 9 → stale vector discard
```

Active resume race में worker revision के साथ current resume document/result identity भी
दोबारा verify करेगा। पुराना resume worker newer active resume projection overwrite नहीं कर सकता।

## 12. Delete behavior

Candidate “remove skill”:

```text
DELETE row ❌
deleted_at = NOW() ✅
```

Search worker केवल active rows (`deleted_at IS NULL`) लेगा.

## 13. Kaun kisko call karta hai?

| Caller | Target | Purpose |
|---|---|---|
| Next.js | NestJS Candidates API | Profile view/edit/review |
| NestJS | Canonical tables | Validated facts save |
| NestJS | Revision function/history/outbox | Atomic logical save |
| AI worker/service | Evidence tables | Suggestions/evidence append |
| Projection worker | Embedding service | Candidate vector |
| Projection worker | Canonical tables + active resume parse | Current searchable inputs read |
| Projection worker | Search profile | Source-labelled latest projection upsert |

## 14. One-line memory rule

> `08` में candidate की current editable truth सुरक्षित रहती है; recruiter search projection
> confirmed canonical facts और latest active profile resume के clearly-labelled parsed facts से बनती है।
