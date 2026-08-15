# Product Requirements

[← Main project](../README.md) · [Migration plan](../MIGRATION-PLAN-HINGLISH.md)

यह folder approved product behavior, future scope और finalized product decisions का
clean source है। Technical implementation choices यहाँ duplicate नहीं होंगी; उनके
लिए [ADRs](../docs/adr/README.md), shared contracts और component READMEs use होंगे।

## Status vocabulary

| Status | Meaning |
|---|---|
| `APPROVED` | Current required product behavior |
| `PLANNED` | Required direction, detailed acceptance criteria component phase में freeze होंगी |
| `FUTURE` | Current implementation scope से बाहर; client revalidation required |
| `NEEDS_DECISION` | Conflicting/insufficient input; implementation से पहले decision required |
| `OUTDATED` | New repository में migrate नहीं किया जाएगा |

## Current requirements

- [Master product requirements](current/PRODUCT-REQUIREMENTS.md)
- [Non-functional requirements](current/NON-FUNCTIONAL-REQUIREMENTS.md)
- [Manual referral — full approved client requirement](current/MANUAL-REFERRAL-REQUIREMENT.md)
- [Manual referral — easy Hinglish summary](current/MANUAL-REFERRAL-SUMMARY-HINGLISH.md)

## Product decisions

- [Account roles and referral eligibility](product-decisions/PD-001-ACCOUNT-AND-REFERRAL-ROLES.md)
- [Active resume contribution to recruiter search](product-decisions/PD-002-ACTIVE-RESUME-SEARCH.md)
- [Application identity and historical truth](product-decisions/PD-003-APPLICATION-HISTORY.md)

## Future requirements

- [Future roadmap](future/FUTURE-ROADMAP.md)
- [Detailed pending requirements tracker](future/--%20pending-items-for-future.md)

## Migration evidence

- [Old-source classification and traceability](SOURCE-CLASSIFICATION.md)
- [Preserved All Features source](source-inputs/ALL-FEATURES.md)
- [Preserved master Requirement source](source-inputs/REQUIREMENT.txt)

## Authority rule

अगर requirement और executable/deployed behavior conflict करें तो agent silently
guess नहीं करेगा। वह exact conflict report करेगा। Old `Binay-App` files migration
evidence हैं, इस clean requirement set की authority नहीं।

## Approved-document migration rule

Approved client/final document के लिए:

```text
Full original detail preserve होगी
+ आसान summary/guide अलग हो सकती है
```

Summary कभी approved document को replace नहीं करेगी। Reorganization में कोई rule,
example, edge case या acceptance criterion हटाना allowed नहीं।
