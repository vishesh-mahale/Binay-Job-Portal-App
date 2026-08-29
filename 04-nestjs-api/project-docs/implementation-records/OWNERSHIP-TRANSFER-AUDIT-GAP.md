# Ownership Transfer — Audit Mechanism Gap

## Verified fact

`companies.owner_id` is the only approved ownership field in `04_companies.sql`. There is no dedicated company-history table, ownership-transfer audit function, or approved `company.ownership.transferred` outbox contract. However, `13_analytics.sql` already provides the immutable, company-scoped generic `audit_logs` table with actor/target and old/new JSONB fields.

## Consequence

The ownership update and an `audit_logs` insert can be atomic without inventing schema. The approved current-scope action is `company.ownership_transferred`; no outbox event is emitted because no contract/consumer exists.

## Decision

Use the existing generic `audit_logs` mechanism inside the same transaction:

- `company_id` and `entity_id` = company ID
- `user_id` = current owner/actor
- `target_user_id` = new owner
- `action` = `company.ownership_transferred`
- `entity_type` = `company`
- `old_values`/`new_values`/`changes` capture the owner ID transition

Dedicated history table and outbox contract remain future options only if a later approved requirement needs them.

No agent may invent a table/event or emit an unapproved outbox event.
