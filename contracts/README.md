# Shared Contracts

[← Main project README](../README.md) · [Migration plan](../MIGRATION-PLAN-HINGLISH.md)

यह area services के बीच shared, versioned data contracts रखेगा।

```text
api/     → OpenAPI और request/response schemas
events/  → outbox event names और versioned payload schemas
tasks/   → Google Cloud Tasks HTTP payload/auth/response contracts
```

जहाँ practical हो JSON Schema/OpenAPI machine-readable source होगा। Breaking change
के लिए नया contract version आवश्यक होगा। Actual files component migration के समय
बनेंगी।
