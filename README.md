# Binay Job Portal App

यह clean production-oriented project repository है। पुराने `Binay-App` से content
यहाँ एक component at a time review, refine, validate और test करने के बाद आएगा।

## Start here

- [Agent working rules](AGENTS.md)
- [Project context map](PROJECT-CONTEXT-MAP.md)
- [Repository migration plan (Hinglish)](MIGRATION-PLAN-HINGLISH.md)
- [Migrated-document coverage audit](MIGRATION-COVERAGE-AUDIT.md)
- [Architecture Decision Records](docs/adr/README.md)
- [Research library](docs/research/README.md)
- [Background-worker architecture](docs/architecture/background-processing/BACKGROUND-WORKER-ARCHITECTURE-OPTIONS-HINGLISH.md)
- [Background-worker implementation plan](docs/architecture/background-processing/BACKGROUND-WORKER-IMPLEMENTATION-PLAN-HINGLISH.md)
- [Shared contracts](contracts/README.md)

## Planned component navigation

> Component folders one-by-one बनाए जाएँगे। Folder बनने के बाद उसका README link
> यहाँ activate किया जाएगा।

1. [Requirements](01-requirements/README.md) — current, future और finalized product decisions
2. [Database](02-database/README.md) — authoritative migrations, schema docs, Supabase config, seeds, tests और flows
3. `03-nextjs-web/` — frontend application
4. [NestJS API](04-nestjs-api/README.md) — main backend/API
5. `05-outbox-dispatcher-nestjs/` — outbox publisher/dispatcher service
6. `06-google-cloud-tasks/` — managed queue configuration, IAM और retry policy
7. `07-fastapi-ai-worker/` — resume parsing, AI और embeddings

Cross-cutting areas:

- `docs/adr/` — approved architecture decisions और उनका reasoning
- `docs/architecture/` — cross-service diagrams और system views
- `contracts/` — APIs, events और Cloud Task payload contracts

## Navigation standard

```text
Main README
→ Component README
→ Detailed requirement / architecture / flow / test document
```

हर nested document में parent README और main README पर वापस जाने के links होंगे।
