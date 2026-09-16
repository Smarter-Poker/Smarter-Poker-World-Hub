# Trivia Phase 1 Release Report

Status: **COMPLETE**  
Phase: 1 of 12 — Control Plane, Production Baseline, and Competitive Containment  
Release date: September 6, 2026  
Implementation baseline: `d8109a3a2933f2d2611dac1f7257a53c11f30522`  
Verified Phase 1 code baseline: `d6084229a59e3c51769e94ee945b9795df3a8804`

Release authorization: Smarter.Poker owner authorization in the originating task  
Release/rollback executor: Codex, using the repository's guarded release workflows

This report is the production evidence record for Phase 1. PvP, PvP horses,
tournaments, and tournament horses remain fail-closed. Phase 1 does not enable
competitive play; it makes the existing surface safe enough for later engines to
be built without exposing browser-owned records or untracked diamond movement.

## Delivered scope

- Added four exact-`true`, server-only release controls, all documented and
  defaulted off.
- Retired the legacy PvP cleanup and tournament lifecycle schedules from Vercel,
  OpenClaw, and worker routing. Retired worker endpoints return authenticated
  `410 Gone`, `Cache-Control: no-store`, and a zero-movement receipt.
- Made PvP and tournament pages and public APIs fail closed while disabled,
  including generic session start/answer/submit branches and public settlement.
  The secret-authenticated PvP recovery sweep remains manually available so a
  kill switch cannot strand funded escrow; it is unscheduled, non-cacheable,
  validates authoritative state, and had an empty queue in production smoke.
- Replaced browser-owned competitive mutation with service-role-only database
  contracts, strict RLS/ACLs, exact function grants, and caller-bound reads.
- Added normalized PvP session links and active seats, immutable settlement
  decisions, atomic settlement/crediting, quarantine evidence, constraints,
  indexes, and score-only alias synchronization.
- Preserved all historical rows. Four abandoned human-versus-horse matches and
  one completed-status but unsettled eight-horse tournament are quarantined and
  frozen without new payout, refund, deletion, or rank rewriting.
- Removed answer-oracle leakage: a correct answer and explanation are returned
  only after the first answer is durably and uniquely recorded.
- Added a canonical fifteen-mode lobby catalogue. Daily Trivia and Quick Stakes
  keep their approved identity; every middle card uses distinct existing art,
  mobile cards stack image above copy/action, and desktop keeps a separate
  three-column composition. Disabled competitive cards render honest maintenance
  state instead of launching legacy clients.
- Added reproducible baseline, migration rehearsal, direct production database
  verification, authenticated production smoke, and release evidence tooling.
- Closed a cross-product diamond-receipt substitution defect found during the
  final audit. A caller can no longer pre-seed a cheap debit under a predictable
  reference and replay it as a five-diamond Trivia lifeline. The database now
  binds an idempotent debit to its exact amount, transaction type, counterparty,
  issuance class, user, and reference; the API also enforces the server-owned
  lifeline price and validates the complete database receipt.
- Hardened the shared World-menu release gate after it exposed five independent
  UI/CI regressions: nondeterministic full-page screenshots, duplicate Preflop
  triggers, a WebKit page-transition blank frame, and a delayed tutorial dialog
  that could remain focusable behind an open modal menu. The fifth was a
  WebKit-only ownership race in which Trivia's page-owned drawer opened while the
  approved header remained collapsed and mounted a duplicate fallback trigger.
  Static-transition pages now use ordinary DOM rather than a motion element, so
  their header is visible and interactive on the server paint and every client
  frame. Open menus keep late-mounted page branches inert while preserving their
  authorized child dialogs. Trivia now controls the approved header directly,
  eliminating the lossy passive-event handoff. The CI paint gate remains bounded
  at 20 seconds and emits ancestor diagnostics only if the original five-second
  baseline is exceeded.

## Production database release

| Evidence | Recorded value |
|---|---|
| Supabase project | `kuklfnapbkmacvwxktbh` |
| Migration | `20260906120000_trivia_pvp_containment.sql` |
| Migration SHA-256 | `6e53f56b5e86b1af6c342f6be27daac4d4790a4cab72f0edec24059348656a85` |
| Applied at | `2026-09-06T12:32:46.619Z` |
| Executor | Anti-Gravity DB Push v3.0, single self-asserting transaction |
| Migration ledger | version `20260906120000`, recorded |
| Rehearsal | rollback-only exact migration, passed in 18.7 seconds |
| Direct production verifier | `17/17` top-level assertions passed; every named component count was exact |
| Browser-role abuse matrix | `70/70` denied inside rollback-only probes |

The verifier binds both PostgreSQL and REST credentials to the expected project
before inspection. It checks 10 RLS-enabled base tables, the public tournament
view, 12 exact policies, table and effective column ACLs, 13 RPC ACLs, 19 function
definitions/search paths, 13 triggers, 39 constraints, 9 critical indexes,
quarantine identity, historical row counts, and the competitive diamond ledger.

### Post-release diamond debit integrity correction

| Evidence | Recorded value |
|---|---|
| Migration | `20260906210000_deduct_diamonds_idempotency_binding.sql` |
| Migration SHA-256 | `432c7e500e780721d07f24e4db72ba5f9bd18faa86675ed847ff62cd6ca18d99` |
| Migration ledger | version `20260906210000`, recorded |
| Database PR / merge | [#1500](https://github.com/Smarter-Poker/Smarter-Poker-World-Hub/pull/1500) / `8b6c5959c8e4fe506934eb8f88f2889be18c03a9` |
| Application PR / merge | [#1501](https://github.com/Smarter-Poker/Smarter-Poker-World-Hub/pull/1501) / `105171babdd0406704c4b0afe5c98877fe344662` |
| Installed function source MD5 | `d31eb35015d0b050834f518a2b628442` |
| Function privilege boundary | `PUBLIC`, `anon`, and `authenticated`: no execute; `service_role`: execute |
| Rollback-only migration rehearsal | passed; exact pre-migration source MD5 `b7238d237b723d59443b96711a8a887a` restored |
| Post-deploy live verifier | six adversarial cases passed; exact replay remained recoverable after a later balance change |
| Rehearsal residue | zero wallet changes and zero ledger rows |
| Production invalid-price probe | HTTP `400`, `invalid_spend_amount`, expected amount `5`; wallet and reference-row counts unchanged |

The live verifier proved price, type, and recipient substitutions fail as
`idempotency_conflict`; exact retries remain successful and charge only once;
and a genuinely new debit still fails on insufficient funds. The migration kept
one canonical overload, `SECURITY DEFINER`, and the fixed search path
`public, extensions`. Security-advisor results were identical before and after
the correction: 950 findings (`1` error, `672` warning, `277` information);
performance-advisor results remained 665 (`0` error, `51` warning, `614`
information), with no finding against `deduct_diamonds`.

## Before/after evidence

Query pack: `scripts/trivia/phase1-competitive-baseline.sql`  
Query-pack SHA-256: `0729cfd01085ed76008ce3b824839d49b88abfe60921fd2ff070295717d420c2`

| Evidence | Pre-deploy | Post-deploy |
|---|---|---|
| Captured at UTC | `2026-09-06 11:45:49.906278` | `2026-09-06 12:36:51.181204` |
| Artifact | `docs/trivia/evidence/phase1-predeploy-20260906-1145utc.txt` | `docs/trivia/evidence/phase1-postdeploy-20260906-1236utc.txt` |
| Artifact SHA-256 | `ddd40a1ad14bc50ac1e39fe9995a5b7ce9633a231fcdb366912fbc4f97c762c5` | `bab66580b0e429cf221c7ce12ccac14cf63ad778054dce76b51f68e6395f5ad9` |
| PvP matches / abandoned / open | `4 / 4 / 0` | `4 / 4 / 0` |
| Queue rows / waiting | `11 / 0` | `11 / 0` |
| PvP sessions | `3` | `3` |
| Tournaments / open / entries | `5 / 0 / 208` | `5 / 0 / 208` |
| PvP refunds | `488 / +14,240` | `488 / +14,240` |
| PvP stakes | `3 / -120` | `3 / -120` |
| Alias trigger MD5 | `76d93b03326225f21c330b38d77e63af` | `ee5b33e4582a674194055a5e2e516b80` |
| New containment structures | absent | all present |
| Compact security postconditions | all pre-release controls false | all required controls true |

Economic and lifecycle totals are identical before and after the migration. The
only intended changes are security/schema controls and the replayable score-only
trigger. Every retained competitive transaction has a non-empty reference;
duplicate user/reference groups are zero. The quarantined completed-status but
unsettled tournament received no payout.

## Worker release

| Evidence | Recorded value |
|---|---|
| PvP/tournament retirement PR | [Smarter-Poker/smarter-poker-workers#100](https://github.com/Smarter-Poker/smarter-poker-workers/pull/100) |
| Retirement merge SHA | `1ee4b2d53afbb2b4e6561963022c9481fa4dc3b1` |
| Retirement required CI | [run 34030843142](https://github.com/Smarter-Poker/smarter-poker-workers/actions/runs/34030843142) |
| Retirement deployment | [run 34030940118](https://github.com/Smarter-Poker/smarter-poker-workers/actions/runs/34030940118) |
| Version-stamp repair PR | [Smarter-Poker/smarter-poker-workers#101](https://github.com/Smarter-Poker/smarter-poker-workers/pull/101) |
| Version-stamp merge SHA | `6e39c5140df58a2457e9baf5ed930b2403aa0dee` |
| Required CI / post-merge CI | [34031198264](https://github.com/Smarter-Poker/smarter-poker-workers/actions/runs/34031198264) / [34031284978](https://github.com/Smarter-Poker/smarter-poker-workers/actions/runs/34031284978) |
| Production deployment | [run 34031284943](https://github.com/Smarter-Poker/smarter-poker-workers/actions/runs/34031284943) |
| Production health version | exact full SHA `6e39c5140df58a2457e9baf5ed930b2403aa0dee` |
| Retired route probes | all `410`, `no-store`, `diamonds_moved: 0` |
| Worker tests | `248/248` passed; typecheck/build passed; lint 0 errors |

## World Hub gates completed before publication

- Phase-specific contracts: `38/38` passed.
- Repository prebuild gate: `645/645` passed on the implementation baseline.
- Optimized Next.js production build: passed; 400 static pages generated.
- Migration rehearsal: passed and rolled back without residue.
- Production database verification: `17/17` top-level assertions passed, with
  exact component inventories and `70/70` rollback-only abuse probes denied.
- Descendant main Playwright matrix: `733 passed`, `24 intentionally skipped`,
  `0 failed` across 757 tests.
- Whitespace/error checks: passed.
- Latest-main overlap audit: upstream changes in shared test/package/scheduler
  files were preserved before release.

## Final closeout gates

- Phase-specific contracts: `40/40` passed on exact descendant main.
- Every Trivia contract: `77/77` passed, including the eight lifeline-spend
  integrity cases.
- Blocking repository meta-guard: `1,291/1,291` passed on exact descendant main.
- Optimized production build: passed; 397 static pages generated.
- Complete local premium-menu matrix: `31/31` passed across Chromium and WebKit.
- Complete mobile World-menu matrix: `36/36` passed across Chromium and WebKit.
- Trivia's controlled header/drawer regression passed `20/20` fresh local
  WebKit runs and `10/10` fresh production WebKit runs.
- Fresh authenticated production containment smoke captured at
  `2026-09-07T04:27:20.402Z`; all state and ledger totals were unchanged.
- Post-smoke database verifier: `17/17` top-level assertions passed; rollback-only browser abuse
  matrix: `70/70` denied.
- Official Global Footer E2E run `34081774882` passed: `12/12` static contracts,
  `16/16` footer checks, `31/31` premium-menu checks, `36/36` mobile checks, and
  `13/13` mobile performance budgets.
- `git diff --check` and scoped lint checks: passed.

## World Hub publication evidence

| Evidence | Status |
|---|---|
| Phase 1 pull request | [#1468](https://github.com/Smarter-Poker/Smarter-Poker-World-Hub/pull/1468) |
| Phase 1 merge SHA | `8b63c09c1c6adb42c1824b170337a989a4d15ac7` at `2026-09-06T12:53:52Z` |
| Recovery-smoke correction | [#1471](https://github.com/Smarter-Poker/Smarter-Poker-World-Hub/pull/1471), merge `852facdfb84b775166590aa2b8477143a3c230f7` |
| Initial evidence publication | [#1477](https://github.com/Smarter-Poker/Smarter-Poker-World-Hub/pull/1477), merge `90b35fab7fb4b50eeac400dea5336d5a2cdf14d2` |
| Phase 1 required CI | [Build Safety run 34034465668](https://github.com/Smarter-Poker/Smarter-Poker-World-Hub/actions/runs/34034465668), passed |
| Correction required CI | [Build Safety run 34035111677](https://github.com/Smarter-Poker/Smarter-Poker-World-Hub/actions/runs/34035111677) and [Chromium/WebKit run 34035111674](https://github.com/Smarter-Poker/Smarter-Poker-World-Hub/actions/runs/34035111674), passed |
| Descendant main E2E | [run 34036532041](https://github.com/Smarter-Poker/Smarter-Poker-World-Hub/actions/runs/34036532041), passed on `43770e7d12355b268a9ce29b8a89a7048c4b3bd3`: 733 passed, 24 intentionally skipped, 0 failed in 10.6 minutes |
| Descendant Build Safety | [run 34036532058](https://github.com/Smarter-Poker/Smarter-Poker-World-Hub/actions/runs/34036532058), passed |
| OpenClaw deployment | [run 34034465451](https://github.com/Smarter-Poker/Smarter-Poker-World-Hub/actions/runs/34034465451), passed with remote checksum/service verification |
| Vercel production deployment | GitHub deployment `6293362295`, [production URL](https://hub-vanguard-ipwhggd93-smarter-poker.vercel.app), passed |
| Verified descendant deployment | GitHub deployment `6293584009`, [production URL](https://hub-vanguard-c3txwwgsd-smarter-poker.vercel.app), passed; `/api/health` reported app/database healthy on exact SHA `43770e7d12355b268a9ce29b8a89a7048c4b3bd3` |
| Exact smoke health SHA | `852facdfb84b775166590aa2b8477143a3c230f7` |
| Authenticated/anonymous smoke | `docs/trivia/evidence/phase1-production-smoke-20260906-1319utc.json`, passed at `2026-09-06T13:19:06.337Z` |
| Smoke artifact SHA-256 | `ad0414ca2a20d76cd9b8e206783419248ed7fe6914347cd33b69e3f1b6ce81a4` |
| Post-smoke database verifier | `17/17` top-level assertions passed; rollback-only browser matrix `70/70` denied |
| Rendered production inspection | Desktop cinematic layout and `390x844` mobile image-first stack passed; 13 middle modes, Daily Trivia, Quick Stakes, and two maintenance states visible |
| Final gate timestamp | `2026-09-06T13:50:59.091Z` |

### Supplemental publication and deployment evidence

| Evidence | Recorded value |
|---|---|
| Deterministic menu screenshots | [#1490](https://github.com/Smarter-Poker/Smarter-Poker-World-Hub/pull/1490), merge `03055e5cfe6a3682c1c2a605735f325339a37cb4` |
| Preflop duplicate-trigger correction | [#1491](https://github.com/Smarter-Poker/Smarter-Poker-World-Hub/pull/1491), merge `762bdb93d2f0e79c2d89c767a41da328c5ed43b7` |
| Training transition correction | [#1493](https://github.com/Smarter-Poker/Smarter-Poker-World-Hub/pull/1493), merge `ec8b0f9677770dafa9c26b91735cd6cfa4d8c1f8` |
| Bounded workflow completion window | [#1498](https://github.com/Smarter-Poker/Smarter-Poker-World-Hub/pull/1498), merge `4d97b6bfa3acab387fb3ea1fccc1aaca3d933d87` |
| Static WebKit availability correction | [#1503](https://github.com/Smarter-Poker/Smarter-Poker-World-Hub/pull/1503), merge `be1d2ccde98a003a2802eb2e008b9b754fb17719` |
| Bounded WebKit paint-readiness gate | [#1510](https://github.com/Smarter-Poker/Smarter-Poker-World-Hub/pull/1510), merge `fc31c037c397157878c83f81d56835d561432eb9` |
| Late-mounted modal isolation correction | [#1513](https://github.com/Smarter-Poker/Smarter-Poker-World-Hub/pull/1513), merge `91902d53b19ee52180af87bc3a23a4a5b19f9e4a` |
| Trivia header/drawer ownership correction | [#1529](https://github.com/Smarter-Poker/Smarter-Poker-World-Hub/pull/1529), merge `d6084229a59e3c51769e94ee945b9795df3a8804` |
| Diagnostic supplemental gate | [Global Footer E2E run 34046495988](https://github.com/Smarter-Poker/Smarter-Poker-World-Hub/actions/runs/34046495988); build, footer, and premium menu passed, then its newer mobile suite exposed the delayed tutorial-dialog isolation race fixed in #1513 |
| Diagnostic header-ownership gate | [Global Footer E2E run 34047866218](https://github.com/Smarter-Poker/Smarter-Poker-World-Hub/actions/runs/34047866218); its mobile suite exposed the Trivia passive-event ownership race fixed in #1529 |
| Terminal supplemental gate | [Global Footer E2E run 34081774882](https://github.com/Smarter-Poker/Smarter-Poker-World-Hub/actions/runs/34081774882), passed all static, build, footer, premium-menu, mobile, and performance steps |
| Lifeline application deployment | GitHub deployment `6294952714`, [production URL](https://hub-vanguard-pvydqjk8b-smarter-poker.vercel.app), succeeded |
| Static-transition deployment | GitHub deployment `6295090585`, [production URL](https://hub-vanguard-n6kbp9u0b-smarter-poker.vercel.app), succeeded |
| Phase 1 code deployment | GitHub deployment `6301788456`, [production URL](https://hub-vanguard-b097busho-smarter-poker.vercel.app), succeeded |
| Pre-publication descendant production | `/api/health` returned application/database `ok` on exact SHA `1705e96c45088c5e0927050b95a0295d0aed7616`; Git ancestry proves it contains Phase 1 code baseline `d6084229a59e3c51769e94ee945b9795df3a8804` |
| Final smoke artifact | `docs/trivia/evidence/phase1-production-smoke-20260907-0427utc.json` |
| Final smoke SHA-256 | `302da330facab397e21dc828e369f7f263ceeea1742b7aebc3762407a65ce6e6` |
| Immutable closeout artifact | `docs/trivia/evidence/phase1-final-closeout-20260907.json` |

The fresh smoke repeated anonymous, authenticated, and cron-authorized denial
paths against the descendant deployment. Disabled PvP and tournament endpoints
returned non-cacheable `503` receipts, direct pages redirected, retired routes
returned `404`, and the authorized recovery sweep returned `scanned=0` and
`settled=0`. Its temporary fixture was removed. PvP match, queue, session,
tournament, entry, refund, stake, prize, win, and tie-refund totals were identical
before and after.

## Findings intentionally assigned to later phases

The final audit found two serious question-system defects, but neither is a
Phase 1 containment escape because competitive play remains disabled and paid
competitive routes fail closed:

- The 2003 WSOP Main Event family contains factual variants that incorrectly
  name the Rio (the event was at Binion's), describe the winning hand as suited
  5-4, or give Sammy Farha A-2. These rows require the canonicalization and
  factual-review pipeline in Phase 3.
- The deterministic Trivia seeder drops source frequency values above `1` before
  normalizing the survivors. A production audit found 6,403 currently servable
  deterministic questions; 5,886 source vectors include values above `1`, and
  all 5,886 stored `correct_action` values disagree with the source maximum
  (`91.93%` of the servable set). Phase 3 must repair the conversion, quarantine
  affected rows, regenerate them, and prove the corrected bank before any paid
  or competitive question path is enabled.

These findings are release blockers for Phase 3 and for Phases 5/6, not accepted
production quality. They are recorded here so no later phase can treat the
current question bank as trusted merely because Phase 1 closed successfully.

### Initial smoke and descendant broad-regression context

The live smoke covered anonymous, signed-in, and cron-secret calls. It proved all
disabled public entry/play surfaces returned non-cacheable `503` receipts, both
disabled pages redirected, three retired routes returned `404`, and the authorized
recovery sweep returned a non-cacheable healthy receipt with `scanned=0` and
`settled=0`. Its temporary zero-cost session was removed. Before/after row counts
and every competitive diamond transaction count/net value were identical.

Three predecessor main E2E runs were concurrency-cancelled when newer commits
landed; their logs contain no assertion failure. The uninterrupted descendant
run above is the terminal broad regression proof. A path-level comparison from
the correction merge to `43770e7d` found one Phase 1 overlap: an unrelated,
additive Personal Assistant entry in `scripts/openclaw-cron-dispatcher.py`.
Direct inspection confirmed that no retired competitive Trivia schedule was
restored. A concurrent deterministic-seeder update also moved Trivia onto the
shared trusted-solver-matrix boundary; it was outside the Phase 1 release diff
and passed the descendant build and browser matrix.

## Rollback and incident policy

- Keep all four release switches false; feature-flag rollback is the first action.
- Do not roll back the RLS/ACL containment, idempotency/reference checks, score-only
  trigger, quarantine, or immutable settlement evidence.
- Do not restore the legacy cleanup route or either tournament scheduler.
- Apply only additive forward corrections; never delete or rewrite historical
  matches, entries, sessions, or diamond transactions.
- Capture a new read-only baseline after any correction and reconcile it against
  both stored artifacts.
- Existing OpenClaw/Sentry/Twilio production alerting is the incident channel;
  Phase 1 adds no new external destination or credential.

## Exit gate

Phase 1 is closed: the descendant main E2E passed, this report and its immutable
smoke artifact are published through the guarded release workflow, and
production health resolved to a descendant with all Phase 1 behavior intact.
All four competitive switches remain off for Phases 5 and 6.
