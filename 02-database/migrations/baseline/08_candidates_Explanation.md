# 08 Candidates — Detailed Hinglish Explanation

[Signup, role aur `candidate_profiles` row ka exact flow](#15-signup-role-aur-candidate_profiles-row-ka-exact-flow)

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

## 15. Signup, role aur `candidate_profiles` row ka exact flow

### 15.1 Signup ke baad database flow

Candidate signup ke baad `candidate_profiles` row NestJS manually create nahi karta.
Supabase Auth aur database triggers ye flow complete karte hain:

```text
Next.js
  -> NestJS signup API
  -> Supabase Auth: auth.users INSERT
  -> DB trigger: public.handle_new_user()
  -> public.users INSERT
  -> DB trigger: create_candidate_profile_on_user_signup
  -> candidate_profiles INSERT (sirf role = candidate ke liye)
```

`handle_new_user()` trusted server-side `application_role` ko `candidate`, `employer`,
`hr` ya `admin` mein resolve karta hai. Missing ya invalid role safely `candidate`
ban jata hai. Uske baad `create_empty_candidate_profile()` sirf tab ye row insert
karta hai jab `NEW.role = 'candidate'` ho:

```sql
INSERT INTO public.candidate_profiles (user_id)
VALUES (NEW.id)
ON CONFLICT (user_id) DO NOTHING;
```

Authoritative implementation:

- [`handle_new_user()`](./03_users_auth.sql)
- [`create_empty_candidate_profile()`](./08_candidates.sql)
- [`create_candidate_profile_on_user_signup`](./08_candidates.sql)

### 15.2 Initial `candidate_profiles` row mein kya hota hai?

Trigger sirf `user_id` explicitly set karta hai. Baaki values schema defaults ya
`NULL` se aati hain:

| Field | Initial value |
|---|---|
| `id` | `gen_random_uuid()` |
| `user_id` | `public.users.id` |
| `profile_revision` | `1` |
| `is_open_to_work` | `TRUE` |
| `willing_to_relocate` | `FALSE` |
| `willing_to_travel` | `FALSE` |
| `remote_experience` | `FALSE` |
| `salary_currency` | `INR` |
| Profile/location fields | `NULL` |
| `profile_completed_at` | `NULL` |

Is row ka purpose empty onboarding profile ready rakhna hai. Resume upload ke time
new candidate profile row nahi banti; existing row ke saath document link hota hai.

### 15.3 Role ke hisaab se profile row

Current schema mein `users.role` single application role hai:

```text
candidate | employer | hr | admin
```

| Signup ya role situation | `candidate_profiles` row |
|---|---|
| Direct `candidate` signup | Automatically create hoti hai |
| Direct `employer` signup | Automatically create nahi hoti |
| Direct `hr` signup | Automatically create nahi hoti |
| Direct `admin` signup | Automatically create nahi hoti |
| Candidate signup ke baad role `employer`/`hr` hota hai | Existing row automatically delete nahi hoti |

Trigger `AFTER INSERT ON public.users` hai; role update par ye dobara nahi chalta.
`candidate_profiles.user_id` unique hone ki wajah se same user ke liye duplicate
profile row bhi nahi banti.

Important: current code ye assume nahi karta ki har employer ya HR pehle candidate
ke roop mein register karega. Dono flows possible hain:

```text
Direct employer/HR signup
  -> users row
  -> candidate_profiles row nahi

Candidate signup -> later role change
  -> users.role update
  -> existing candidate_profiles row remain
```

Employer/HR ke company access ke liye `users`, `companies` aur `company_members`
tables use hote hain. Current active schema mein `user_roles` multi-role table nahi hai.

### 15.4 Resume upload aur profile confirmation ka relation

```text
Signup
  -> candidate_profiles row create

Resume upload
  -> uploaded_documents row
  -> candidate_profile_documents mein link

Candidate confirm
  -> existing candidate_profiles UPDATE
  -> canonical fact tables mein writes
  -> profile_revision bump
  -> candidate.profile.changed outbox event
```

Isliye `candidate_profiles` creation aur resume processing alag lifecycle steps hain:
profile row signup par create hoti hai, jabki resume upload/confirm us existing row ko
use aur update karta hai.
