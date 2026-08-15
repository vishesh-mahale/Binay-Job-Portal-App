# NestJS API

[← Main project](../README.md) · [Requirements](../01-requirements/README.md)

NestJS इस application का public backend/API entry point है। Next.js business-data writes सीधे
Supabase पर नहीं करेगी; authentication, validation, authorization और business transactions NestJS
use cases के through चलेंगे।

## Start here

- [NestJS implementation guide](NESTJS-IMPLEMENTATION-GUIDE.md)

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

यह document current finalized architecture के अनुसार refined है। Application code अभी बनना बाकी है;
implementation के साथ API/event contracts और integration tests add किए जाएँगे।

