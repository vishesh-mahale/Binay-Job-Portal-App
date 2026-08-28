# PD-002 — Active Resume Contribution to Recruiter Search

[← Requirements index](../README.md) · [Main project](../../README.md)

## Status

`APPROVED`

## Decision

Candidate को हर नए resume के facts manually canonical profile में copy करने के लिए
force नहीं करना है। Recruiter-search projection input:

```text
confirmed editable canonical profile
+ latest active profile resume का parsed data
→ normalized candidate search projection
→ filters + keyword vector + semantic embedding
```

Resume canonical tables silently overwrite नहीं करेगी।

## Candidate choice

## Profile resume library limit and removal policy

The candidate's **profile-resume library has a maximum of 10 active library resumes**.
This limit applies only to resumes currently visible/manageable in the candidate's
profile library. Application-only documents and archived historical documents are
not counted in this limit.

When a candidate removes a resume from the library:

- the resume is hidden/archived from the profile library;
- it is no longer selectable as an active profile resume;
- if it has never been used by an application, it may enter the normal retention
  cleanup flow;
- if it is linked to an application or immutable snapshot, the document, storage
  object and historical links are preserved;
- application history and submitted snapshots are never deleted through the
  candidate-facing library action.

Therefore, “remove from library” is a soft archive operation, not an immediate
physical deletion. A later audited retention process may permanently purge files
only after all legal, audit and application-retention references are clear.

If the library already contains 10 resumes, the candidate must archive/remove an
existing library item before adding another profile-library resume. A new
application-specific tailored resume remains allowed separately, subject to file
size, upload-rate and storage-abuse limits.

### Application-only resume promotion

An application-specific resume **cannot be promoted directly** into the
candidate's profile-resume library. It remains limited to the related application
and its immutable historical snapshot. If the candidate wants to use that content
as a profile resume, they must upload it again through the normal profile-resume
flow and explicitly select it for the library/active-profile role. This prevents
an application submission from silently changing recruiter-search visibility.

Upload के समय candidate “Use as active profile resume” select कर सके:

- selected: current profile resume version बने, parse के बाद global recruiter-search
  projection enrich/rebuild हो;
- not selected/application-only: global recruiter search को affect न करे।

एक candidate/document role पर एक current active document हो; पुराना resume historical
version रह सकता है।

### Option selected होने पर

- Resume `candidate_profile_documents` में current profile resume बनेगा।
- पुराना current resume historical version रहेगा, लेकिन current नहीं रहेगा।
- New resume background में parse होगा।
- Parsed resume-derived facts candidate search projection में include हो सकेंगे।
- Canonical candidate tables automatic overwrite नहीं होंगी।

### Option selected नहीं होने पर

- Document upload और application-specific use हो सकता है।
- वह global recruiter search projection को affect नहीं करेगा।
- Application-specific resume केवल संबंधित application और authorized historical view में उपयोग होगा।

## Detailed example

Candidate की confirmed canonical profile:

```text
Angular
React
```

Candidate नया active profile resume upload करता है जिसमें:

```text
Angular
React
Java
```

Successful parsing और current projection rebuild के बाद searchable facts:

```text
Angular -> confirmed profile
React   -> confirmed profile
Java    -> latest active resume
```

अब authorized HR `Java` search करे तो candidate result में आ सकता है, भले उसने Java को manually
`candidate_skills` में add न किया हो। Recruiter UI source/trust स्पष्ट दिखाएगी:

```text
Java  — Found in latest active resume
React — Confirmed profile skill
```

Resume-derived match recruiter को evidence देता है, confirmed canonical claim नहीं बनता।

## Resume upload के बाद क्या बदलेगा?

| Data | Behavior |
|---|---|
| Resume document/version | New version/current-role selection update होगा |
| Resume parsing result | New immutable result बनेगा |
| Canonical profile tables | Automatic overwrite नहीं होंगी |
| Candidate search projection | Current active resume parse के बाद rebuild होगी |
| Candidate embedding | Compatible current projection के लिए rebuild होगी |
| Candidate search vector | Rebuilt projection में update होगा |
| पुरानी submitted applications | कभी नहीं बदलेंगी |

## Background processing flow

```text
Candidate "Use as active profile resume" के साथ upload करता है
                    |
                    v
uploaded_documents + candidate_profile_documents version/current selection
                    |
                    v
security scan successful
                    |
                    v
resume_parsing_jobs -> immutable resume_parsed_data/artifacts/evidence
                    |
                    v
projection rebuild outbox event
                    |
                    v
canonical profile + latest active resume parsed data normalize/deduplicate
                    |
                    v
candidate_search_profiles keyword/filter/embedding projection
                    |
                    v
authorized recruiter search में searchable
```

Projection row current source identity भी रखेगी:

```text
source_profile_revision
active_resume_document_id
active_resume_parsing_result_id
fact_sources
```

Worker write से ठीक पहले canonical revision और active resume document/result दोनों verify करेगा।
इससे पुराने resume का delayed worker नए active resume की projection overwrite नहीं कर सकेगा।

Candidate को parsing या embedding complete होने तक upload request/screen block नहीं करनी है। UI live
status WebSocket/SSE से दिखा सकती है और reconnect/status endpoint से authoritative state recover करेगी।

## Search trust rules

1. Confirmed canonical facts highest trust।
2. Latest active resume facts searchable लेकिन resume-derived label के साथ।
3. Inactive/older/application-only resumes exclude।
4. Duplicate fact एक बार; confirmed source priority।
5. Recruiter UI जहाँ relevant हो fact source/trust दिखाए।

## Historical behavior

Active resume change पहले submitted application snapshots को कभी modify नहीं करेगी।

```text
Application submitted snapshot
= immutable historical truth

Current canonical profile + active profile resume
= future recruiter search और future applications के लिए latest state
```

## Canonical profile editing

Candidate profile manually edit कर सकता है। Optional future UX action हो सकता है:

```text
[Add this resume information to my profile]
```

यह action evidence review/merge transaction से canonical facts update करेगा। Recruiter search में
resume-derived fact आने के लिए यह manual action mandatory नहीं है।

## NestJS/service responsibilities

- Active profile resume selection transactional रखना।
- Candidate + document role पर only one current document invariant enforce/handle करना।
- Clean document के लिए idempotent parsing job और outbox event बनाना।
- Successful current parse के बाद projection rebuild event chain करना।
- Canonical और active-resume facts normalize/deduplicate करना।
- हर searchable fact का source/trust preserve करना।
- Inactive/older/application-only resume global projection से exclude करना।
- Stale parsing/projection worker को latest active resume/revision overwrite न करने देना।
- Candidate और recruiter को safe status/source DTO देना; raw evidence blindly expose न करना।

## Acceptance criteria

- New active resume parse होने पर candidate Java जैसे नए resume-derived skill से
  searchable हो सकता है बिना canonical skill add किए।
- Canonical profile unchanged रहे।
- Stale resume/projection worker latest state overwrite न करे।
- Embedding और keyword projection active resume change पर rebuild हों।

## One-line memory rule

> Candidate को नया active profile resume upload करने के बाद हर fact manually profile में copy करना
> जरूरी नहीं है। Canonical profile safe और editable रहेगी, जबकि latest active resume recruiter search
> में clearly-labelled additional resume-derived evidence की तरह उपयोग होगा।

## Source coverage

Approved source के final decision, selection option, selected/unselected behavior, Java example,
change-impact table, background flow, trust rules, canonical editing option, service responsibilities,
application-history rule और one-line memory rule सभी इस document में preserved हैं।
