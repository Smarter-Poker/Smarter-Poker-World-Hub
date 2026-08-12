# 2026-08-11 - Trivia phase 4: server-authoritative migration COMPLETE (12 of 12)

Closes the migration opened in `.agent/audits/2026-08-05-...`, continued in the
2026-08-08 phase 2 and phase 3 records. Every trivia surface now grades and
pays on the server. This document is the verification record.

## NOT PUSHED BY THE AUTHORING AGENT - ACTION REQUIRED

The GitHub MCP began returning `Authentication Failed: Bad credentials`
partway through this phase (the token restored on 2026-08-06 has failed or
been rotated again), and the Cowork sandbox has no network egress. This file
was written to the working tree only. Commit + push it with
`bash scripts/git-safe-push.sh "docs(audit): trivia migration complete 12/12"`.
Nothing else is pending - all CODE for this phase reached main before the
credentials failed (verified against origin, see below).

## Final state: 12 of 12 surfaces server-graded

| Surface | Grading | Entry | Landed |
|---|---|---|---|
| arcade | server | 10 | `cde66bf0` (validated by Playwright 08-06) |
| daily | server | 0 (free) | phase 2; shared roster + server bonus `9431f668` |
| history / rules / pro | server | 0 (free) | `b611ed9e` |
| mixed | server | 10 | `ccbfa17b` |
| time-attack | server | 10 | `20f63684` |
| endless | server | 10 | `0f13a5a5` |
| survival | server | 10 | `85689ac7` |
| mtt / cash / icm / gto | server | 10 each | `67634fb3` (StrategyTrivia) |
| pvp | server graded + server settled | stake | `71a4200` |

Production `/api/health` served version `71a42002` at 2026-08-11T20:39:10Z,
and the Vercel dashboard shows that deployment Ready and Current. Every
commit above is on origin/main (confirmed by reading the commit list
directly, since the MCP was unavailable).

## Verification performed this phase

Code-level, against the working tree synced byte-exact to origin:

- **No live client-side credit path remains.** `add_diamonds_to_balance`
  appears in exactly two trivia files, neither reachable:
  `AllInMode.jsx` is unreferenced dead code (comment mention only, already
  carries a warning header), and `[mode].js` retains four call sites that
  are all unreachable for the five modes that page serves - the settlement
  credit sits in the `else` of `useServerPayout` (all five modes are in
  `SERVER_GRADED_PAGE_MODES`), the wager is behind a `false &&` guard, and
  the hint/stake handler cannot fire because hints are force-disabled under
  `serverGrader`. Worth deleting as hardening, but not a live hole.
- **Pricing table is coherent**: free modes 0, all eight adopted paid modes
  10, pvp/tournaments 0 (they use stakes / their own entry path).
- **PvP invariants** (the ones specified when the work was commissioned):
  - pvp sessions GRADE but pay 0: `DAILY_DIAMOND_CAPS` has no `pvp` key, so
    session-submit's `Number.isFinite(cap)` is false and the fail-closed
    branch pays 0. Payment happens only in settlement.
  - Settlement mutex: conditional `status -> 'settling'` UPDATE guarded by
    `.eq('status','active')` - the `award_trivia_run` pattern; the loser of
    a race updates zero rows.
  - The client-reported score write is GONE. `pvpMatchmaking.js` retains only
    `winner_id` READ filters and a realtime subscription; `pvp.js` reads an
    opponent score field for live display only and contains no credit call.
  - Horse scores are server-side and deterministic (`horseCorrectCount`,
    SHA-256 seeded on matchId), computed identically by the settle route and
    the sweep. A horse is never credited.
  - One settlement implementation: `pages/api/cron/pvp-settle.js` imports
    `settlePvpMatch` from the route, so sweep and route cannot drift, and
    reference ids (`pvp_stake_/pvp_refund_/pvp_payout_<matchId>_<userId>`)
    dedup a settle/sweep race into a no-op.
  - Session linking reuses the vestigial nullable `challenger_id` /
    `opponent_id` uuid columns on `trivia_pvp_matches` (the real participants
    are `player1_id`/`player2_id`). Grepped: the ONLY readers are
    session-start, pvp-settle-match and the sweep. **No migration was needed
    and none was written.**
- `/api/trivia/pvp-settle-match` answers `Method not allowed` to a GET,
  confirming the new route deployed and is POST-only.
- `node --check` passes on all three PvP server files.

## What is NOT verified (be honest about this)

- **No live PvP match has been played.** A two-player (or player-vs-horse)
  run end to end is the one test that cannot be done from this environment;
  the invariants above are code- and schema-level. First real match should be
  watched: expect two `trivia_sessions` rows with `mode='pvp'`, a match row
  moving `active -> settling -> completed`, and exactly one payout/refund
  transaction per human with a `pvp_` reference id.
- Only **arcade** has ever had a live play-through (Antigravity, 08-06).
  mixed / time-attack / endless / survival / the four strategy modes are
  code-verified but unplayed. Recommend one run each; the pattern is
  identical, so a failure in one likely means a failure in all.
- Several modes had deliberate BEHAVIOR changes when their lifelines could
  not survive server grading (50/50 needs the answer key; Double Chance and
  Double-or-Nothing need a non-binding first answer). These are documented in
  each commit. Endless additionally now ends on the third miss, matching its
  own lobby copy, instead of the first.

## Open follow-ups

1. Delete the unreachable credit calls in `[mode].js` and the dead
   `AllInMode.jsx`, so no future edit can resurrect a client mint path.
2. Live play-throughs per mode (above).
3. `push-velocity-watchdog` has been failing on schedule (runs 809-811+) -
   unrelated to this work, but it is the alarm that is supposed to tell you
   pushes have stalled, so it is worth fixing.
4. Re-check `rule_knowledge` generation yield after `0ff7b5d8` (expected
   ~24-26/day, was ~18). Still the deepest pool shortfall.
5. Atomic PvP matchmaking pairing (both players can create separate match
   rows on simultaneous join) was explicitly scoped OUT of this migration.
