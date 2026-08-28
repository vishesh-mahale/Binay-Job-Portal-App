# Phase 09-B — Identity, Companies & Membership Consolidated Verdict

Date: 2026-08-26  
Reviewers: Codex, Antigravity, Cline, Freebuff, Opencode

## Final verdict

```text
PASS WITH MINOR FIXES — SCOPE APPROVED FOR IMPLEMENTATION
```

Scope document actual requirements, API catalog, architecture और SQL baseline से aligned है। चारों agent reports में कोई fabricated table, route, role, event या business rule नहीं मिला। Antigravity ने PASS दिया; Freebuff और Opencode ने documentation clarifications सुझाईं; Cline ने authorization/RLS/outbox semantics की ambiguities highlight कीं। Valid findings scope में apply कर दी गई हैं।

## Applied clarifications

- `rejoin` existing membership row को reactivate करेगा; नया duplicate row नहीं बनेगा. यह पहले approved company decision के अनुसार रखा गया है।
- `login_history` और `user_sessions` को identity data/test inventory में जोड़ा गया।
- `handle_new_user()` trigger user-row creation boundary स्पष्ट की गई; NestJS duplicate row नहीं बनाएगा।
- Sole company owner deactivation/transfer guard स्पष्ट किया गया।
- User-context RLS केवल explicitly approved policies तक सीमित किया; बाकी company reads NestJS authorization के बाद trusted path से होंगे।
- Outbox event केवल approved versioned contract/registered route होने पर emit होगा; event invent नहीं होगा।
- Accept पर `is_active=true` और `joined_at` transaction में set करने तथा audit rows append-only रखने की requirements जोड़ी गईं।
- OAuth replay, session revocation, direct DML denial, trigger-created user और login-history tests जोड़े गए।

## Important non-action

एक agent ने rejoin के लिए नया membership row सुझाया था। इसे लागू नहीं किया गया, क्योंकि existing finalized decision `rejoin = same membership row` है और SQL में company-level membership uniqueness भी उसी model को support करती है।

## Implementation boundary

Phase 09-B में identity, users, companies, branches, departments, teams और memberships implement होंगे। Jobs, candidates, applications, referrals, interviews, messaging और notifications इस slice में नहीं आएंगे। API paths/DTOs catalog के `TBD` हिस्सों से बिना separate contract review के invent नहीं होंगे।

## Required implementation gates

```text
API paths/DTOs freeze
→ authorization matrix
→ tenant-negative tests
→ membership lifecycle + owner-transfer guards
→ audit/transaction/concurrency tests
→ fresh independent implementation review
```

```text
PHASE 09-B SCOPE: APPROVED WITH MINOR FIXES
IMPLEMENTATION: AUTHORIZED
PRODUCTION READY: NO — CODE AND TEST GATES REMAIN
```
