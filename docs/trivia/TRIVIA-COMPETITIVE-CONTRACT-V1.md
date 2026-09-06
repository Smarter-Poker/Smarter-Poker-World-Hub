# Trivia Competitive Contract v1.0.0-containment

Status: approved for containment; competitive launch is not approved  
Approval source: product owner instructions in the Trivia redesign task  
Effective control date: September 6, 2026  
Official clock: IANA zone `America/Chicago`

This is the Phase 1 contract. It freezes the behavior that may be reconciled while
PvP and tournaments are disabled. Phase 2 replaces the current single-entry ledger
with a balanced journal and persists immutable rule snapshots; Phases 5 and 6 are
the only phases authorized to launch the new competitive engines.

## Release controls

| Capability | Private environment control | Phase 1 state |
|---|---|---|
| Public PvP | `TRIVIA_PVP_ENABLED` | `false` |
| PvP horses | `TRIVIA_PVP_HORSES_ENABLED` | `false`; also requires public PvP |
| Public tournaments | `TRIVIA_TOURNAMENTS_ENABLED` | `false` |
| Tournament horses | `TRIVIA_TOURNAMENT_HORSES_ENABLED` | `false`; also requires public tournaments |

Only the exact lowercase string `true` enables a capability. Missing, blank,
boolean, `1`, or differently-cased values remain disabled. The values are resolved
only on the server. The lobby receives resolved booleans, never environment values.
While disabled, entry/play APIs return a private non-cacheable `503`, competitive
pages redirect to `/hub/trivia`, lifecycle mutation is denied after cron auth, and
the lobby marks the mode as Maintenance.

## PvP containment rules

- Valid stakes are exactly 10, 25, 50, or 100 diamonds.
- A match has two distinct profile participants, a server-owned ordered roster of
  exactly 20 unique question UUIDs, and at most one session per side.
- Every player session has one matching debit of exactly the stake, referenced as
  `pvp_stake_<match>_<user>`.
- A submitted result is valid only when the session owner, match, side, mode,
  roster, cost, charged state, creation time, expiry, submission time, and score
  all agree. Missing or malformed deadlines fail closed.
- Winner payout is the funded two-player pot less `floor(pot * 0.10)` house rake.
- A funded tie returns each charged player's stake. A funded forfeit pays the
  finisher under the same winner rule. A half-funded match refunds only the charged
  finisher. If nobody was charged, settlement is a zero-movement void.
- Horses are players: each occupies the same durable seat, funds the same stake,
  runs the same linked server session and deadline, receives the same payout or
  refund, and records the same stats. Horse entry remains disabled until Phase 5
  provides the treasury-to-horse funding leg, server-persisted 20–45 second
  human-first fallback, input-device engine, and Smarter Horse disclosure.
- One database transaction locks the match and bound sessions, chooses one
  immutable settlement kind, uses one reference family, performs the credits, and
  closes the match. A retry returns the persisted result and cannot choose another
  outcome.
- Terminal match identity, scores, outcome, winner, and completion time are
  immutable. Terminal sessions cannot reopen or rewrite grading data.

## Nightly tournament contract reserved for Phase 6

- Exactly one public instance per Central calendar date.
- Start time is 8:00 PM in `America/Chicago`, including DST transitions.
- Its horse target is sampled once, persisted, and is an integer from 70 through
  140 inclusive. Humans are additive and horses are always disclosed.
- Entry fee, rake, field cap, question inventory, bracket rules, no-show rules, and
  prize schedule must be stored in the Phase 2 rules snapshot before launch.
- Phase 1 does not create, seed, advance, rank, refund, or pay a tournament. Both
  scheduled and manual lifecycle paths are gated off.

## Historical quarantine

- The four abandoned human-versus-horse PvP matches from the prior refund incident
  are evidence, not settlement candidates. Phase 1 moves no diamonds for them.
- The completed eight-horse tournament with a 184-diamond recorded pool and no
  ranks/payouts remains evidence, not an inferred liability. Phase 1 neither pays
  nor refunds it.
- Quarantine is persisted by invariant, service-readable, browser-inaccessible,
  and guarded against automated mutation. No IDs or player data are copied into
  tracked documentation.

## Operations and rollback

- OpenClaw remains the schedule owner, but no competitive schedule is active in
  Phase 1. Vercel and OpenClaw carry no PvP or tournament lifecycle schedule. The
  legacy PvP cleanup and both legacy tournament workers are authenticated `410
  Gone` tombstones that never open a database connection.
- The retained World Hub PvP sweep is manual recovery only. Any unsettled forced
  result makes the run `success:false`, returns `503`, records failed telemetry,
  and raises error reporting instead of presenting a green business outcome.
- Any stale invocation produces structured retired-route telemetry.
- Application rollback means setting all four controls to false and reverting
  reachability. Database corrections are additive forward migrations; containment
  ACLs, idempotency protection, history, and quarantine are never rolled back to an
  unsafe state.
- Production release requires: focused and full build gates, migration rollback
  rehearsal, live ACL/RLS/trigger assertions, worker CI/deployment, World Hub
  CI/deployment, `/api/health` serving the merge SHA, and a post-deploy ledger
  comparison with no unexplained movement.
