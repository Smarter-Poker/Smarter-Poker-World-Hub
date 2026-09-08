# Strategy Matrix V2 Backfill Hard Gate

Date: 2026-09-08
Status: Blocked before execution; no backfill or reclaim started

The prior handoff misidentified `_pps_backfill_state` as the solver-V2
checkpoint. Live function-definition evidence proves it is unrelated:
`fn_pps_backfill_batch(integer)` advances that row while keyset-scanning
`hand_history` and calling `fn_process_hand_position_stats`. It never reads or
writes `solved_spots_gold` or `strategy_matrix_v2`. Its `done=true` value must
not be changed by this work.

There is still no trustworthy dedicated completion checkpoint for the V2
backfill. An independent current count finds only 1,891,817 populated V2 rows,
and the incrementally maintained pending-family ledger finds 7,036,883 pending
rows. Together they reconcile to 8,928,700 rows and 21.188% completion.

The live progress function is also not an adequate completion authority. It
returned the correct populated count and latest write, but derives remaining
work from stale `pg_class.reltuples`, understating the backlog by 33,532 rows.
One cold read exceeded its documented eight-second budget; a subsequent read
took 4.61 seconds. Completion must use the exact populated and pending ledgers,
not the legacy boolean or a planner estimate.

The backfill was not started because its storage gate cannot be proved from the
available Supabase account view. The Database Settings page exposes no
provisioned disk amount and reports disk configuration unavailable; it also
shows that this account cannot update some database settings. The required
minimum remains at least 40 GB of verified transient headroom before dual-column
population begins.

`pg_repack` 1.5.2 is available on the server but is not installed. It remains
the preferred reclaim candidate; `VACUUM FULL` is rejected for the live 80 GB
table because it needs an ACCESS EXCLUSIVE lock and large rewrite workspace.
Installing or running either tool is a database change and was deliberately not
performed during this read-only gate.

Before execution, the release must create a dedicated solver-V2 checkpoint
instead of reusing the unrelated PPS row, prove disk headroom from an authorized
infrastructure/billing view, rehearse the online reclaim path, include the
V1-column drop and TOAST reclaim in the same approved maintenance plan, and
enforce small fail-fast batches with durable truthful checkpoints. No Supabase
service, table row, worker, credential, ledger, or wallet was changed by this
audit.
