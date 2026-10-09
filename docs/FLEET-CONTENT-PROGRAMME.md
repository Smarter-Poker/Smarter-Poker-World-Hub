# Fleet Content Programme: Current Delivery Status

Status captured 2026-10-08. This is the World Hub delivery record for the
ten-phase programme. The workers repository owns the running content engine;
World Hub owns the dispatcher, database schema, admin surfaces and hand-clip
renderer. A merged implementation is not the same as an approved or enabled
posting mode.

## Current production identity

- World Hub protected `main` and `https://smarter.poker/api/health` were both
  `f04dee718aa31638fce826429f53d716a942aad8` at the status audit.
- Workers protected `main` was
  `46f7b46b85c1b07be424b46a47ae414f4be58373`; its CI and deployment runs were
  successful. The public `https://workers.smarter.poker/health` hostname
  returned `DEPLOYMENT_NOT_FOUND`, so it is not valid live identity proof.
- Club Arena's two public `build-info.json` endpoints both reported
  `c79f08d347627ce4bbcc170f848d8a3475f48f1a`, including the human hand-share
  client work.

These identities are evidence for the captured status, not a standing claim
that later production still serves those revisions.

## Programme invariants

1. Horses are players. `is_horse` can identify a horse; it must not remove a
   horse from a player surface.
2. The master `content_settings.engine_enabled` switch fails closed. A mode
   switch cannot override it.
3. Approval-gated modes are independent. Built or deployed does not mean
   approved, enabled or accepted in visible output.
4. Grounded hand and grounded session content never become a fallback.
5. Every live run records an execution row. A schedule proves intent, not an
   execution or a player-visible result.
6. A closed horse (`profiles.status = 'deleted'`) or benched horse
   (`profiles.horse_status = 'disabled'`) is not part of the active fleet.
   A live horse with a missing or inactive author is readiness drift.

## Phase status

| Phase | Delivered source | Current qualification |
| --- | --- | --- |
| 1. Whole fleet eligibility | Socialisation trigger, paged fleet, cadence, durable ledgers and fleet-wide scheduling are deployed. | Readiness is for live horses. The 62 retired tombstones found by the 2026-10-08 audit are excluded by the follow-up migration; database installation and post-apply readback remain separate work. |
| 2. Comprehension and voice | Briefs, deterministic reply limits, durable style sheets, relevance checks and phrase-ledger protections are deployed in workers. | Earlier visible batches were rejected and removed. Source/deployment does not approve fresh output. |
| 3. Grounded content | Candidate grounded-hand and grounded-session machinery exists. | Both modes remain independently approval-gated. No programme prose authorises either mode or treats it as a fallback. |
| 4. Renewable supply | Poker clips, source registry, RSS ingestion, validity checks, reels bridge and supply watchdog are deployed. | Supply availability does not enable horse publication while the master or applicable mode gate is off. |
| 5. Human poker-native posting | Card tokens, durable drafts and the first composer increment are live; later surface parity and presets are a separate in-progress client change. | Hand-history import and a labelled flop/turn/river flow are not certified complete here. |
| 6. Data-native and local content | Dispatcher registration, execution logging and club/local/seasonal composition are deployed. A 2026-09-30 production execution recorded two club and eighteen seasonal posts after the retry repair. | Historical execution is not current enablement or output approval. `club_data_digest`, `local_event` and `seasonal_local` remain individually controlled by database mode rows and the master switch. |
| 7. Interactive content | Scheduler, schema and admin controls for puzzles, questions and reveal flows are deployed across World Hub and workers. | Each route still depends on its current database mode and approval state; this document does not switch one on. |
| 8. Discovery and feed | Topics, feed ordering/dedup, profile hand stats and video/reels UX changes are deployed. | Live rendering and content availability remain distinct from approval of horse-authored output. |
| 9. Hand replay and share | Worker candidate selection, World Hub render queue/publisher and Club Arena human share flow are deployed. | `hand_clip` was shipped disabled and requires explicit visible-sample acceptance before enablement. No final owner approval is recorded in this status. |
| 10. One engine and measured | The World Hub JavaScript mirror and archived cron runtime were removed; the admin Stats panel and weekly worker digest share `fn_fleet_content_metrics`. | The first natural Monday digest execution and receipt have not been evidenced. The orphan `seeded_content` active contract is retired by a separate guarded, row-preserving migration; installation remains separate from source. |

## Remaining evidence gates

- Install each pending migration through the maintained database path outside
  the protected DDL interval, then verify the exact migration ledger entry,
  function definition, owner, invoker security, grants and returned rows.
- For any disabled posting mode, obtain explicit visible-sample approval
  before enablement and retain the database approval receipt.
- Prove a natural weekly digest run, including its `cron_execution_log` row
  and delivery or explicit measured skip reason.
- Restore or replace the broken workers public health identity proof through
  the existing owned service route; do not infer runtime identity from a
  successful deployment workflow alone.
- Treat submitted, tested, merged, installed, deployed, live-verified,
  visibly approved and enabled as separate states in every checkpoint.
