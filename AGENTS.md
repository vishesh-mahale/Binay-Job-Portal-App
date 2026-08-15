# Agent Working Rules — Binay Job Portal

इस repository पर काम करने वाले coding/review agents के लिए ये instructions mandatory हैं।

## काम शुरू करने से पहले

1. Root `README.md` और `MIGRATION-PLAN-HINGLISH.md` पढ़ें।
2. Relevant component का `README.md` पढ़ें।
3. Linked approved requirements, ADRs और shared contracts पढ़ें।
4. Owning executable migration/code और relevant tests inspect करें।

## Authority और conflict

- पुराना sibling `Binay-App` केवल migration reference/evidence है; authority नहीं।
- Outdated reviews/examples को production requirement न मानें।
- Missing requirement invent न करें।
- Requirement, ADR, contract, migration, deployed behavior या code conflict होने पर
  silently guess/fix न करें। Exact conflict report करें और decision माँगें।
- Current Supabase database testing environment है। Production baseline freeze से पहले baseline SQL
  correct करके intended test database को explicitly reset/rebuild किया जा सकता है। Production deploy
  होने के बाद applied migrations operational history हैं और changes forward-only migrations से होंगे।
  Requirements/ADRs/contracts intended behavior define करते हैं; mismatch छिपाएँ नहीं।

## Change discipline

- एक समय में एक component migrate/refine करें।
- Old source से blind copy न करें; हर file classify करें।
- Migration के समय original filename default रूप से retain करें। Filename/folder name बदलने की जरूरत
  हो तो user से पहले explicit confirmation लें; केवल cleaner naming के लिए silently rename न करें।
- किसी source document को refine/replace करने से पहले उसका section-by-section coverage audit करें। हर
  meaningful section/example/table को `preserved`, `updated`, `moved`, या `not carried forward` mark
  करें। `not carried forward` के साथ exact reason और replacement लिखना mandatory है। Coverage mapping
  के बिना migration complete न मानें।
- Approved client/final document की full detail preserve करें। Easy summary अलग
  document हो सकती है, लेकिन original rules/examples/acceptance criteria replace या
  omit नहीं करेगी।
- OUTDATED content नए repository में migrate न करें।
- Outdated statement हटाते समय उसके अंदर की useful explanation/table/example silently न हटाएँ; सही
  facts के साथ rewrite करें। यदि पूरा source mixed/research nature का है और information-loss risk है,
  तो उसे clearly non-authoritative research input के रूप में preserve करें।
- Finalized architecture को minimum/prototype-stage label न दें। `current production
  scope`, `first production version` या `future scope` जैसी precise terminology use करें।
- Code/schema change के साथ owning README, contract, ADR और tests sync करें।
- Shared event/task/API payload root `contracts/` में रखें।
- Database executable truth `02-database/migrations/` में रहेगी;
  `schema-docs/` explanatory है।
- Secrets, passwords, tokens, service-role keys और personal resumes commit न करें।
- Destructive delete/move से पहले exact targets और recoverable backup verify करें।

## Validation expectation

हर completed component के लिए prove करें कि requirement, service boundaries,
security, contracts, retry/idempotency, tests और navigation links सही हैं और old
repository पर unresolved dependency नहीं बची।
