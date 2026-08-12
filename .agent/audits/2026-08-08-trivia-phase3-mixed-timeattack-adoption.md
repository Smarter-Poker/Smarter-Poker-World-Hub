# 2026-08-08 - Trivia phase 3: mixed + time-attack adopt server grading

Continuation of `.agent/audits/2026-08-08-trivia-phase2-dead-rpc-and-daily-fixes.md`.
Phase 2 contained the dead-reward-RPC incident by zeroing entry fees; this
phase starts working the containment back off, one mode at a time, restoring
each price in the same commit that makes its rewards real again.

## Shipped (all blob-SHA verified via GitHub MCP, first-try byte-exact)

- `ccbfa17b` - **mixed** adopts the session flow. Client question pipeline
  (seen-history / random pool / shuffle) replaced by `session-start` (21
  questions, server-permuted, no answer key); every tap graded through
  `session-answer` (binding first answer; verdict drives reveal, sounds,
  streak, explanation); settlement through `session-submit` under the 40/day
  cap. Session opens BEFORE the charge, so a start failure cannot eat the
  fee; all charge-failure paths reset the session. trivia_scores / history /
  mastery / results all use server numbers. Dead `add_diamonds_to_balance`
  calls and client clamp math deleted. `GAME_ENTRY_COST` back to 10. Note:
  the exact 3-per-category deal is now a server draw across the mode's
  categories.
- `20f63684` - **time-attack** adopts the same flow, plus the prerequisite
  engine change: `calculateDiamonds()` gains a count-based branch (endless
  and time-attack pay diamondReward per correct answer; the accuracy
  fallthrough would have priced a whole run at 0-1 diamonds). Page requests
  a 60-question session for the 30s clock, grades per tap via a new optional
  `serverGrader` prop on `TimeAttackGame` (prop absent = warn + release; the
  page is the component's only consumer), submits the answered list at
  expiry, and shows the reached count rather than the padded roster.
  Economy copy updated to "+1 Diamond Per Correct Answer" to match what the
  server actually pays. `GAME_ENTRY_COST` back to 10.
- `5b7063ba` - lobby pricing table (triviaEngine) catches up: mixed and
  time-attack back to `diamondCost: 10` so the lobby stops advertising a
  free game that charges at Start. The five not-yet-adopted modes stay free.

## State of the migration

| Surface | Grading | Entry | Notes |
|---|---|---|---|
| arcade | server (validated 08-06) | 10 | stake pot recomputed server-side |
| daily / history / rules / pro | server | 0 (free by design) | daily: shared roster + server bonus fixed in phase 2 |
| mixed | server (this phase) | 10 | |
| time-attack | server (this phase) | 10 | count-based payout branch |
| endless | client (dead rewards) | 0 interim | next: same pattern as time-attack; payout branch already in the engine |
| survival-game | client (dead rewards) | 0 interim | level-based; needs per-level session or batched submits |
| mtt / cash / icm / gto (StrategyTrivia) | client (dead rewards) | 0 interim | one shared component, four modes |
| pvp | client scoring AND dead payouts | stakes | needs its own settlement route; pvp-settle cron only rescues stale matches |

## Next phase

1. **endless** - closest remaining fit (count-based branch already shipped;
   session cap already admits 1000 questions). Restore price on adoption.
2. **survival-game** - decide per-level sessions vs one long session with
   batched submits; the answers ordinal already preserves sequence.
3. **StrategyTrivia** - one component adoption unlocks mtt/cash/icm/gto,
   restore all four prices.
4. **PvP settlement route** - grade both sides from server-stored answers,
   pay winner / refund tie via service role; kill the client-reported score
   write in pvpMatchmaking.
5. Re-check rule_knowledge net insertions (~3 days after 0ff7b5d8; expect
   ~24-26/day vs the prior ~18).

## Verification

- All pushes blob-verified; every file landed byte-exact first try this
  phase.
- Deploy gate: /api/health must serve `5b7063ba` or a descendant.
- Post-deploy watch: first real mixed / time-attack runs should produce
  trivia_sessions rows with mode='mixed' / 'time-attack' and single
  server-side credits (reference trivia_session_<uuid>) - same SQL checks
  as the arcade validation.
