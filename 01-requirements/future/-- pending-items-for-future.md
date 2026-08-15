# Pending Requirements for Future Implementation

[← Requirements index](../README.md) · [Future roadmap summary](FUTURE-ROADMAP.md)

## Status

इस file में केवल वे features हैं जो current implementation scope का हिस्सा नहीं हैं। यह
executed database की defect list नहीं है। Implementation से पहले client priority, privacy,
cost और acceptance criteria दोबारा confirm किए जाएँगे।

Referral reward configuration, admin-manageable email templates और recruiter saved candidates
अब future items नहीं हैं। उन्हें current requirements में move कर दिया गया है।

## 1. CMS module

अभी `blogs`, `blog_categories`, `faqs` और `static_pages` tables नहीं हैं। Future CMS में SEO
metadata, draft/published workflow, categories, FAQ और static-page administration हो सकता है।

## 2. Support ticket system

अभी `platform_feedback` basic feedback संभालता है। Full support workflow में
`support_tickets`, replies/thread, attachments, priority/status और user/admin conversation
history चाहिए होगी।

## 3. Skill assessment module

Future skill verification के लिए assessments, questions, candidate answers और results चाहिए
होंगे। यह declared या resume-derived skills से अलग verified assessment evidence देगा।

## 4. Feature flags and system configuration

Future admin control के लिए tenant/global settings और feature flags add किए जा सकते हैं। इनसे
selected company/user segment के लिए feature enable/disable किया जा सकेगा।

## 5. External search-engine synchronization

Current search PostgreSQL filters, FTS, `pg_trgm` और `pgvector` पर आधारित रहेगा। Scale और
measured performance जरूरत prove करें तभी external search engine add होगा। Provider अभी fixed
नहीं है; Meilisearch/OpenSearch या दूसरा option evaluation और ADR के बाद चुना जाएगा। Future
implementation में sync state, replay, reconciliation, rebuild और index-health monitoring चाहिए।

## 6. Feedback reply/thread extension

`platform_feedback` अभी one-shot submission/status workflow है। Future में back-and-forth
conversation के लिए `feedback_replies`, author identity, attachments और chronological history
add हो सकते हैं। Full support-ticket module से इसकी responsibility स्पष्ट रखनी होगी।

## 7. Company API keys

Future partner/public API के लिए company-scoped API keys चाहिए हो सकती हैं। Raw key store नहीं
होगी; hash, label, scopes, expiry, last-used time, revocation और rate limits रखे जाएँगे।

## 8. Third-party integrations and OAuth connections

Google/Microsoft Calendar, Zoom/Meet, Slack/Teams और दूसरे providers के लिए future integration
records चाहिए होंगे। Tokens encrypted storage, refresh lifecycle, connection status और revoke
handling के साथ रखे जाएँगे। यह Supabase user-login OAuth से अलग concern है।

## 9. AI usage and cost monitoring

Future admin monitoring में provider/model/version, feature area, input/output usage, latency,
status, estimated cost और tenant/company attribution record हो सकते हैं। Daily/monthly rollups
और anomaly alerts बाद में add किए जा सकते हैं।

## 10. AI provider evolution

FastAPI AI worker में replaceable provider interface रखना architectural direction है। Exact
provider, model, fallback order और pricing यहाँ hard-code नहीं होंगे क्योंकि वे time-sensitive
हैं। Official information, quality evaluation, privacy, latency और cost के आधार पर ADR बनेगा।

Possible future work:

- evaluated provider fallback strategy;
- model-quality regression dataset;
- selected models self-host करने का cost study;
- provider outage और quota-exhaustion behavior;
- embedding compatibility/version migration policy।

## Current scope में move किए गए items

ये items अब future list का हिस्सा नहीं हैं:

1. Configurable referral programs/reward rules;
2. Admin-manageable email templates;
3. Recruiter saved-candidate bookmarks।

इनका authoritative status [Master Product Requirements](../current/PRODUCT-REQUIREMENTS.md)
में है। Database foundation मौजूद हो सकती है, लेकिन remaining tables, APIs, permissions, UI
और tests current implementation work माने जाएँगे।
