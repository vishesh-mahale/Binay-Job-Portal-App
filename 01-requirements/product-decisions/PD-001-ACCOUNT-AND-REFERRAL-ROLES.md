# PD-001 — Account Roles and Referral Eligibility

[← Requirements index](../README.md) · [Main project](../../README.md)

## Status

`APPROVED`

## Decision

Current production scope में one application role per account:

```text
candidate | employer | hr | admin
```

Referral capability है, अलग recruiter/referrer role नहीं। Any active authenticated
role referral policy pass करने पर refer कर सकता है। Company/resource workflows में
role के साथ membership, permission और ownership checks भी required हैं।

## Consequence

- `recruiter` account type create नहीं करना;
- request body role/ownership trust नहीं करना;
- future multi-role model separate approved migration होगा;
- referral eligibility role-name से अधिक policy-based रहेगी।
