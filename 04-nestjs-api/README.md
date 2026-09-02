# NestJS API

[← Main project](../README.md) · [Requirements](../01-requirements/README.md)

NestJS इस application का public backend/API entry point है। Next.js business-data writes सीधे
Supabase पर नहीं करेगी; authentication, validation, authorization और business transactions NestJS
use cases के through चलेंगे।

## Start here

- All architecture, requirements, decisions and phase documents are indexed in [project-docs](project-docs/README.md).
- [NestJS implementation guide](project-docs/NESTJS-IMPLEMENTATION-GUIDE.md)
- [Phase 09 coding start gate](project-docs/PHASE-09-CODING-START-GATE.md)
- [Phase 09 foundation slice scope](project-docs/PHASE-09-FOUNDATION-SLICE-SCOPE.md)
- [Implementation tracker](IMPLEMENTATION-TRACKER-HINGLISH.md)

## Service boundary

```text
Next.js / future mobile client
              |
              v
         NestJS API
       auth + validation
       authorization
       business transaction
       business rows + outbox event
              |
              v
     Supabase PostgreSQL/Auth/Storage
```

Heavy AI/OCR/embedding work NestJS request process में execute नहीं होगा। वह transactional outbox,
NestJS Dispatcher, Google Cloud Tasks Queue और Cloud Run FastAPI worker वाले asynchronous flow से
होगा।

## Status

यह document current finalized architecture के अनुसार refined है। Phase 09 Foundation implementation complete हो चुकी है:
- **Auth & Real Email Verification (COMPLETE):** `collabfor.com` custom domain Brevo SMTP (`noreply@collabfor.com`) and Cloudflare DNS (SPF, DKIM, DMARC) authenticated. `AUTH_AUTO_CONFIRM_EMAIL=false` verified with zero-cookie signup (`pending_verification`), pre-confirmation login rejection (401), real email inbox delivery, and post-confirmation login profile role reconciliation (`active`).
- Business API modules aur integration tests approved phase gates ke anusar aage judenge.
