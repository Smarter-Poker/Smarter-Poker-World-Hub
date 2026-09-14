# Concurrent approval requests retain operation identity

Two requests sharing an operation key could both miss the first lookup. The unique index selected one winner, but the losing request returned that winner's clearance without checking its amount or target. With a 1,000 approval threshold, concurrent requests for 500 and 5,000 could both return `required: false`.

The request function now serializes each operation key before its first lookup and locks an existing approval while evaluating its status. A conflicting insert from a legacy writer locks the winning row and re-enters the same identity, expiry and retry validator. That row lock makes the additional call a single replay. Distinct keys remain independent, and no existing approval, money receipt or policy is rewritten by the migration.

The native PostgreSQL 17 regression runs exact request, decision, permissions, second-approver and audit logger definitions in disposable schema fixtures. It reproduces the original conflicting-amount clearance and verifies concurrent identical requests, rollback, all identity fields, threshold equality, terminal statuses, expiry, legacy writers, failed retries, a real concurrent approval decision, audit records and closed caller grants. The migration accepts only the reviewed baseline or candidate body and rejects drift. Required Build Safety CI runs the regression.

This qualifies approval clearance and replay behavior. It does not certify historical money execution or close unrelated financial incidents.
