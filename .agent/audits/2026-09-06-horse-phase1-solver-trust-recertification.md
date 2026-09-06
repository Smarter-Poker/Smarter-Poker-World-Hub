# Horse Brain Phase 1 Of 15: Solver Trust Re-Certification

Date: 2026-09-06
Scope: World Hub solver-policy readers, Training question generation, browser offline packs, retired solver RPCs, and the live Supabase schema invariant.
Production database: `kuklfnapbkmacvwxktbh`

## TL;DR

The original Phase 1 release, PR #1443 at `33e0c3b2474458345abb248de8022fed7f34522c`, removed the two unsafe RPCs but did not fully satisfy its own completion contract. A plain `CREATE FUNCTION` was invisible to the source law, an out-of-band database change could restore either name, and several deployed readers could still translate legacy `solved_spots_gold.strategy_matrix` data without knowing whether `f` came from legacy V1 or validated V2.

This re-certification closes those gaps. One source-aware trust boundary now rejects every legacy V1 matrix carrying `f` or `fold`, preserves Fold only after the strict 1,326-combo V2 bridge validates the payload, refuses fallback from a present invalid V2 artifact, invalidates pre-boundary browser offline packs, and is wired into every active solved-spots policy reader. A live event trigger permanently tombstones both retired RPC names across CREATE, CREATE OR REPLACE, ALTER RENAME, and ALTER SET SCHEMA operations.

Phase 2 did not begin in this change.

## Phase 1 Contract

The completion contract is:

1. `public.fn_pio_options_from_solver` has no live overload and is not callable.
2. `public.fn_chart_options_from_memory` has no live overload and is not callable.
3. A durable live-schema invariant prevents either public function name from returning without a reviewed forward migration that first removes the invariant.
4. No policy reader can reinterpret legacy V1 `f` as a Fold probability.
5. Validated V2 `f` remains available as the real Fold action.
6. A present but invalid V2 payload fails closed and never falls back to V1.
7. Pre-release browser packs cannot replay questions created before this trust boundary.
8. The repository test, type, lint, and production-build gates remain green.

## Evidence That The Legacy V1 Channel Is Unsafe

A read-only live query sampled 1,000 V1-only rows whose `frequencies.f` member is an object. It found 169,000 numeric values, of which 134,162 exceeded the maximum tolerated probability of 1.02. The minimum was 0, the median was 397.800049, and the maximum was 545.100098. Those values are measured EV or regret magnitudes, not Fold probabilities.

A separate bounded 10,000-row inventory found 2,342 V1-only rows carrying the suspect `f` channel in that sample. The exact inventory varies with the bounded live sample; the semantic conclusion does not depend on the count.

## Gaps Found In The Original Completion

### Source retirement law

The original regular expression recognized `CREATE OR REPLACE FUNCTION` but not plain `CREATE FUNCTION`. It also stripped only full-line SQL comments, so block-commented historical text could distort operation order. The expanded law detects both create forms, drop forms, line comments, block comments, and a broader set of runtime source types.

### Live schema durability

Dropping a function is only a point-in-time state. The names had already been resurrected outside the repository migration ledger once. Nothing in the original release prevented another CREATE, replacement, rename, or schema move from restoring the same API surface.

### Source provenance at runtime

Legacy V1 and validated V2 both use compact action codes, but only V2 defines `f` as Fold. Raw `strategy_matrix` readers lacked a source-aware distinction. Removing the two RPCs did not remove that structural risk from API routes, the deterministic engine, report readers, cache writers, and the PIO query service.

### Base-engine V2 wiring

Three direct `solved_spots_gold` projections in the base deterministic engine did not select `strategy_matrix_v2`. Direct engine instances could therefore never reach the authoritative artifact. Difficulty sorting and facing-bet geometry also read an untrusted matrix before question construction.

### Copy and mutation behavior

A JSON field such as `source: "pio_v2"` cannot be a trust seal because warehouse data can contain arbitrary keys. Validated bridge objects now receive process-local WeakSet trust. Explicit constrained copies inherit that trust only through `inheritSolverMatrixTrust`. The sanitizer also checks for a newly added untrusted `f` channel before its idempotence shortcut, so mutation after an earlier sanitize pass cannot smuggle Fold into policy.

### Browser hostile state

Training can serve an IndexedDB offline pack for up to 30 days. Version 1 packs predate this boundary and could retain an already-generated unsafe question even after server code was corrected. Offline cache version 2 rejects every pre-boundary pack and writes only post-boundary responses.

## Resolution

### Source-aware matrix boundary

`src/lib/training/solverMatrixTrust.js` owns four operations:

- `hasUntrustedLegacyFoldChannel` detects `f` or `fold` in legacy action lists and frequency maps.
- `selectTrustedLegacySolverMatrix` rejects a legacy matrix carrying either channel unless that exact object was produced by the live V2 bridge.
- `selectTrustedSolverMatrix` treats any present V2 artifact as authoritative, validates it through `v2ToAppMatrix`, caches the validated bridge by source-object identity, and returns null on bridge failure without a V1 fallback.
- `inheritSolverMatrixTrust` preserves process-local V2 trust only for an explicit constrained copy.

The V2 bridge cache avoids re-running the full 1,326-combo conversion during difficulty sorting and repeated question construction. Invalid artifacts are also cached as null for that source object and remain fail-closed.

### Runtime wiring

The boundary is called by these deployed policy surfaces:

- `pages/api/training/batch-preload.js` and `pages/api/training/get-question.js` call the patched `DeterministicGTOEngine`, whose fetch, rank, build, and next-street paths now enforce source trust.
- `pages/api/training/custom-train.js` constructs and patches its own engine instance and selects V2 provenance columns.
- `pages/api/training/browse-solutions.js`, `runout-report.js`, `solver-api.js`, `spot-drill.js`, and `tree-navigate.js` select trusted matrices before producing actions, grids, reports, or answers.
- `pages/api/training/aggregate-report.js` remains intentionally legacy-only and excludes untrusted rows while returning `excludedUntrustedSpots`; it does not relabel or silently normalize them.
- `pages/api/gto/gto-analysis.js` and `pages/api/assistant/sandbox/analyze.js` cross the same boundary before analysis. The assistant route loads the bridge only on its database cold path to preserve its serverless size budget.
- `pages/api/god-mode/fetch-hand.js` and the database reconstruction branch of `submit-action.js` reject untrusted solved-spots rows.
- `scripts/reseed-deterministic-cache.js` and `scripts/trivia-deterministic-seed.js` use the same selector, so offline generation cannot reintroduce the defect.
- `src/services/PIOQueryService.js` filters rejected rows and refuses frequency or EV reads from an untrusted matrix.

`src/lib/training/offlineQuestionCache.js` requires cache version 2 before returning a browser pack. The server-side `training_question_cache` already rejects unsealed warehouse rows through `cacheContract.mjs`; this release closes the remaining pre-boundary browser persistence path.

### Live schema tombstone

`20260906160000_guard_retired_solver_option_rpcs.sql` installs `trg_reject_retired_solver_option_rpc_ddl` on CREATE FUNCTION and ALTER FUNCTION. Its security-definer body has a fixed search path and no EXECUTE grant for PUBLIC, `anon`, `authenticated`, or `service_role`. The migration includes preflight assertions, post-apply assertions, active CREATE probes for both names, and a bounded rollback that removes only the guard.

The migration is already present in the live migration ledger as version `20260906160000`. It must never be edited after application.

## Live Database Proof

Read-only inspection and transaction-scoped active probes against project `kuklfnapbkmacvwxktbh` proved:

- `select 1` succeeded.
- Zero live `public` functions exist under either retired name.
- The event trigger exists, is enabled in origin mode, and listens to CREATE FUNCTION and ALTER FUNCTION.
- Direct CREATE probes for both names fail with SQLSTATE 55000 and leave zero functions behind.
- ALTER RENAME into both names fails.
- ALTER SET SCHEMA into `public` for both names fails.
- The temporary probe schema is removed after the transaction.
- Both PostgREST RPC calls return HTTP 404 with code `PGRST202`.
- The guard function has zero API-role EXECUTE grants.
- The only live function-definition reference to either retired name is the guard that rejects it.

The current Supabase dashboard showed 1 security error, 675 security warnings, 277 security information items, 0 performance errors, 51 performance warnings, and 615 performance information items. No contemporaneous pre-apply count was captured during this re-certification, so this document does not claim a count delta. The one visible security error concerned `public.spatial_ref_sys`, not this migration. Migration-specific checks directly prove a fixed search path and zero API-role exposure.

## Functional Regression Proof

The runtime probe loads the actual repository modules and proves all of these behaviors:

- a validated V2 matrix keeps `f` and creates a Fold question;
- the unpatched base deterministic engine can consume the selected V2 artifact;
- the patched engine preserves the same V2 Fold action;
- the same plausible V1 matrix returns no question;
- a V1 matrix sanitized before `f` is added is quarantined after that mutation;
- a copied or serialized `source: "pio_v2"` label cannot forge trust;
- a present malformed V2 payload cannot fall back to a clean-looking V1 payload;
- repeated reads reuse the same validated V2 bridge object.

After fast-forward integration with protected `origin/main` revision `b0b2395d27aec7035ba52c23c5807a5e64e70179`, verification passed:

- solver contract suite: 29 of 29 tests;
- expanded Training regression suite: 147 of 147 tests;
- Training route audit: 94 page files, zero missing defaults, pages, or APIs;
- TypeScript: `npx tsc --noEmit` exited 0;
- lint: all 3,997 bounded source and test files passed;
- modified JavaScript parse checks and `git diff --check`: passed;
- optimized production build: exited 0 and generated all 400 static pages;
- post-build Personal Assistant budgets: all green, including `pages/api/assistant/sandbox/analyze.js` at 58,734 of 60,000 bytes.

The build emitted existing framework deprecation notices and expected local warnings for production-only Supabase environment variables, but no compile, page-generation, test, type, lint, or performance-budget failure.

## Source Interrogation

A repository scan found 34 source files containing `strategy_matrix` or `strategyMatrix`. Active policy readers are wired above. The remaining references are bounded as follows:

- admin inspection and audit scripts observe raw data but do not produce poker actions;
- `scripts/audit-solved-spots-warehouse.js` uses a raw fallback only to classify warehouse coverage, not to serve policy;
- `src/content-engine/services/HorsePokerGTO.getPostflopStrategy` returns null before the historical raw matrix path, so the horse router cannot execute it today;
- `lib/god-mode-service.ts` is imported only by the dormant `lib/game-engine-service.ts` and a diagnostic script;
- `src/components/training/GameSession.tsx`, the only application caller of the old God Mode hand routes, is not imported or rendered by a page; active Training renders `GodModeArena`;
- the old God Mode submit route still contains a synthetic demonstration fallback and frequency-derived per-action EV. It is not treated as solver evidence, and full removal belongs to Phase 2 output taxonomy rather than being silently expanded in Phase 1;
- full cache taxonomy, canonical solver policy service, corpus coverage, facing-bet harvesting, and horse-runtime solver agreement remain later declared phases.

No active runtime source calls or advertises either retired RPC.

## Collateral Behavior

The intended behavior change is fail-closed. V1 rows carrying `f` disappear from action-producing surfaces instead of being reinterpreted. A valid V2 row remains available and can still produce Fold. A present corrupt V2 row becomes unavailable rather than silently using V1. Aggregate reports expose excluded row counts. Old browser offline packs miss cache and require a fresh server response. No poker strategy threshold, range, sizing, payout, chip movement, or horse action logic changes in this phase.

## Rollback

Application rollback can remove the trust-selector calls, but doing so would restore a known false-policy path and is not recommended. Database rollback is the commented forward-migration block in `20260906160000_guard_retired_solver_option_rpcs.sql`; it removes only the event trigger and guard function and does not restore either unsafe RPC. If either retired name is intentionally reused, one reviewed migration must remove the tombstone and a separate reviewed migration must create the replacement.

## Publication Proof

This audit is part of the same protected change as the implementation. Its presence in `origin/main` is verified with `git cat-file -e origin/main:.agent/audits/2026-09-06-horse-phase1-solver-trust-recertification.md`. The exact merge is discoverable with `git log --follow -- .agent/audits/2026-09-06-horse-phase1-solver-trust-recertification.md`. A release is not called published until production `/api/health` serves a main revision containing that merge and Build Safety Gate is green for the release.

## Next Phase Boundary

After the publication proof is green, Phase 2 may build the canonical Solver Policy Service. This re-certification does not start Phase 2.
