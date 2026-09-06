# Stable Admin Phase 5 Release Audit

Date: 2026-09-06 UTC

Scope: Phase 5 Game Integrity And Case Management only. Phase 6 did not start.

## Release Finding

PR #1464 merged as `d4bbfeefd2df5f33e69863c8de1a286ebf7e1eb7`, but its
production Vercel deployment was canceled. Production `/api/health` was still
serving `5871495b`, the commit immediately before Phase 5. Merged was not
landed, so Phase 5 was not considered released.

## Defects Closed Before Republishing

1. The sanction note control required four characters while the API and
   database required ten. The Phase 5 implementation now uses ten at every
   layer and tests pin the contract.
2. A direct API request could apply or propose a sanction before a case held a
   human verdict. The UI now withholds that control, the API validates a
   matching verdict before maker-checker creation, and the database repeats the
   check while holding the case row lock. Warning, restriction, and
   confiscation map only to warned, restricted, and confiscated respectively.
3. The release-audit test was initially not reachable from CI. It is now
   imported by `_test-guards-exist.test.mjs`.
4. The first proposed migration version, `20260906160000`, was already present
   in production for an unrelated solver guard. The collision was detected
   before any write. The integrity guard uses verified-unused version
   `20260906170000`.
5. Authenticated production smoke testing found the queue and pairs endpoints
   intermittently exceeded PostgREST's eight-second statement budget. The hot
   JSON numeric extractor ran tens of thousands of PL/pgSQL calls per request.
   Migration `20260906180000` replaces it with a lower-overhead immutable SQL
   function while preserving its validation and server-only ACL. The remaining
   plan showed the root query defect: it scanned 176,593 rows to keep 7,070 and
   serialized every column of `profiles` 12,682 times. Migration
   `20260906200000` restores the exact partial-index predicate and reads only
   the three profile columns the queue needs.
6. The published queue UI did not consume three exact fields in the ranked RPC
   contract. It showed a missing zero-count tier as `Unknown`, ignored the
   singular `tier_reason`, and could not open the nested active-case summary.
   The panel now treats a successfully loaded missing tier as zero, renders
   `tier_reason`, reads `case.id`, and preserves `totals.filtered_groups` for
   filtered pagination. A release test pins all four mappings.
7. The health wrapper looked for `collusion-scan`, while Open Claw records
   `/cron/collusion-scan`. It therefore returned no latest run and discarded
   the worker's required detection-span and threshold disclosure. The wrapper
   now matches the recorded job name and carries both disclosure fields from
   the latest run result.
8. Flag cards used the JSON `reason` as their title and looked for subject and
   source fields the RPC does not return. They now show the flag type, named
   player with horse or human disclosure, flagged time, and thirty-day event
   count from the exact RPC fields.
9. The Timing panel looked for an array and fields including `p95_ms`, while
   its RPC returns a composition-keyed distribution with no percentile. That
   false-empty path is replaced with exact per-composition timing rows and an
   explicit sample-coverage card, including the truncation flag.
10. Pair cards requested a top-level `net_flow` field the ranked-pair RPC does
    not return, making every live value appear unknown. The card now renders
    the contract's `absolute_net_flow` under an exact "Absolute Net Flow" label.
11. The queue's initial loading state also rendered an unknown-state alert
    before the route had answered. Initial load now shows only its loading
    message; unknown remains reserved for a completed unreadable response.

## Production Database Evidence

- `20260906101639 ca_phase5_integrity_cases_and_review_queue` is registered.
- `20260906170000 integrity_sanctions_follow_human_decisions` was inserted once.
- All three integrity tables have RLS enabled.
- `anon` and `authenticated` cannot execute the sanction RPC; `service_role`
  can.
- A PostgREST service-role call reached the RPC and returned the expected
  structured `CASE_NOT_FOUND` refusal.
- One PostgreSQL `DO` block opened a temporary case, proved
  `DECISION_REQUIRED`, proved `SANCTION_DECISION_MISMATCH`, proved a matching
  warning succeeds, counted exactly one temporary sanction, then ended in the
  deliberate `ROLLBACK_PROBE_OK` exception. No probe row committed.
- After the probe, production still held zero integrity cases and zero
  integrity sanctions. No chip path was called.

## Detector And Queue Evidence At 13:02 UTC

- Detector status: live.
- Last success: `2026-09-06T13:00:13.094255+00:00`.
- Behind: 220 seconds; catching up: false.
- Stale: true only because the recorded 1,241,438-hand unscanned gap remains.
  The gap columns were not changed.
- Open findings created in the last two days: 6,597 timing correlation, 465
  chip dump, and 1 soft play.
- Composition: 6,593 of 6,597 timing rows are horse versus horse, four are
  horse versus human, and none is human versus human. Every chip-dump and
  soft-play row is horse versus horse. No horse finding is excluded.

## Local Verification

- Phase 5 targeted suites: 57 of 57 passed before the additional release pins.
- Full horses corpus after CI registration: 2,114 of 2,114 passed.
- `npx tsc --noEmit --pretty false`: passed.
- Targeted ESLint across the route, panel, and Phase 5 tests: passed.
- `NODE_OPTIONS='--max-old-space-size=4096' npx next build --webpack`: passed;
  `/horses` and `/api/horses/integrity-admin` were both emitted.
- Static scans found no Phase 5 TODO, FIXME, HACK, mock-data, hidden horse
  exclusion, unsafe `.single()`, evidence delete, or chip-movement path.

## PostgREST Recovery Verification

- Before the query fix, a direct service-role PostgREST queue request failed
  with PostgreSQL `57014 canceling statement due to statement timeout` at the
  eight-second boundary. The authenticated queue and pairs routes returned 503.
- An extracted `EXPLAIN ANALYZE` proved a sequential scan of all 176,593
  `collusion_tracking` rows, with 169,523 discarded after the scan.
- The rollback benchmark for the narrow, indexable queue completed in 1,569 ms
  versus 12,100 ms for the captured failing plan.
- After applying the fix, five consecutive PostgREST queue requests returned
  25 rows successfully in 2,974 to 4,759 ms.
- Authenticated production requests then passed for health, queue, pairs,
  flags, timing, and hands. The case endpoint returned the expected structured
  `case_not_found` response for a nonexistent UUID.
- A more aggressive evidence-pagination rewrite measured 6,727 ms in rollback
  and was discarded. It was never applied or committed.

## Release Gate Evidence

- Phase 5 and its release repairs landed through PRs 1464, 1470, 1474, 1476,
  1481, 1494, 1497, 1502, and 1504. Each repair was cut from the then-current
  `origin/main`; no follow-up commit was pushed to an already merged branch.
- The safe-push build gate, checks 1 through 12, UI text gate, and Title Case
  gate passed for the final three UI repairs. The complete relevant Horses and
  integrity corpus passed 948 of 948 tests. The repository guard passed 1,261
  of 1,261 tests, TypeScript passed, and the production Next.js build passed.
- Direct service-role PostgREST calls returned HTTP 200 for all seven read
  contracts. Health, queue, pairs, flags, timing, and hands returned their
  expected success states; a nonexistent case returned the expected structured
  `CASE_NOT_FOUND` state. The slowest call in that final sweep was 3,384 ms.
- Authenticated production checks covered Queue, Case, Pairs, Flags, Timing,
  Hands, and Health. Chip Dump filtering returned 421 reachable pairs. Timing
  rendered 200 sampled hands, 1,481 actions, 1,127 adjacent pairs, and the
  explicit truncation disclosure. A current player search returned populated
  hand cards; a player with no sampled hands returned the honest empty state.
- The 375px production pass had a 375px document width with no horizontal
  overflow. The navigation, coverage warning, queue controls, and case card
  remained reachable without converting the evidence cards into a desktop
  table.
- Production registered each of the five Phase 5 migrations exactly once. All
  twenty `fn_ca_integrity_*` functions are executable by `service_role` and by
  neither `authenticated` nor `anon`. Production contains zero cases, zero
  case items, and zero sanctions after the deliberate rollback probes.
- The historical 1,241,438-hand gap remains disclosed. The gap columns were
  never cleared to make the banner green. The worker still reports a 30-minute
  detection span, `identity_filtered: false`, and
  `aggregates_across_runs: false`.
- A 16:00 UTC detector run was interrupted when an unrelated worker release
  replaced the container 22 seconds after the run began. The durable mark did
  not advance. The 16:30 scheduled run then retained and completed that
  60-minute span: 15,830 hands in 40,984 ms, cursor advanced, 119 seconds
  behind, and `catching_up: false`. An invocation of the existing stale-run
  sweeper marked exactly the three deployment-killed cron rows as `killed`.
  A subsequent production read at 16:35 UTC confirmed all three statuses and
  still reported `status: live`, `catching_up: false`, and the preserved
  historical-gap disclosure.
- Production served the exact current `main` SHA after the final functional
  repair. On that build the initial Queue state showed only its loading notice,
  then rendered ranked rows without an unknown-state warning. This closes the
  Phase 5 functional release gate; the closeout commit carrying this evidence
  is published through the same Git integration and recorded in the task
  receipt.
