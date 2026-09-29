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

## 2026-09-23 Closing Entry

Written from a fresh worktree at protected `origin/main` `7e3cd971` after the
worktree that produced the entry above was removed. The same provenance
tags apply: **writer-verified** (re-run here with `gh`, `git`, `curl`, or by
reading the evidence files under `/Volumes/SmarterArchives/agent-evidence`)
or **coordinator evidence**. Phase 6 remains open; Phase 7 has not started.

### Source and merge layer (writer-verified with `gh pr view`)

| PR | Title | Merged (UTC) | Squash SHA |
| --- | --- | --- | --- |
| #1966 | fix(training): let a real canary parent reach the attestation continuation cohort | 2026-09-23T04:43:37Z | `16bafcb2c0af11558104626e95b86285dec018ab` |
| #1968 | docs(training): record Phase 6 source/database repair, cohort truth and remaining gates | 2026-09-23T04:44:55Z | `e52f7bf5a6662c57252e235a8afa09aef88fd757` |
| #1967 | fix(training): persist the browser-rotated Phase 6 audit session back to custody | 2026-09-23T04:49:34Z | `21882008b111546aad663cb30c21f1a810bcfe38` |
| #1969 | test(training): inject custody persist failures without relying on directory modes | 2026-09-23T05:12:05Z | `cc2f82c422ed520390eeec347a56f76b516dac80` |
| #1972 | fix(training): a declared-preflop game takes the honest authored fallback instead of a refused range batch | 2026-09-23T13:38:41Z | `c3485b7a88ddaa5bf1c000ecf38ff46e5179884b` |

This supersedes the "still open" and "not yet pushed" statements in the
entry above for #1966 and for commit `cdb9461a` (published as #1967).

### Deployment layer

- #1967's Vercel production build **failed** (`dpl_GRd2kSNMxpHbhdttcVZ1jAQSJjCR`;
  the `Vercel` commit status on `21882008` is `failure`, writer-verified via
  the GitHub commit status API). Coordinator evidence for the cause: two
  tests in `__tests__/training-audit-session-browser-custody.test.mjs`
  simulated a read-only directory with `chmod`, and Vercel builds as root,
  for whom the mode is not enforced. Production stayed on `e52f7bf5`; there
  was no live impact.
- #1969 replaced the mode-based simulation with injected persist failures
  (coordinator evidence: 16/16 as uid 501 and as uid 0). Coordinator
  evidence: `/api/health` then reported `cc2f82c4` on
  `dpl_FXviP4VSWFvemGL1hhJQDDHFEZic`.
- Writer-verified at 2026-09-23T13:51:24Z: `/api/health` reports
  `c3485b7a88ddaa5bf1c000ecf38ff46e5179884b` on
  `dpl_31QqZW1juxyzyDUirnHzjZPr82HM`, `status: ok`.

### Audit-session custody (coordinator evidence)

Re-seeded 2026-09-23T04:52Z with
`scripts/training-phase6-audit-session-custody.mjs --seed-from-storage-state`
from the repository's e2e auth storage state (`e2e/00-auth.setup.ts`, run
against `https://smarter.poker` with the project's `TEST_USER` account,
which is the designated audit UUID `2d1cd6c3-...`). Both custody files are
mode `0600`; `sessionValidUntil` 2026-12-22T04:43:02Z; access token valid to
2026-09-30. The out-of-Git `refresh-session.mjs` then exited 0 with
`refreshed: false` and `liveTrainingApiStatus: 200`. No token value was
displayed or recorded anywhere, including here.

### Live UI layer - bounded production smoke (writer-verified from the evidence files)

Evidence directory
`/Volumes/SmarterArchives/agent-evidence/cowork-training-phase6-20260922/smoke-9373149ecb83/`
(51 files: per-case question/feedback screenshots, login screenshots, and
three `p6-smoke-results-*.json` runs). Playwright/Chromium, mobile 390x844
and desktop 1440x1000, one graded answer per case, against
`9373149ecb83b6f7130ca920535e3592a17dfce3` on
`dpl_ABM49N3Xt2hCjaEb59teyW4BcFq2` (recorded in the file's `healthBefore`).

The final run (`p6-smoke-results-1790168654577.json`, 13:01:47Z to
13:04:14Z) records `summary: total 24, pass 19, fail 5, loginPass 2`:

- Passing on every assertion (19): cash-002 L1 and L8, cash-012, cash-018,
  spins-001, mtt-001 (Push/Fold, two options as the contract allows),
  mtt-002, adv-011 and quiz-gauntlet on both viewports; mtt-021 desktop.
- Failing only the `no_console_errors` assertion (3): mtt-021 mobile (one
  503), psy-001 mobile and desktop (one 422 each). Their gameplay
  assertions passed.
- Failing outright (2): cash-001 L1 mobile and desktop
  (`page.waitForFunction` timeout after a 404 from batch-preload).
- `/auth/login` mobile and desktop: pass, no hydration messages.

Coordinator evidence for the 22 pages that loaded: four options (two for
Push/Fold), verdict plus Your Answer plus Correct Answer, feedback persisted
at least 3 s without auto-advance, "Next Question" present, record-question
200 with server `isCorrect` equal to the on-screen verdict on all 22, zero
`pageerror`s, zero scanline animations, 0 px horizontal overflow, exactly one
`.approved-global-header` per page with an identical outerHTML hash across
all 22 pages. Screenshots were size/entropy-checked, not inspected by eye;
this smoke is therefore not the Phase 6 visual certification. Two earlier
runs in the same directory (12:49Z and 12:57Z) failed on a harness locator
before the assertion was corrected; they are retained, not counted.

Observed failures and their status:

1. **cash-001 L1: HTTP 404 on 4/4 attempts** (batch-preload "No questions
   available"; runtime log "DeterministicEngine generated 40 solver
   questions ... engines returned empty"). Root cause (coordinator evidence,
   reproduced in-process with the real handler against an empty database,
   identical on pre-#1966 files, so **not a #1966 regression**):
   declared-preflop games (cash-001, cash-008) are served by
   `generateFromLocalSolverRanges` (source `local_solver_ranges`), sealed
   `LEGACY_UNVERIFIED`, and refused for campaign attempts by the #1617
   (2026-09-08) practice-only rule `local_range_provenance_missing`;
   `generateBatch`'s preflop branch never reached the authored-concept
   curated fallback that every other PioSOLVER game takes. Fixed by #1972
   (`c3485b7a`, writer-verified merged): campaign callers pass
   `admissibleForCaller = isTrainingQuestionCampaignEligible`; practice
   callers are unchanged; nothing was relabelled. New
   `__tests__/training-campaign-batch-game-matrix.test.mjs` (writer-verified
   present on `origin/main`) runs all 107 games through the real handler
   (coordinator evidence: 4/11 to 11/11; `phase6-authority` 818/818).
   Consequence: the 2026-08-31 Phase 5 range-spot behaviour for cash-001 and
   cash-008 is superseded by authored preflop concept questions until the
   local 6-max range corpus is admitted as an audited local policy (an
   authority decision plus a `fn_training_cache_row_is_valid` migration,
   neither done).
2. **Intermittent 503 `TRAINING_PERSISTENCE_UNAVAILABLE`** when two browser
   contexts preloaded the same game/level in the same second (canonicalize
   upsert; the client recovered). Pre-existing; pinned by the matrix test;
   not fixed (persistence-path ordering/retry).
3. **psy-001 422 `TRAINING_ATTEMPT_QUESTION_SHORTFALL`** ("31 of 40
   candidates could not be canonicalised: Duplicate canonical question
   identifier") while the UI still served 20 questions from cache.
   Pre-existing; pinned by the matrix test; not fixed (SCENARIO bank sizes
   of 8-9 unique hands versus the 20-hand minimum).

Follow-up smoke at 13:46Z on `c3485b7a` (`dpl_31QqZW1juxyzyDUirnHzjZPr82HM`),
evidence `.../smoke-c3485b7a88dd/p6-smoke-results-1790171233435.json`
(writer-verified: `total 3, pass 3, fail 0, loginPass 2`): cash-001 L1 mobile
and desktop and cash-002 L1 desktop pass all 22 assertions. Coordinator
evidence: batch-preload 200 with 20 CURATED four-option preflop questions
carrying "Expert-authored poker concept; no solver-exact frequency or EV is
claimed."; runtime log "generated 25 solver questions" with no "engines
returned empty". The header outerHTML hash differed from the earlier smoke
only by a notification-badge span (1 unread); no header source is in any
diff recorded here.

### 6I - full 107-game runtime recertification: refused, not run

`scripts/training-runtime-surface-audit-supervisor.mjs` (Node 24.12.0) was
attempted at 05:18Z against `cc2f82c4`. Coordinator evidence: it was refused
by its own gate, "runtime audit requires at least 8.0 GiB free; found 1.6
GiB" (statfs of the worktree on `/Volumes/SmarterWork`). After removing only
this task's two merged worktrees (about 5.5 GiB) the volume had about 7.1
GiB free (writer-verified `df` at the time of this entry: 5.1 GiB free after
the new worktree branch was created), still below the gate. The receipt
`/Volumes/SmarterArchives/agent-evidence/cowork-training-phase6-20260922/runtime-recert-cc2f82c422ed520390eeec347a56f76b516dac80.json`
(writer-verified, 296 bytes, mode `0600`) records `status: failed`,
`success: false`, `certificationMode: full`, `expectedBuild: cc2f82c4...`,
supervisor `attempts: 4`, `exitCode: 1`. It is a refusal receipt and must
not be read as a certificate.

### Public attestation layer - not re-run

The public delivery-authority attestation was deliberately not re-run:

1. Its outcome is predetermined by the data dependency recorded above (no
   admitted canary, zero provenance-complete artifacts).
2. Immutable `hub-vanguard-*.vercel.app` deployment URLs now answer HTTP 302
   to Vercel SSO (deployment protection). Writer-verified: `GET
   https://hub-vanguard-47lpiw333-smarter-poker.vercel.app/api/health` ->
   302 to `https://vercel.com/sso-api?...`. No
   `TRAINING_PHASE6_VERCEL_PROTECTION_BYPASS_SECRET` is configured in the
   custody env (coordinator evidence). Re-running requires the owner to
   provision that bypass secret into the mode-`0600` custody env, never
   through chat; it is recorded below as an external dependency.

### 6G, 6H, solver hosts

Unchanged from the entry above: 6G not started; 6H not started and must not
open before a genuine `releaseGateReady: true`; both solver hosts stopped,
canary closed, `solver_ready: false`; `strategy_matrix_v2` backfill
untouched; M1 range-file count contradiction unresolved.

### Remaining external dependencies for closing Phase 6 (as of 2026-09-23)

1. One admitted M1 bounded-canary parent/child under the 2026-09-07
   admission runbook, which first requires the richer tree geometry
   described under defect (a).
2. `TRAINING_PHASE6_VERCEL_PROTECTION_BYPASS_SECRET` provisioned by the
   owner into the custody env so the attestation can reach the immutable
   deployment URL.
3. At least 8 GiB free on `/Volumes/SmarterWork`, or an owner decision to
   run the runtime auditor from another volume, for the 107-game matrix.
4. Then, in order: 6G machine-administrator correlation, 6H PR-B strict
   enforcement, 6I recertification on the exact deployed build.

Audit-session custody is no longer a blocker (re-seeded, see above), but it
expires and must be refreshed or re-seeded before any run past 2026-09-30
if the startup refresh cannot rotate it.

Phases 1-5 remain complete. Phase 6 remains open. Phase 7 has not started.
The approved global header was not changed by any work recorded here.

### Commands used for writer verification (this entry)

```text
gh pr view 1966 1967 1968 1969 1972 --json state,mergedAt,mergeCommit
gh api repos/Smarter-Poker/Smarter-Poker-World-Hub/commits/21882008.../status
curl https://smarter.poker/api/health
curl -o /dev/null -w '%{http_code} %{redirect_url}' https://hub-vanguard-47lpiw333-smarter-poker.vercel.app/api/health
python3 (read-only) over the p6-smoke-results-*.json and runtime-recert-*.json evidence files
ls __tests__/training-campaign-batch-game-matrix.test.mjs __tests__/training-audit-session-browser-custody.test.mjs
```
