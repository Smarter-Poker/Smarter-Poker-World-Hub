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

## Remaining Release Gate

The repository change must land on current `origin/main`, CI must pass, Git
integration must publish that exact main commit, production health must report
the exact SHA, and authenticated desktop plus 375px checks must pass. Until all
of those are true, this audit does not call Phase 5 published.
