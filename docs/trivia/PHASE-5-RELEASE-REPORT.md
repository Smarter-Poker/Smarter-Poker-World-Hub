# Trivia Casino Realism — Phase 5 Release Report

Server-owned PvP matchmaking, the Smarter Horse fallback, and settlement.

Owner: `p5-pvp` (for root; product owner Dan) · Date: 2026-09-30 · Production project `kuklfnapbkmacvwxktbh`

**Flags turned on: none.** `TRIVIA_PVP_ENABLED` and `TRIVIA_PVP_HORSES_ENABLED` stay off. Every new
PvP route answers a private, non-cacheable `503` while PvP is off. The database engine is
installed dormant: production holds no v2 ticket, match, escrow or wallet movement. The current
PvP page stays contained. Its new interface belongs to Phase 7.

## What now exists

**A server-owned queue.** A player joins with a stake (10, 25, 50 or 100 diamonds) and a client
nonce. The server checks the stake against the current rules version (`pvp.standard@1`) and the
balance, then writes one ticket: player, stake, rules version, nonce, joined time, heartbeat, a
15-second presence lease and a search expiry. A player has at most one waiting ticket and at most
one active match. A retry with the same nonce returns the same ticket. A second tab, or a lost
nonce, adopts the waiting ticket. A player already in a match is resumed into it. No diamonds
move at join.

**One stable Smarter Horse deadline.** At join the server draws a whole number of seconds from 20
to 45 from a cryptographic random source, with every value equally likely, and stores
`horse_eligible_at = joined_at + draw`. A guard trigger makes the draw, the deadline and the
ticket's identity immutable. Retries, refreshes, second tabs and later calls never reroll it.

**Matching, human first.** Every path takes the player's lock, then one lock per stake and rules
version. Dead presence (a lease lapsed for 60 seconds, or a search older than 5 minutes) is
expired first and is never matched. The oldest compatible live human is claimed first. A Smarter
Horse is considered only after that claim finds nobody, and only once the stored deadline has
passed, so a human who arrives at the boundary still wins. Exactly one horse is seated. A cancel
that loses the race to a committed match is reported as `too_late_matched`, and the match stands.

**Smarter Horses play as real players.** The horse is chosen from the complete eligible fleet, not
the first 50: an active, available horse with no PvP seat, outside its 15-minute appearance
cooldown, not this player's horse opponent in the last hour, and under a ceiling of 250 concurrent
horse matches. The skill tier is drawn from the configured mix (Newcomer 35%, Regular 25%,
Intermediate 15%, Grinder 15%, Shark 10%, renormalized over tiers with eligible horses), then a
horse is picked evenly inside the tier. Each horse has persona category strengths and a versioned
skill model (accuracy 55% to 80% before difficulty and category, median response 9.0 to 5.2
seconds). Its whole answer plan is derived from a server secret when the match is created and is
stored with a model hash and a plan hash. No LLM is involved, and the stake is not an input.

The horse takes the same seat, stake, roster, session, clock, grading, payout rules, refund rules
and stats as a person. Its stake comes from the Trivia treasury through the Phase 2 subsidy, and
its winnings and refunds go back to the treasury. Its answers go through the same Phase 3 answer
step a browser uses, each only once its planned moment has passed. Horse answer events carry
`actor_type = horse` and stay out of human learning analytics. Every DTO labels the opponent
"Smarter Horse".

**Match creation in one transaction.** Both seats get the same rules version and the same private
Phase 3 roster of 20 questions. Each stake is escrowed through the Phase 2 ledger (a hold for a
person, a treasury subsidy for a horse). The gross pool is locked at twice the stake, and one
engine-v3 session is opened and linked per seat, all before the match becomes active. If any step
fails, the whole pairing rolls back. A player who cannot fund the seat has the ticket ended
(`insufficient_funds`), and the other player keeps searching.

**Settlement in one transaction.** The engine decides under the competitive contract: win (higher
score), tie (equal scores), forfeit (only one seat finished) or refund (neither finished). It
posts one Phase 2 settlement journal (`trivia_settlement_settle`, which refuses anything
unbalanced), writes the immutable decision, completes the match, records stats and reveals the
roster. The pot is twice the stake. A win pays the pot minus the rules-version rake (10%, so 180
of a 200 pot). A tie or refund returns each stake in full. Nothing is minted. If any step fails,
nothing commits, and the player sees `settling` until the next attempt succeeds.

**Recovery.** `trivia_pvp_recover_v2` (service role only) expires dead tickets, drives horse plans,
closes seats whose deadline has passed and settles finished matches. Every step is idempotent. Its
authenticated manual entry point is the existing `/api/cron/pvp-settle` route (cron secret), which
stays unscheduled. Phase 12 schedules it.

**API.** `/api/trivia/pvp/join`, `status`, `heartbeat`, `resume` and `cancel`; the contract for
Phase 7 is `$T/interfaces/pvp-api.md`. Each route authenticates the player, rate-limits, answers
`private, no-store` and returns only that player's sanitized view. The view never contains another
player's queue identity, the roster, answers, the answer key, a horse plan or its seed. The legacy
settle route and cron leave v2 matches to the v2 engine. Session start resumes a v2 seat instead
of opening a legacy one.

## Earning-cap decision (root, 2026-09-30)

The platform's daily earning cap (2,000 Trivia diamonds per player) counted a PvP winner payout as
promotional issuance, so a payout could be refused in the middle of settlement. PvP payouts are
player-funded transfers (stakes minus rake). The second migration attributes `pvp_win` credits to
their own uncapped engine, `trivia_pvp`, the same way the pool-funded tournament engine is
uncapped. Tie returns and refunds were already classed as refunds and never counted. Solo Trivia
keeps its 2,000 cap, and PvP wins stop using up a player's solo allowance. Awards are still
journaled per player, now under `trivia_pvp`.

Test (replica): a winner who already earned 1,900 that day. Without the exemption the settlement is
refused as a whole (2,080 > 2,000) and nothing but the two holds exists. After the exemption the
same match pays 180, with a rake of 20 and exact conservation. The solo award stays at 1,900.

## Installed migrations

| Version | Name | What it does |
|---|---|---|
| 20261001011044 | `trivia_p5_pvp_engine` | Engine tables, guards, matching, horse model, settlement, recovery, metrics and the six service RPCs |
| 20261001011352 | `trivia_p5_pvp_settlement_cap_exemption` | Attributes PvP winner payouts to the uncapped `trivia_pvp` engine |

Both ran in the installer's transaction and asserted their own postconditions: RLS on every new
table, no browser grant on any `trivia_pvp_*` object, six service RPCs only, definer functions
with a pinned `search_path`, the exact trigger set, the config, secret and horse persona seed, and
200 in-range deadline draws. The engine migration ends with a build fingerprint: the installed PvP
catalog (every function body, trigger, constraint, index, column and policy) must equal the tested
replica build (`265d0aaa1c81ddd58bd213efe09c7ec5`, 312 objects), or the install aborts. The cap
migration is one statement: it checks the exact pre-image of `fn_ca_diamond_engine_of`, makes the
one-line change, and proves the result, the exact post-image and an unchanged solo cap. The text
stored in production for both migrations matches the repository files byte for byte.

**Built for a busy database.** The engine adds no foreign key into the busy shared tables
(profiles, sessions, roster snapshots). Each would have duplicated an existing RESTRICT key (for
example `trivia_pvp_matches.player2_id` to `profiles`, and session links to sessions), and adding
one locks the shared table against its writers. The engine's own table locks are taken first with
a NOWAIT retry loop (up to 60 tries, 250 ms apart), so the install never queues ahead of live
traffic; if it cannot get them it aborts cleanly.

**How the install went.**
- Rehearsal 1 (rolled back) could not take a lock within 2 seconds while an unrelated cron job held
  locks on `profiles` (see findings). Nothing changed. The hot-table keys were removed in response.
- Rehearsal 2 (rolled back) hit a brief lock wait. The NOWAIT retry loop was added.
- Rehearsal 3 ran the whole engine migration on production, then stopped in the cap block on
  purpose: another program migration had changed `fn_ca_diamond_engine_of` shortly before, and the
  pre-image check refused. The change was re-derived from the live definition and retested on a
  replica carrying that exact definition. Nothing committed.
- The first real apply, just before 01:00 UTC, was refused by the platform's DDL break window (:50
  to :03). Nothing was written. Each migration was then applied once, at 01:10 and 01:13 UTC.

**Advisors after install.** Security: two expected notices, `rls_enabled_no_policy` on
`trivia_pvp_engine_secrets` and `trivia_pvp_horse_plans`. Both are service-only tables, so RLS with
no policy denies every browser role, which is the intent. No `trivia_pvp` function is flagged as
browser-executable. Performance: one unindexed foreign key (horse plans to the one-row secrets
table) and seven new indexes reported unused, because nothing uses PvP while it is off. The other
advisor changes in the same window are not Phase 5 objects.

## Exit gate

| Requirement | Result | Evidence |
|---|---|---|
| Deadline is joined time + 20..45 s, set once, never rerolled | Pass: every value 20..45 on a fake clock; no horse at deadline − 1 ms; a horse at the deadline; stable across retry and second tab | `fallback_20_45_fake_clock` |
| Draw is uniform 20..45 | Pass: 2,600 draws, all 26 values, chi-square below the p = 0.001 bound | `fallback_draw_distribution` |
| Human first at the boundary; never a horse before the deadline | Pass: both race orders exercised; 0 horses before the deadline | `boundary_human_priority`, metrics |
| 100+ concurrent join, cancel and two-tab clients | Pass: 140 clients and 40 concurrent fallbacks; no duplicate ticket, nonce, seat, charge or horse; 0 ghost matches; every match settled once with zero escrow | `concurrency_join_cancel_two_tab` |
| Refresh and resume in every state | Pass: searching, dealing, playing, waiting, settling and result are stable across retry, second tab and resume | `refresh_resume_states` |
| Every outcome settles once with exact conservation | Pass: 9 outcomes (human v human win, tie, forfeit, refund; human beats horse, horse beats human, tie, abandon; no driver before the deadline); players + treasury + rake = 0 each time | `settlement_outcomes_conservation` |
| A forced mid-settlement failure commits nothing | Pass: faults at decision, completion, stats and reveal leave no decision, credit or stats, escrow intact, DTO `settling`; the retry settles exactly once | `fault_injection_atomicity` |
| No browser write or read path | Pass: 34 probes for anon, authenticated and service role | `acl_no_browser_write_path` |
| Horses from the whole fleet, plan committed by hash, no stake input, kept out of human analytics | Pass: 8 checks | `horse_fleet_and_plan` |
| The legacy v1 settle path cannot move money on a v2 match | Pass | `settlement_outcomes_conservation` |
| PvP settlement is not refused by the daily earning cap | Pass | `earning_cap_exemption_test` |
| Flags off; routes answer a private 503 in production | Pass: after the deploy all five routes answer `503 pvp_temporarily_unavailable` with `private, no-store`; the legacy page redirects | `docs/trivia/evidence/phase5-pvp-live-20261001.json` |

All gate evidence: `docs/trivia/evidence/phase5-pvp-replica-gate-20260930.json` (0 failures).
Install read-backs: `docs/trivia/evidence/phase5-pvp-install-20260930.json`.
Live checks after the deploy: `docs/trivia/evidence/phase5-pvp-live-20261001.json`.

## Metrics (replica gate run)

| Metric | Value |
|---|---|
| Join to match | p50 6.0 ms (human pairs 2.1 ms); p95 26.2 s |
| Horse fallback join to match | p50 23.0 s; p95 38.8 s |
| Human match rate | 66.8% of matches (the gate forces many fallbacks on purpose) |
| Ghost prevention | 0 matches with lapsed presence |
| Horse before the stored deadline | 0 |
| Cancel races | 54 cancels; 28 lost cleanly to a committed match |
| Completion | 185 of 251 matches completed: 168 wins, 13 ties, 2 forfeits, 2 refunds. The other 66 were left mid-play on purpose by the state, race and resume scenarios when the run ended; their stakes stay in escrow by design |
| Settlement failures | 12, all injected by the fault tests, all retried to exactly one settlement |
| Settlement latency | p50 5 ms; p95 266 ms |
| Ledger variance | 0 open settlements on finished matches; 0 diamonds left in escrow on finished matches |

Production reads the same numbers from `trivia_pvp_metrics_v2` (service role). Right after the
install every production counter was 0, and 2,000 production deadline draws covered all 26 values
from 20 to 45.

## Live verification

Database (2026-10-01 01:14 UTC, read-only queries; full read-backs in
`docs/trivia/evidence/phase5-pvp-install-20260930.json`):

- Both migrations are recorded with the versions above, and the stored text matches the
  repository files.
- The installed PvP catalog equals the gated build: fingerprint `265d0aaa1c81ddd58bd213efe09c7ec5`,
  312 objects.
- Exactly six RPCs are executable by the service role. No `trivia_pvp_*` function is executable by
  anon, authenticated or public, no browser role holds a write privilege on any `trivia_pvp_*`
  table, and RLS is on for all eleven tables.
- 1,000 active horse personas, one active plan secret (32 bytes; its value was never read) and the
  config row exist. No v2 ticket, match, plan, decision, event, seat or session link exists. The
  legacy rows (4 abandoned matches, 11 ended queue rows) are untouched.
- Earning-cap attribution: `pvp_win` goes to `trivia_pvp` (uncapped). `pvp_refund`,
  `pvp_tie_refund`, `trivia_run` and `trivia_daily_bonus` stay on `trivia`, `tournament_prize` on
  `trivia_tournaments`, `wheel_prize` on `wheel`. The solo Trivia cap is still 2,000 (VIP 2,000).
- Metrics return the full shape with every counter at 0. 2,000 production deadline draws produced
  every value from 20 to 45 and nothing outside it.

Before merge (production, flags off): the legacy `/hub/trivia/pvp` page redirects to `/hub/trivia`
(307), and `/api/trivia/pvp-settle-match` answers `503 pvp_temporarily_unavailable` with
`private, no-store`. The new routes use the same release control.

After the merge (2026-10-01): PR #2063 merged at 01:31 UTC. Its production deployment on
`hub-vanguard` (`dpl_4VXubgh1fyEoiAgbrbnXTNo2yg7g`) was READY at 01:36 UTC and serves smarter.poker,
and `/api/health` reports the merge commit (`70a90ec408e`). At 11:21 UTC, signed out:

- `POST join`, `GET status`, `POST heartbeat`, `GET resume` and `POST cancel` under
  `/api/trivia/pvp/` each answered `503 pvp_temporarily_unavailable` with
  `Cache-Control: private, no-store, max-age=0` and `Retry-After: 300`.
- The legacy settle route answered the same, and `/hub/trivia/pvp` redirected (307) to
  `/hub/trivia`.
- The database was still dormant: no v2 row of any kind, the legacy rows unchanged, the build
  fingerprint and the cap post-image unchanged, and no scheduled job calls PvP.

## Rollout

- **Stage A (this release).** Engine installed dormant, flags off, routes closed. No route can
  create a v2 ticket while `TRIVIA_PVP_ENABLED` is off, and the engine's functions are callable
  only by the service role.
- **Stage B (root, then Dan).** Treasury funding for horse seats needs Dan's approval of a
  funding journal; until then the horse fallback fails closed (`treasury_unavailable`) and players
  keep searching. Production money canaries need root-approved canary wallets.
- **Stage C (Phase 7 and Phase 12).** Phase 7 builds the PvP interface on `pvp-api.md` and the
  release decision turns on `TRIVIA_PVP_ENABLED`, then `TRIVIA_PVP_HORSES_ENABLED`. Phase 12
  schedules `trivia_pvp_recover_v2` at least once a minute.

## Rollback

- Fastest: leave the flags off, or turn them off. Every PvP route answers `503`.
- Database lever: `UPDATE public.trivia_pvp_engine_config SET joins_enabled = false,
  horses_enabled = false, updated_at = now() WHERE id = 1;` stops new joins and new horse seats.
  Recovery still settles or refunds anything already in play.
- Cap exemption: the paste-able revert block at the end of the cap migration restores the previous
  attribution, so PvP wins would count toward the 2,000 cap again.
- Nothing is dropped. Tickets, matches, events and settlement journals are history.

## Pending, and why

- **Treasury funding** (Dan): horse seats are funded from `treasury:trivia`, which is unfunded and
  fails closed.
- **Production money canaries** (root): only rolled-back rehearsals ran in production.
- **Recovery schedule** (Phase 12): until it is scheduled, a horse records its answers and a
  finished match settles when either player polls, or when someone runs the recovery route. If no
  poll or recovery runs before a match deadline, both seats expire and the stakes are refunded.
- **PvP interface** (Phase 7): the legacy `/hub/trivia/pvp` page shares `TRIVIA_PVP_ENABLED`, so
  Phase 7 should give the new interface its own release flag or replace the page before the flag
  is turned on.

## Findings outside this phase (reported, not fixed)

- **Phase 1 verifier inventory.** `scripts/trivia/phase1-production-db-verify.cjs` lists the
  `trivia_pvp_*` triggers (updated here) but its `trivia_sessions` trigger list predates the Phase
  2 and Phase 3 triggers, so it reports drift that is expected.
- **Rare horse tiers run out first.** With a 15-minute appearance cooldown, Shark and Grinder
  horses can all be cooling down at high volume. The draw then falls back to the tiers that have
  eligible horses, which shifts the mix toward Newcomers.
- **Production load on 2026-10-01.** From 00:03 to about 00:20 UTC the cron job
  `ca-horse-claim-due-minute` hit its 120-second statement timeout on every run while holding
  locks on `profiles`, and up to 65 sessions queued behind locks; the database then became
  IO-bound. The first Phase 5 rehearsal could not take its lock within 2 seconds and aborted
  cleanly. Root was told at the time.
