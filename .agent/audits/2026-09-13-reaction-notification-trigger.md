# One reaction invokes one notification handler

The horse-trigger inventory found two enabled AFTER INSERT triggers on
`public.social_interactions` calling the same `fn_notify_post_like()` handler.
One was unconditional; the other admitted the six supported reaction types.
For an ordinary admitted reaction both handlers inserted a notification.

Native PostgreSQL 17 reproduced two notification rows from one interaction.
The migration removes only the redundant unconditional trigger, after verifying
both exact trigger definitions and the unchanged handler hash under a short
table lock. The remaining conditional trigger and the handler's existing
contents, filters and permissions are preserved. No historical notifications
are deleted or rewritten.

All 26 native checks pass: every supported reaction, posts/reels, self-reaction,
unrecognized reactions, unknown content, existing active-author filtering,
notification payloads, distinct events, conflict-no-op behavior, transaction
rollback, preserved function grants, and atomic refusal if the replacement
trigger is disabled. Required Build Safety Gate runs this suite with PG17.

Applied September 13 at18:04:01UTC as ledger version20260913180401, migration
name `20260913180130_reaction_notification_trigger_runs_once`. Live catalog
readback at18:04:03UTC shows exactly one enabled handler trigger, unchanged
handler hash `b23bbee40aba1044acf5a5f5f02680d0`, and closed browser EXECUTE grants.
No customer notification or push test was run in production. The earlier live
seven-day duplicate query found no existing duplicate groups; this is a proven
code defect, not a claim that a particular customer received duplicates.

Source publication remains subject to the normal PR checks. This is one
reviewed path within the wider horse-trigger audit, not completion of that audit.
