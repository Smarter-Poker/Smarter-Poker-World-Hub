# Trivia Casino Realism Phase 6 Release Report

Phase 6 Stage A delivers one dormant nightly Trivia tournament engine for 8:00 PM
`America/Chicago`, a stored 70 to 140 Smarter Horse target, a normalized live bracket,
and one atomic Diamond settlement. The engine, APIs, dispatcher definition, and worker
are installed and published. Activation is intentionally deferred to Phase 12.

Delivered October 5, 2026:

- World Hub PR #2120, protected merge
  `b51ee15d1a926af3ba27de00424c9bce380f1cbd`.
- Workers PR #160, followed by fail-closed hardening PR #161, final protected merge
  `416f871c54e65cc5f962f5feaac4839e37c307ec`.
- Production migration `20261001200000_trivia_p6_nightly_tournament_engine`.
- OpenClaw deployment run `37301506770` and workers deployment run `37301746026`.
- Vercel deployment `dpl_2vj1WJ6ehfJEBUVfF9vBBkZw59Xu` in the canonical
  `hub-vanguard` project.

The complete machine-readable certificate is
[`phase6-tournament-production-release-20261005.json`](evidence/phase6-tournament-production-release-20261005.json).
The retained replica gate is
[`phase6-tournament-replica-gate-20261001.json`](evidence/phase6-tournament-replica-gate-20261001.json).

## Release state

This is a deliberately dormant Stage A release:

- `TRIVIA_TOURNAMENTS_ENABLED` is off.
- `TRIVIA_TOURNAMENT_HORSES_ENABLED` is off.
- `TRIVIA_NIGHTLY_TOURNAMENT_SCHEDULE_ENABLED` remains false, so the OpenClaw job is
  defined but not registered.
- The public nightly API fails closed with HTTP 503, private no-store caching, and
  `Retry-After: 300`.
- The tournament page redirects to `/hub/trivia` while the gate is off.
- No production tournament canary ran. No tournament, entrant, settlement, escrow,
  or wallet movement was created by this release.

The database health function reports `next_instance_coverage_short` while dormant.
That is the expected truthful state when the schedule is intentionally unregistered,
not a passing production-activation certificate.

## What now exists

### Schedule and ownership

- Exactly one public instance can exist for each Central calendar date.
- The start is stored as 8:00 PM `America/Chicago`; zone data produces 01:00 UTC
  during daylight time and 02:00 UTC during standard time.
- The scheduler keeps a database lease and fencing token under the single identity
  `openclaw:trivia-nightly-tournament`.
- Duplicate invocations cannot both own the schedule. A stale token is refused by
  every engine write.

### Field and bracket

- Every instance stores one immutable horse target selected from 70 through 140.
- Human entrants are additive and do not consume the horse reserve.
- The engine plans the whole horse field once and fills it over the registration
  window, using dedicated Trivia skill bands and excluding overlapping seats.
- A final population pass tops up before registration closes. Fewer than 70 horses
  holds and cancels the event with exact refunds.
- The paid rules version supports a 256 bracket. A 512 bracket remains a zero-Diamond
  canary or a future rules-version change.
- Registration close, roster proof, seed reveal, field snapshot, bracket build,
  byes, and round one open in one transaction.

### Play and decisions

- Each round uses ten questions, a 20-second shot clock, a five-minute round window,
  and a 60-second transition.
- Both seats receive the same question revisions with independently shuffled answer
  order.
- Horses use the same Phase 3 session calls as human players. Their response plans
  are committed before play and kept server-only.
- Match order is correct answers, lower total answer time, earlier completion, then
  seed. Unanswered questions consume the full shot clock. No-shows and byes have
  deterministic outcomes.
- An interrupted pass rolls back its transaction; a later normal pass resumes from
  authoritative state. A persistent stuck round remains an alert requiring root-cause
  investigation.

### Settlement and audit trail

- Entry holds, refunds, rake, payouts, final ranks, immutable results, and escrow
  closure use the Phase 2 ledger and settlement contracts.
- Final settlement is one transaction. It either records the complete conserved
  outcome with escrow at zero or records nothing.
- Human prizes return to player wallets. Horse prizes return to the Trivia treasury
  and remain separately reported.
- Tournament prizes and refunds use the uncapped `trivia_tournaments` attribution,
  rather than the solo Trivia daily earning cap.
- The retired legacy entry RPC returns `tournament_entry_retired` and moves zero
  Diamonds.
- Normalized events and results preserve the transaction record required for later
  UI, reporting, and reconciliation.

### API and worker

- `/api/trivia/nightly/[action]` owns schedule, summary, entry, field, bracket,
  match, run, play, results, receipt, and history actions.
- Identity comes from the authenticated session. Answer keys, horse plans, and
  unrevealed secrets are refused from response payloads.
- The workers route `/cron/trivia-nightly-tournament` runs behind the existing IP
  allowlist and cron-secret middleware.
- PR #161 closes three false-success paths found before final certification:
  malformed acquire responses now fail, release must be authoritatively confirmed,
  and invalid poll intervals cannot hot-loop.
- The route returns 503 before acquiring a database client when the release gate is
  off.

## Installed database image

| Item | Installed value |
|---|---|
| Migration | `20261001200000_trivia_p6_nightly_tournament_engine` |
| Source SHA-256 | `ecf0d371a87e36b262bade4e223b4af59f4ab3af62cf42df9e203a88c8ae16ca` |
| Stored statement MD5 | `88a6a9ae0b4d690c4c4e5dc5b76ad06b` |
| Install transaction | SQL and migration-ledger row committed atomically |
| Execution | 2.24 seconds |
| Relations | 16 Phase 6 relations, zero missing RLS |
| Functions | 60 of 60 installed |
| Browser privileges | Zero relation privileges and zero function execution privileges |
| Contract triggers | Four ownership and row-contract triggers |
| Horse personas | 1,000 for 1,000 horse profiles |

The replica-gated fingerprint is `ec4c1ae53c59982d3cedf6ab1fb3c8de|261`.
The production installation certificate independently proves the exact migration
SHA-256 and stored statement MD5.

## Verification

### Exact-source checks

- World Hub focused Phase 6 and unchanged Trivia console checks passed 39 of 39.
- The Phase 6 replica gate passed all eight suites on PostgreSQL 17.
- The workers hardening candidate passed focused ESLint, 16 nightly owner cases,
  TypeScript, production bundle build, and whitespace validation.
- World Hub PR #2120 passed its required protected checks before merge.
- Workers PR #161 passed `Typecheck + Lint + Test + Build` in run `37301555532`.

### Replica behavior

- 108 schedule dates produced 108 distinct Central dates across daylight saving,
  year, and leap-day boundaries.
- Duplicate lease owners were fenced.
- Horse targets 70, 100, and 140 filled exactly by band.
- A 140-horse plus 40-human event completed in under 35 minutes and settled with
  zero escrow variance.
- A 256-entrant failure and reconnect run produced ranks 1 through 256 and zero
  escrow variance.
- Concurrent player and scheduler execution completed with zero deadlocks and zero
  errors.
- Short-field cancellation, earning-cap exemption, ACL/fencing, and the 512-entry
  zero-Diamond canary all passed.

### Live publication

- Vercel `/api/health` served the exact World Hub merge
  `b51ee15d1a926af3ba27de00424c9bce380f1cbd` from deployment
  `dpl_2vj1WJ6ehfJEBUVfF9vBBkZw59Xu` with database status OK.
- The live nightly schedule API returned HTTP 503,
  `tournaments_temporarily_unavailable`, private no-store caching, and a 300-second
  retry header.
- The gated tournament UI returned HTTP 307 to `/hub/trivia` with private no-store
  caching.
- OpenClaw deployment run `37301506770` succeeded while the schedule stayed
  unregistered.
- Workers deployment run `37301746026` served exact revision
  `416f871c54e65cc5f962f5feaac4839e37c307ec`; internal `/health` returned OK.
- An authenticated localhost request to the live workers route returned HTTP 503,
  `tournaments_temporarily_unavailable`, with both tournament gates confirmed off.
- A verified-TLS post-deployment database readback at
  `2026-10-05T11:19:08.515964Z` found zero v2 tournaments, entrants, scheduler runs,
  population runs, matchups, results, events, settlements, escrow accounts, and
  Phase 6 wallet journals since installation.

## Economics and activation boundary

The installed `tournament.nightly@1` rules snapshot uses a 10-Diamond entry and
1-Diamond rake per settled entry. The prize split is 32% champion, 20% runner-up,
11.5% for each semifinal loser, and 6.25% for each quarterfinal loser, with integer
remainder assigned to the champion. Maximum horse-seat exposure is 1,400 Diamonds
per night.

Treasury qualification remains an activation prerequisite. Stage A did not fund
horse entries and made no wallet movement. The economics, zero-Diamond production
canary, schedule registration, release flags, and seven-night observation belong to
the later activation phase.

## Completion and next phase

Phase 6 Stage A is complete: implemented, regression-protected, protected-merged,
database-installed, workers-deployed, World Hub-published, and live-verified while
dormant.

Phase 7 is not part of this release and has not started. Its first task is to replace
the legacy tournament page data path with the new nightly DTO/API and build the live
lobby, bracket, match, run, results, and receipt experience on the already published
Club Arena Console visual system.
