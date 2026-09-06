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

## Remaining Release Gate

The repository change must land on current `origin/main`, CI must pass, Git
integration must publish that exact main commit, production health must report
the exact SHA, and authenticated desktop plus 375px checks must pass. Until all
of those are true, this audit does not call Phase 5 published.

