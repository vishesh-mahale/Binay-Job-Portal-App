# Future Product Roadmap

[← Requirements index](../README.md) · [Main project](../../README.md)

## Status

सभी items `FUTURE` हैं। ये current schema/code defects नहीं और automatic commitment
नहीं। Implementation से पहले client value, priority, privacy, cost और acceptance
criteria revalidate होंगे।

## Referral/import growth

- CSV/Excel bulk referral import;
- spreadsheet copy/paste parsing;
- ATS/CRM/Google Contacts integration;
- recruiter-owned “My Candidates” contact database;

Current manual invitation/application separation future import methods में भी बनी
रहेगी।

## Content and support

- CMS: blogs, categories, FAQ और static pages with SEO/workflow;
- support tickets, threaded replies, priority/status और attachments;
- platform-feedback reply/thread extension।

## Candidate/recruiter features

- skill assessments, questions, answers और verified results;
- richer activity timeline;
- optional resume-improvement, cover-letter analysis और salary-insight tools;
- AI candidate summaries, search suggestions और controlled email drafting;
- advanced AI-generated interview questions and hiring/recruitment insights।

## Platform administration

- feature flags और global/tenant settings;
- backup/restore administration with tested recovery policy;
- API/service health and operational monitoring screens;
- AI usage/cost/latency/model-version monitoring;
- external API keys with hashes, scopes, expiry और rate limits;
- third-party integrations/OAuth connections with encrypted token lifecycle;
- advanced CMS/support/queue/search management screens।

## Search growth

- PostgreSQL FTS/pgvector capacity insufficient prove होने पर Meilisearch/OpenSearch;
- sync/outbox tracking, rebuild और reconciliation;
- external index health/status/admin tooling।

External search current PostgreSQL projection को replace करने की बजाय same canonical
source से derived consumer होगा। Exact threshold ADR में तय होगी।

## External scheduling and collaboration

- Google/Microsoft calendar integration;
- Zoom/Meet/Teams interview links;
- Slack/Teams notifications;
- advanced live HR collaboration।

## Account/platform evolution

- single-role से verified multi-role account model;
- enterprise SSO और advanced tenant permission model;
- company integration marketplace;
- public/partner API platform।

## AI/provider evolution

- provider abstraction और evaluated fallback strategy;
- high-volume models self-host करने का cost/quality study;
- model evaluation datasets और quality regression tests;
- advanced duplicate detection, ranking और recommendations।

Provider/model names और pricing future ADR में उस समय current official data से
verify होंगे; पुराने research estimates requirement नहीं हैं।

## Commercial and reporting growth

- payment-provider integration;
- configurable usage-based billing;
- advanced BI/reporting integrations;
- company-specific analytics and cost allocation।

## Explicit decisions still needed

- measurable API/search/upload latency SLOs;
- retention/anonymization periods by jurisdiction;
- WCAG accessibility target;
- fast-track synchronous name extraction का actual UX benefit;
- offer-management/e-signature scope;
- notification channel matrix और per-event defaults;
- external search adoption threshold;
- AI budget caps और provider failover quality policy।

इनमें से किसी item को current scope में लाने के लिए approved requirement, relevant
ADR/contract, implementation plan और tests आवश्यक होंगे।

Detailed tracker: [Pending requirements for future implementation](--%20pending-items-for-future.md).

Referral reward configuration, admin-manageable email templates और recruiter saved candidates
current scope में move हो चुके हैं; उनका authoritative status
[Master Product Requirements](../current/PRODUCT-REQUIREMENTS.md) में है।
