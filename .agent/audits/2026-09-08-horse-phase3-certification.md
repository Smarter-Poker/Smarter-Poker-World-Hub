# Horse Brain Phase 3 Deep Certification

Date: 2026-09-08  
Scope: Phase 3, "Truthful Training cache and output taxonomy"  
Database: Supabase project `kuklfnapbkmacvwxktbh` only  
Repositories: `Smarter-Poker-World-Hub` and `smarter-poker-workers`

## Certification standard

This is a release-blocking re-audit, not a restatement of the earlier Phase 3
completion record. The review covered the live Training routes, every Phase 3
cache and answer write boundary, the database-owned grading and event ledger,
the daily drift audit, the Workers deployment, the OpenClaw schedule, and the
player-visible provenance copy. A local test pass is not publication. The
correction branch must merge through protected main, production must serve a
descendant of the merge, and the authenticated production probes must pass
before Phase 4 begins.

## Defects found

### P0: New cash and tournament questions could not be served

Authenticated production probes returned HTTP 503 with
`TRAINING_PERSISTENCE_UNAVAILABLE` for both `get-question` and `batch-preload`
on `cash-001` and `mtt-001`. The strict database contract correctly rejected
fresh fallback rows because the application retained `local_solver_ranges` as
the top-level source after classifying the row as `LEGACY_UNVERIFIED`. The
database requires all unverified fallback policies to use the canonical
`LEGACY_STRATEGY_ARCHIVE` envelope.

Correction:

- `buildTrainingCacheRow` now normalizes every legacy fallback before it
  reaches Postgres.
- The original local source survives as `legacySource`; it is not promoted to
  solver evidence.
- The batch path recognizes local-range provenance before applying any
  fallback transformation.
- The record route accepts this exact canonical local preflop archive only at
  the server-owned readback boundary. Normal cache readers still reject it as
  solver evidence.

Local application probes against the production database then returned 200 on
all four routes, with a policy checksum and the truthful
`LEGACY_UNVERIFIED` classification on every returned question.

### P0: Historical answer rows made claims the original receipt could not prove

All 1,967 pre-certification answers lacked a policy checksum, while 1,120 of
those historical rows claimed `solver_verified = true`. A current policy row
cannot retroactively prove which policy the player actually received. Forty-
five of the 88 active-cache answers sampled before repair also disagreed with
the current policy grade, proving that regrading history against today's cache
would manufacture evidence rather than recover it.

Correction in `training_cache_event_integrity`:

- Historical no-checksum answers retain their prior claims in metadata but are
  downgraded to non-solver, non-measured evidence.
- Historical event rows are explicitly labelled `HISTORICAL_UNBOUND`.
- New evidence is labelled `CHECKSUM_BOUND` only when it carries the exact
  served policy checksum.
- The production migration is ledgered as
  `20260908125038 training_cache_event_integrity`.

Live post-apply state at certification time: 1,968 answers, one checksum-bound
answer, zero solver-verified answers, and zero solver-verified answers without
a checksum.

### P0: Answer idempotency could mutate evidence or fail on a legitimate retry

`record-question` used an upsert on `(user_id, submission_id)`. The database no
longer granted answer updates, so an exact network retry failed. If update
rights were restored, the same submission identity could be rebound to a
different action or policy.

Correction:

- Answer creation is insert-only.
- A duplicate submission ID is acknowledged only after a server readback and
  a full immutable binding comparison across identity, action, grade, numeric
  evidence, solver fields, and provenance metadata.
- An exact retry returns 200 with `idempotent: true`.
- A changed action under the same submission ID returns 409 with
  `TRAINING_ANSWER_BINDING_MISMATCH`.

The local authenticated flow proved all three outcomes: first insert 200,
exact retry 200, and changed retry 409.

### P0: The event ledger could be mutated directly and replay keys did not bind the action

`service_role` retained direct event-table mutation grants. An answered-event
replay compared its question, user, correctness, and checksum, but not the
selected action or complete metadata. This allowed a caller to reuse an event
identity without proving the same decision.

Correction:

- `service_role` now has `SELECT` only on `training_question_events`.
- Writes must cross the security-definer RPC, which locks the cache row and
  updates counters atomically.
- Every new answered event requires `selectedAnswer`.
- An existing event key must match the complete immutable metadata and action
  binding or the RPC rejects it.
- Missing historical answer events were backfilled as unbound evidence, never
  as fresh policy proof.

Live post-apply state: 2,930 events, 1,625 answered events, zero answered
events missing a selected action, zero active-cache answers missing an event,
and zero cache-counter mismatches. The event table exposes only `SELECT` to
`service_role`.

### P1: Player copy claimed solver authority that production did not have

The Spot Trainer described all spots as "Solver-Verified" and "GTO" even
though production contains no cache row that qualifies for a solver-backed
classification.

Correction: the surface now says "Provenance-Labelled", "Canonical Policy",
and "Policy Action". The existing source badge remains the authoritative
classification. No legacy, curated, heuristic, or unsealed row is described as
exact solver output.

### P1: The daily audit had a one-shot schedule failure mode

The 2026-09-08 08:10 UTC OpenClaw pass reached the correct Workers route but
returned HTTP 500 after a database statement timeout. The failure was recorded
in `cron_execution_log`, but there was no same-day retry and the route was not
in `CRITICAL_JOBS`. A single transient failure could therefore remove the
day's integrity audit without paging an operator.

Correction:

- Keep the primary 08:10 UTC pass.
- Add an idempotent recovery pass at 08:25 UTC.
- Treat two consecutive failures as critical, so both daily passes failing
  reaches the existing operator alert path.

After the database repair, two authenticated live invocations succeeded. The
OpenClaw-to-Workers probe completed in 947 ms with status `healthy`, 851 rows
and counters inspected, zero drift, zero repairs, zero quarantines, and no
findings.

## Live database truth

The final pre-release read-only snapshot reported:

| Invariant | Result |
| --- | ---: |
| Cache rows | 27,532 |
| Serving rows | 27,532 |
| Solver-classified rows | 0 |
| Curated rows | 345 |
| Heuristic rows | 108 |
| Legacy-unverified rows | 27,079 |
| Solver-verified answers | 0 |
| Solver-verified answers without checksum | 0 |
| Active-cache answers missing event | 0 |
| Answered events missing selected action | 0 |
| Counter mismatches | 0 |
| Event mutation grants to `service_role` | 0 |

Zero solver-classified rows is honest, not success at solver coverage. Building
and certifying the NLH solver corpus remains Phase 4. Relabelling the 27,079
legacy rows would be a regression of Phase 3.

## Verification evidence

- Expanded Training, solver, adversarial, horse-policy, and leak suite:
  193 of 193 passing.
- OpenClaw schedule, routing, secret separation, alerting, and Python syntax:
  26 of 26 passing.
- Full World Hub build pipeline: 1,665 of 1,665 tests passing, 397 static pages
  generated, production build complete, and all Personal Assistant size budgets
  passing.
- ESLint: 4,074 of 4,074 files passing.
- Training route inventory: 94 files checked, zero missing pages, APIs, or
  default exports.
- Fresh PostgreSQL 17 replay: expansion through integrity migration passed,
  including historical and current bindings, daily and leak caller
  compatibility, exact counters, SELECT-only event grants, and a healthy audit.
- RLS migration scan: 443 migrations checked, zero unscoped policy patterns.
- Live policy-function grant check: zero role/function execution gaps.
- Supabase security advisors: zero findings tied to the Phase 3 tables or
  functions.
- Supabase performance advisors: two informational unused-index notices on
  `idx_training_answers_snapshot_key` and
  `training_question_cache_scenario_hash_idx`. Both are retained until the new
  workload has representative traffic.
- Workers production health: exact version
  `d73743e077b5be9771ffe729fdc6731832afd138`, healthy container.
- OpenClaw before this correction: active, zero restarts, and byte-identical to
  its then-current protected-main source.

## Certification-harness follow-up

The post-merge repository-wide mobile-menu gate exposed a stale assertion in
`024-world-menu-mobile-phase3.spec.ts`. Poker Near Me deliberately uses
`overflow: clip` instead of `overflow: hidden` so WebKit does not turn the body
into a fixed-position containing scroll box. The product still locks the root
scroller, and the dedicated WebKit contract in
`023-world-menu-webkit.spec.ts` already accepted both safe implementations.
The Phase 3 mobile contract contradicted that rule and therefore reported a
known-good production lock as a failure in both Chromium and WebKit.

The shared modal-isolation assertion now verifies the real invariant: body
overflow must be `hidden` or `clip`, and either the body must be fixed or the
root scroller must also be locked. It does not weaken focus isolation, inert
branch, containment, sizing, sticky-action, or Escape-return checks. The exact
production matrix passed 36 of 36 tests after the correction, including Poker
Near Me in Chromium and WebKit. This is a test-contract repair only; it changes
no player runtime or horse policy.

The same post-release sweep then reproduced a separate footer accessibility
regression in both browser engines. Preserving each approved artwork's aspect
ratio had made the Training footer stage 260.81px wide at the 320px viewport,
so six equal controls were only 43.47px each. `artworkStageStyle` now receives
the real item count and floors the stage at one 44px target per item plus a
one-pixel cross-engine rounding guard while remaining capped to the viewport.
Each hit zone also carries an explicit 44px minimum. The artwork keeps its
aspect ratio, the clearance spacer uses the identical geometry, and wider
viewports retain the existing Club Arena height cap. The local production
build passed the 14-world 320px and seven-viewport Training geometry probes in
Chromium and WebKit, 4 of 4. Horse policy and the action clock remain untouched.

## Runbook for two failed cache-audit passes

1. Read `cron_execution_log` for `/cron/training-cache-drift-audit` and retain
   the HTTP result and database error.
2. Verify Workers `/health` reports the protected-main Workers SHA.
3. From the OpenClaw host, use its existing host-local credential to call the
   Workers route. Never print or copy the credential into a report.
4. Run `fn_training_cache_run_drift_audit(current_date)` through the approved
   service boundary and inspect the returned shard metrics.
5. Check `pg_stat_activity` for locks or timed-out audit calls before changing
   SQL. Do not replace the bounded shard audit with a full-table request.
6. Treat any nonzero content, policy, classification, source, chart-source,
   lineage, or counter drift as a Phase 3 production incident.

## Release boundary

This branch is releasable only after the protected push workflow passes, the
pull request auto-merges without an administrative bypass, Vercel serves a
protected-main descendant containing these corrections, OpenClaw deploys the
two-pass schedule, and authenticated production question and answer probes
repeat the local results. The user-facing 15-phase build plan carries those
post-merge receipts because a commit cannot truthfully attest to its own future
merge and deployment.
