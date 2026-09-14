# Fleet Policy Audit Transactions

The runner loads the captured production policy function, effective-policy reader, and actual admin-audit writer into an isolated PostgreSQL 17 cluster. Fixture columns, generated scope identity, and policy constraints match the relevant live tables. It opens no production connection and moves no money.

Two original failures are reproduced: an audit insert exception still returns policy success, and simultaneous edits observe a stale previous policy. The guarded migration requires a stored audit receipt with the exact actor, target, before-state and after-state. Each scope serializes its own changes, including first creation. The policy version records the time of its actual update.

Run `python3 scripts/ci/test-fleet-policy-audit.py --output <new-directory>`. `PG_BIN` selects PostgreSQL 17. Required build-safety CI runs this same fixture. Checks cover exceptions, silently skipped and altered audit rows, connected concurrent snapshots, independent scopes, new-row races, rollback, browser denial, installation replay and dependency drift refusal.

The operator route's separate approval preview is unchanged. This fixture does not certify that preview race, materiality over repeated edits, policy choices, or financial providers.
