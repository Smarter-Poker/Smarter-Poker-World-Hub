# 2026-08-08 - Trivia phase 2: dead reward RPC containment, daily fixes, quota yield

Continuation of `.agent/audits/2026-08-05-trivia-server-grading-continuation.md`
and the arcade validation Antigravity completed on 2026-08-06 (Playwright run,
session `b76c64a6`, single server credit, no double-pay - verified in SQL).

## The headline finding: rewards have been silently dead on six surfaces since Aug 3

`add_diamonds_to_balance` lost `authenticated` EXECUTE on 2026-08-03
(migration `20260803140000`), and the grant list today is postgres +
service_role only. That was correct - a browser-callable credit is a mint -
and `DiamondEngine` was properly rebuilt around server APIs
(`/api/diamonds/spend`, `/api/rewards/claim`). But the trivia pages bypass
DiamondEngine and call the RPC DIRECTLY. Since Aug 3:

- `mixed.js`, `endless.js`, `time-attack.js`, `survival-game.js`, and
  `StrategyTrivia.jsx` (powering mtt/cash/icm/gto) charged a REAL 10-diamond
  entry through the working server spend path and then silently failed every
  reward credit (42501).
- `pvp.js:79` match payouts fail the same way - PvP winners are unpaid.
- `[mode].js`'s Double-or-Nothing wager could not credit a win (or collect a
  loss), and the daily +10 completion bonus could not be credited either.
- Zero trivia reward transactions exist in `diamond_transactions` since
  2026-08-06 02:30 UTC (and those were the arcade validation runs).

Also found: Antigravity's 2026-08-06 handoff-completion summary said the gate
"already includes 'arcade'" - it actually shipped FIVE modes live (arcade,
daily, history, rules, pro). Only arcade had a verified play-through. The
other four are free modes and pay through the working server path, so they
were left live; daily's regressions (below) are fixed.

## Shipped this phase (all blob-SHA verified via GitHub MCP)

- `63fbfcc0` (PR #578 squash): INTERIM FREE ENTRY - mixed / endless /
  time-attack / survival GAME_ENTRY_COST 10 -> 0 and mtt / cash / icm / gto
  diamondCost 10 -> 0 in `triviaEngine.ts`, each annotated to restore the
  price in the same commit that adopts server grading for that mode. Arcade
  keeps its price (it pays via `award_trivia_run`). Double-or-Nothing offer
  made unreachable in `[mode].js` (dead credit path). Daily bonus gate fixed
  from a hard-coded 20 to the roster size, and server-graded runs display
  the server-paid amount (`dailyBonusAwarded`).
- `9431f668`: server-graded daily fixes. `session-start` now serves the
  daily_date-tagged SHARED roster (order_index asc, quality-floored, pool
  top-up only when short) instead of dealing each player a private random
  draw - restoring the one-roster-per-day promise and a comparable
  leaderboard. `session-submit` pays the +10 completion bonus server-side,
  idempotent per CST day (`trivia_daily_bonus_<user>_<date>`), reported as
  `dailyBonusAwarded`, on top of the run cap (historic behavior).
- `0ff7b5d8`: generation yield. The adaptive planner correctly quotes
  `rule_knowledge` ~26/run, but the flat +2 per-difficulty over-request
  cannot absorb validator + dedup attrition in a narrow category, netting
  ~18/day against a -899 shortfall. Spares now scale to half the batch
  (min 2); inserts stay capped at the planned count.

## Still open, priority order (the next phase)

1. **Server-graded adoption for the free-until-fixed surfaces**, one at a
   time, restoring each entry price in the same commit: mixed (closest to
   [mode].js shape) -> time-attack -> endless -> survival-game ->
   StrategyTrivia (mtt/cash/icm/gto). The hook (`useServerGradedRun`),
   routes, and TriviaGame `serverGrader` prop are all live and validated;
   endless / time-attack / survival need batched or per-answer submission
   sized to their open-ended formats (session-answer already supports
   per-answer; MAX_QUESTIONS already admits survival 400 / endless 1000).
2. **PvP settlement**: `pvp.js` payouts are dead and scoring is still
   client-authoritative (`pvpMatchmaking.js`). Needs a server settlement
   route (grade both sides from server-stored answers, pay winner, refund
   ties) - the pvp-settle cron only rescues STALE matches.
3. **Double-or-Nothing server route** if the feature should come back
   (currently unreachable).
4. Re-check `rule_knowledge` net insertions in ~3 days (expect ~24-26/day
   post-0ff7b5d8; still ~6 weeks to the 1,200 floor at that rate - raising
   ADAPTIVE_MAX_PER_CATEGORY or adding a second daily dispatcher run are
   the levers, both cost Grok tokens = Dan's call).
5. Phase D audit coverage (`last_audited_at`) - confirm it is stamping rows.

## Verification notes

- All pushes blob-SHA verified; one subagent had to assemble oversized
  content via a temp branch + PR #578 squash (six files, 448KB - beyond one
  push_files call). Temp branch `fix/trivia-free-entry-dead-rpc` is merged
  and can be deleted.
- `node --check` / tsc syntax gates run on every edited JS file.
- Deploy verification for the batch: production /api/health must serve
  `0ff7b5d8` or a descendant (Vercel auto-build from main).
