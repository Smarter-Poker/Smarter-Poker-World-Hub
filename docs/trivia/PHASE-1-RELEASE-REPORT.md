# Trivia Phase 1 Release Report

Status: **RELEASE IN PROGRESS — World Hub deployment and live smoke remain**  
Phase: 1 of 12 — Control Plane, Production Baseline, and Competitive Containment  
Release date: September 6, 2026  
Implementation baseline: `d8109a3a2933f2d2611dac1f7257a53c11f30522`  
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
- Made PvP and tournament pages and APIs fail closed while disabled, including
  generic session start/answer/submit branches and settlement/cron routes.
- Replaced browser-owned competitive mutation with service-role-only database
  contracts, strict RLS/ACLs, exact function grants, and caller-bound reads.
- Added normalized PvP session links and active seats, immutable settlement
  decisions, atomic settlement/crediting, quarantine evidence, constraints,
  indexes, and score-only alias synchronization.
- Preserved all historical rows. Four abandoned human-versus-horse matches and
  one incomplete eight-horse tournament are quarantined and frozen without new
  payout, refund, deletion, or rank rewriting.
- Removed answer-oracle leakage: a correct answer and explanation are returned
  only after the first answer is durably and uniquely recorded.
- Added a canonical fifteen-mode lobby catalogue. Daily Trivia and Quick Stakes
  keep their approved identity; every middle card uses distinct existing art,
  mobile cards stack image above copy/action, and desktop keeps a separate
  three-column composition. Disabled competitive cards render honest maintenance
  state instead of launching legacy clients.
- Added reproducible baseline, migration rehearsal, direct production database
  verification, authenticated production smoke, and release evidence tooling.

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
| Direct production verifier | `52 passed, 0 failed` |
| Browser-role abuse matrix | `70/70` denied inside rollback-only probes |

The verifier binds both PostgreSQL and REST credentials to the expected project
before inspection. It checks 10 RLS-enabled base tables, the public tournament
view, 12 exact policies, table and effective column ACLs, 13 RPC ACLs, 19 function
definitions/search paths, 13 triggers, 39 constraints, 9 critical indexes,
quarantine identity, historical row counts, and the competitive diamond ledger.

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
duplicate user/reference groups are zero. The quarantined incomplete tournament
received no payout.

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
- Production database verification: `52/52` passed.
- Whitespace/error checks: passed.
- Latest-main overlap audit: upstream changes in shared test/package/scheduler
  files were preserved before release.

## Remaining publication evidence

The following fields remain open until the World Hub merge, Vercel deployment,
OpenClaw deployment, and authenticated smoke complete:

| Evidence | Status |
|---|---|
| World Hub pull request | pending |
| World Hub merge SHA | pending |
| Required CI | pending |
| Vercel production deployment and exact `/api/health` SHA | pending |
| OpenClaw dispatcher deployment and remote checksum | pending |
| Authenticated/anonymous live smoke artifact | pending |
| Final gate timestamp | pending |

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

Phase 1 closes only after the pending publication evidence above passes and the
release report is updated to the exact deployed merge SHA. Until then, the phase
remains in progress and all competitive switches remain off.
