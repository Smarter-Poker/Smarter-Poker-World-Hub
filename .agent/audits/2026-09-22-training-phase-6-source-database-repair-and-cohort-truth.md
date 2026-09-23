# Training Phase 6 Of 16: Source/Database Repair, Cohort Truth, And Remaining Gates

Date: 2026-09-22 (evidence gathered 2026-09-20 through 2026-09-23 UTC)
Owner: Cowork Training Phase 6 program (sole writer for this record)
Status: Phase 6 open. 6E repaired in source, merged and deployed; 6F blocked on
data; 6G/6H not started; 6I attestation-dependent part blocked. Phase 7 not
started.
Program ledger: `2026-08-30-training-complete-16-phase-program.md`

## Purpose

This record fixes, in one place and in plain terms, what was found and what
was done between the 2026-09-20 resumption and 2026-09-23. It replaces no
earlier record. It separates the evidence layers so that a repaired source
file is not mistaken for a repaired database, a merged pull request is not
mistaken for a deployment, a deployment is not mistaken for a live proof, and
a failing attestation is not mistaken for a code defect when it is a data
dependency.

Verification provenance for every figure below is one of:

- **writer-verified**: re-run by the author of this record on 2026-09-23
  with `gh`, `git`, `shasum`, or `curl` from the worktree at protected
  `origin/main` `f8ef1cfc`; or
- **coordinator evidence**: supplied by the coordinating session's read-only
  production inspection or local test runs and not independently re-run by
  the author (no database credential was used to write this record).

## Resumption Receipt (2026-09-20)

Coordinator evidence: the Policy 2.9 handoff receipt was verified at resume.
Manifest `7663cc909626f7e9966931d27166ad8774addc801f7ad1898a2d7564bc13c378`;
all four file hashes matched the handoff.

## 6E - Scoped Solver-Worker Protocol And Migration Custody

### Source layer

Writer-verified with `gh pr view`:

- PR #1762 "fix(training): bind solver operations to release scope" merged
  2026-09-14T13:41:20Z as `8e81528a0e95a32629eed4bc3754fe64ea96d218`, final
  head `22502e4b`. It introduced the scoped solver-worker source and
  migration `20260913170000_training_solver_operation_scope_binding`.
- PR #1821 "Restore the complete September 13 World Hub application and
  pipeline" merged 2026-09-16T18:29:34Z as
  `35a6e033038978c696cf94b651db5756221a4ec3`. It reverted #1762's scoped
  solver-worker source. Production kept the migration.
- Repair PR #1939 "fix(training): restore scoped solver-worker protocol and
  migration custody reverted by #1821" (commits `4dc33a9b` and inventory
  refresh `c1c73e11`) squash-merged 2026-09-23T03:13:50Z as
  `9969ba54a261108f7c990017506d225b9cca9e4e`.

Writer-verified byte identity of the restored migrations in the worktree at
`origin/main`:

| Migration | Bytes | sha256 |
| --- | ---: | --- |
| `20260913170000_training_solver_operation_scope_binding.sql` | 32524 | `47509b9229e304ddeff119def75247594e6b4c251457f94a905f3cd6f7a8967b` |
| `20260913170312_engine_alert_delivery_receipts.sql` | 5190 | `381fbfe11dd8db020edcc754e2c8b7b144f115f6cac54ce3d3ecd27ff052c2ed` |

Coordinator evidence: the same sizes and digests were read from the
production migration ledger, so ledger and source are byte-identical for
both versions, and no ledger migration after `20260913170312` touches these
objects.

### Test layer

- Writer-verified: `__tests__/training-solver-scoped-protocol-custody.test.mjs`
  exists on `origin/main` (9,090 bytes). Coordinator evidence: 7/7 fail on
  base `13490915` (the pre-repair tree) and 7/7 pass after the repair.
- Coordinator evidence, local on the repair branch: focused 97/97;
  `test:training:phase6-authority` 832/832; Python 14+17+18; PG17
  solver-catalog verifier exit 0; lint; `next build` exit 0.

### CI layer

Writer-verified with `gh pr checks 1939`: Audit-marker registry, No Conflict
Markers, No New Undefined Identifiers, Pre-Deploy Safety Checks, TypeScript
Check, U4.2, U4.3, U4.4, and Open-a-PR all passed; Failure Notification and
Vercel Deploy Retry skipped by design. Coordinator evidence: CHECK 17 inside
Pre-Deploy Safety Checks reported "1 changed migration(s) vs origin/main; 0
unapplied object(s)".

Historical correction for #1762, writer-verified from the check runs on head
`22502e4b`: the required Pre-Deploy Safety Checks concluded `failure` at
2026-09-14T13:41:08Z (coordinator evidence: CHECK 17 counted 6 unapplied
objects because the functions had not yet been applied at merge time). The
PR merged at 13:41:20Z, twelve seconds later, via autopilot under a ruleset
integration bypass that was then in force and has since been removed
(2026-09-19). The non-required "Chromium and WebKit footer contract" also
failed (timeout, unrelated). #1762 must not be described as all-green.

### Merge and deployment layer

- `9969ba54` is an ancestor of the current `origin/main` (`f8ef1cfc`),
  writer-verified with `git log`.
- Coordinator evidence: `/api/health` reported `9969ba54` on
  `dpl_G3e6tW3NjMshfvyQoWQsuGekQsmh` after the merge. Writer-verified at
  2026-09-23T04:35:06Z: `/api/health` reports the later descendant
  `f8ef1cfc16294ce02864f21aa7cf25a7a2ebf450` on
  `dpl_AzDhU7aE7LaTRU2A93oBPeKGKuZY`, `status: ok`, database 36 ms,
  `trainingGradingReceipt: ok`.

### Database layer (read-only production inspection, coordinator evidence)

Inspected 2026-09-20 and re-confirmed 2026-09-23. `service_role` EXECUTE is
**denied** on `training_claim_solver_worker_request_v1`,
`training_ingest_solver_artifact_v1`,
`training_ingest_solver_artifact_unscoped_v1`,
`training_solver_worker_board_page_v1`,
`training_solver_worker_row_states_v1` and `_v2`; **allowed** on the `_v2`
claim, `_v2` ingest, `_v3` row_states, `_v2` board_page,
`training_solver_worker_heartbeat_v1` and
`training_solver_spot_candidates_v1`. `solver_status` grants `service_role`
SELECT only, has RLS enabled and no policies. This is the state #1762's
migration installed and #1821's revert left in place; #1939 restores the
source side to match it. No database object was changed by the repair.

### Live UI / gateway layer

Writer-verified 2026-09-23: unsigned `POST /api/training/solver-worker`
returns HTTP 401 (fails closed); `GET` returns HTTP 405.

Not proven: a signed live round-trip to the scoped RPCs. No worker HMAC
exists, and none may be provisioned before the activation gates in the
2026-09-07 admission runbook. `scripts/preflop-deep/phases.json` keeps
`release_gate.solver_ready: false` (writer-verified, line 136).

## 6F - Public Delivery-Authority Attestation: Root Cause

### Database layer (read-only production, 2026-09-20, coordinator evidence)

- `training_solver_artifact_catalog`: 0 rows.
- `training_solver_provenance_authority`: 0 rows.
- `bounded_canary_targets`, `ingest_scopes`, `worker_receipts`: 0 rows.
- `cash-002` Level 8 cache: 171 rows (108 HEURISTIC flop, 38 CURATED, 25
  LEGACY_UNVERIFIED). 34 rows expose a 75%-pot aggressive option; all 34 are
  HEURISTIC and campaign-ineligible.
- Rows that are provenance-complete, verified, M1/M2-sourced, solver-node
  bound, or carry a `nextStreetContinuationAction`: 0.
- Whole cache by provenance: LEGACY_UNVERIFIED 28,100; CURATED 622;
  HEURISTIC 108; SOLVER_EXACT 0.

Verdict: the `422 TRAINING_ATTESTATION_CONTINUATION_COHORT_UNAVAILABLE` that
every attestation run has returned is a data dependency. No admitted
provenance-complete artifact exists because no M1/M2 bounded canary has ever
been admitted. It cannot be fixed in code without weakening provenance, and
provenance was not weakened.

### Public attestation layer - lost evidence file

The preserved failed-closed evidence file
`/private/tmp/phase6-closeout.GB2yFl/phase6-public.json` no longer exists.
The directory exists, is empty, and carries mtime Sep 20 00:00 (macOS
`/private/tmp` cleanup). Its recorded facts survive only in the handoff:
sha256 `4df7e943...97d16`, 1,956 bytes, `status: failed_closed` at
2026-09-16T03:27:02.168Z, candidate `223d36d6`,
`dpl_DujZEbBMVnCWo81sUdjBumKhR6KC`. Lesson recorded as a rule: attestation
evidence goes under `/Volumes/SmarterArchives/agent-evidence`, never under
`/tmp`.

### Source layer - code defects found by a no-mock real-geometry test

PR #1966 "fix(training): let a real canary parent reach the attestation
continuation cohort" (commit `1feebf43`, 2026-09-22; head `119bb996` after a
merge from `origin/main`). Writer-verified with `gh pr view 1966`: **OPEN**
at the time of writing, not merged, all listed checks passing (Audit-marker,
No Conflict Markers, No New Undefined Identifiers, Pre-Deploy Safety Checks,
TypeScript Check, U4.2/U4.3/U4.4, auto-merge queued). If it merges later the
squash SHA belongs in a follow-up entry, not here.

Defects it fixes (coordinator evidence, labels as used during the
investigation):

- (e) `stampSolverProvenance` ran `enforceSolverClaimHonesty` before the
  canonical policy existed, so every sealed row was downgraded to
  `verified: false` / `LEGACY_STRATEGY_ARCHIVE`.
- (b) The public three-quarter-pot rule required exactly `0.75`, while the
  canonical tree bets 412 into 550 (74.9%). The shared
  `src/lib/training/continuationSizingContract.mjs` now defines the target
  `0.75` with tolerance `0.03` and requires the candidate to be unique in
  that band (writer-verified constants at lines 15-16 of `1feebf43`).
- (f) The cohort preflight required a persisted policy seal that pre-upsert
  rows cannot have; the selector now passes an explicit `parentSeal:
  'preflight'` and nothing else changes.
- (c) Seven identical opaque 422s now emit a server-only stage-plus-counts
  log; the public response body is unchanged.
- (d) Heads-up families request only the BTN seat from
  `training_solver_spot_candidates_v1`.

Test evidence (coordinator): the new real-geometry test went from 2/16 to
16/16; `phase6-authority` 769/769 on the merged tree.

### Source layer - defect (a), not fixable in code

The current canonical tree (`scripts/preflop-deep/tree_gen.py`, line 52,
writer-verified: `for b in ([0.33, 0.75] if street == 0 else [0.75])`)
yields three actions at flop check-or-bet nodes {check, 33%, 75%} and two at
turn {check, 75%}. The Phase 4 four-answer contract (exactly four
meaningful, distinct, non-hinting options; only literal Yes/No and Push/Fold
excepted) therefore rejects both the real parent and the real child.
Padding the option list would fabricate a solver claim and was not done.

Required geometry for solver-exact Training questions: check-or-bet nodes =
check plus three distinct bet sizes on every street (for example 0.33 / 0.75
/ 1.25 pot); facing-bet nodes = fold, call and two raise sizes on every
street and raise depth; facing all-in stays Yes/No. That is a new
`tree_geometry` identifier, a new `phases.json` manifest version and
checksum, a new provenance tuple, and only then a bounded canary. Legacy
b182/b412 rows cannot be relabelled into that geometry.

### Audit-session custody

- Coordinator evidence: the 2026-09-15 custody session no longer exists in
  `auth.sessions`; the refresh token is rejected ("Refresh Token Not
  Found"); `refresh-session.mjs` was run once on 2026-09-23 and exited 1
  with the credential files left untouched.
- PR #1965 "fix(training): refresh the Phase 6 audit session once at
  attestation startup" merged 2026-09-23T04:03:40Z as
  `f8ef1cfc16294ce02864f21aa7cf25a7a2ebf450` (writer-verified). Its test
  file `__tests__/training-audit-session-refresh.test.mjs` declares 21 tests
  (writer-verified count); coordinator evidence: gate 774/774. Live
  `/api/health` reports `f8ef1cfc` on `dpl_AzDhU7aE7LaTRU2A93oBPeKGKuZY`
  (writer-verified).
- Follow-up commit `cdb9461a` "fix(training): persist the browser-rotated
  Phase 6 audit session back to custody" exists only on the local branch
  `agent/cowork-training-phase6-audit-session/fix/persist-rotated-browser-session`
  (writer-verified: not on `origin`, no pull request). It persists the
  browser-rotated session back to custody at the end of every run and adds
  `scripts/training-phase6-audit-session-custody.mjs
  --seed-from-storage-state` for re-seeding from the e2e auth storage state.
  Coordinator evidence: 16 tests; gate 790/790.
- Custody must be re-seeded before the next attestation run. Nothing in this
  record re-seeded it.

## 6G, 6H, 6I

- 6G (machine-administrator correlation): not started. It consumes 6F public
  evidence that does not yet exist in a passing state.
- 6H (PR-B strict delivery enforcement): not started and must not open before
  a genuine `releaseGateReady: true` receipt from 6G.
- 6I (final exact-build 107-game certification): its attestation-dependent
  part is blocked on 6F data. The non-attestation live checks on the deployed
  build (health, footer, Training smoke) are covered by the earlier Phase 6
  records and were not re-run for this entry.

## Solver Host Layer

Both solver hosts remain HOLD / stopped with the canary closed. The M1/M2
manifest remains `CLOSED` (`solver_ready: false`). No solve, canary,
ingestion, HMAC provisioning, credential rotation, or authority tuple was
performed. The M1 range-file count contradiction (470 committed versus 450
corrected, see `2026-09-11-m1-local-release-distribution.md`) remains
unresolved and blocks Stage A acceptance. The `strategy_matrix_v2` backfill
is untouched.

## Outside Findings (recorded, not acted on)

- Three production-installed migrations are still absent from source after
  #1821 (writer-verified absent from `supabase/migrations` on
  `origin/main`; sizes are coordinator evidence from the ledger):
  `20260914082602_integrity_hand_search_continuation` (4955 bytes),
  `20260914091400_operator_approval_concurrent_identity` (15519),
  `20260914113439_fleet_policy_and_audit_commit_together` (21899). None are
  Training or solver objects.
- Four source migrations have no production ledger row by version or name
  (writer-verified present in source; ledger absence is coordinator
  evidence): `20260907002000_phase6_content_modes_disabled`,
  `20260907200500_training_phase6_acl_contract_closeout`,
  `20260908023000_pnm_daily_tournaments_read_in_buy_in_order`,
  `20260908151000_training_phase6_cache_and_level_stats_authority`. Whether
  their effects were applied under another name is unknown.
- `/Volumes/SmarterWork` is at 100% (about 1.3 GiB free at the time of this
  record; about 1.5 GiB during the #1965/#1966 work). That prevented a local
  `npm run build` for #1965 and #1966; CI and Vercel built them.

## Honest External Dependencies For Closing Phase 6

1. One admitted M1 bounded-canary parent/child under the 2026-09-07
   admission runbook: signed gateway live, database credential rotation,
   one distinct HMAC per host, binary/pipeline/manifest attestation from an
   operator-controlled source, and an authority tuple. This first requires
   the richer tree geometry described under defect (a).
2. Re-seeded audit-session custody (via the `--seed-from-storage-state`
   path once its branch is published, or a fresh designated sign-in).
3. Disk headroom on `/Volumes/SmarterWork` so the local release gate,
   including `npm run build`, can run again before publication.

Until all three exist and the public run plus machine collector both pass
against one exact deployed build, Phase 6 stays open and Phase 7 does not
begin. The approved global header was not changed by any work recorded here.

## Commands Used For Writer Verification

```text
gh pr view 1762 1821 1939 1965 1966 --json state,mergedAt,mergeCommit,headRefOid
gh api repos/Smarter-Poker/Smarter-Poker-World-Hub/commits/22502e4b.../check-runs
gh pr checks 1939 ; gh pr checks 1966
shasum -a 256 supabase/migrations/20260913170000_*.sql supabase/migrations/20260913170312_*.sql
git log -1 4dc33a9b c1c73e11 13490915 1feebf43 cdb9461a ; git ls-remote --heads origin
curl https://smarter.poker/api/health ; curl -X POST https://smarter.poker/api/training/solver-worker
```
