# MLB Portfolio page — deep audit, bug fixes, and full upgrade

**Date:** 2026-06-21
**Author:** Cowork agent session (Dan)
**Scope:** `https://smarter.poker/hub/MLB-ANALYTICS/portfolio` and its data layer.
**Supabase project touched:** `nscdmxldtyszyvcxxwgr` (mlb-analytics-engine) — NOT the hub DB.

## TL;DR

The portfolio page had one **critical user-facing bug** (the Market filter was wired to
values that don't exist in the data, so every market chip emptied the page) plus two latent
data-correctness bugs (stale-window timeframe filter, and non-deterministic intra-day
ordering). All three are fixed. On top of that, the page was surfacing ~6 metrics while the
engine DB already exposed a full analytics suite that nothing consumed — so the page was
upgraded to surface Bet Score per bet, a Kelly-vs-flat comparison, a Risk & Quality panel,
per-market and per-tier breakdowns, a drawdown chart, a CSV export button, a data-freshness
stamp, and a methodology note.

## Context / how the page works

- Page: `pages/hub/MLB-ANALYTICS/portfolio.tsx` (client-side, SWR).
- Headline stats API: `pages/api/mlb/portfolio.ts` -> `utils/mlbStats.ts#fetchPortfolioStats`
  -> RPC `get_portfolio_stats(p_days, p_market)` with a JS aggregation fallback.
- Data table: `sim_bets` (763 rows, 2026-03-26 .. 2026-06-09). `market` column only ever
  holds `h2h` and `total`. `result` in {WIN, LOSS, PUSH}. No null numeric fields.

## Bugs found and fixed

1. **CRITICAL — Market filter contract mismatch.** The UI sent `market=Moneyline | Run Line
   | Totals`; the DB column only holds `h2h` / `total`. `get_portfolio_stats` (and the CSV
   route) filter with `market = p_market`, so every non-ALL chip returned **zero rows** and
   blanked the entire page. "Run Line" had no data at all.
   - Fix: chips now map to the raw DB values (`ML -> h2h`, `TOT -> total`) and the phantom
     "Run Line" chip was removed. Friendly labels (`Moneyline` / `Totals`) are shown to users
     in the bets table and the per-market breakdown.

2. **Stale-window timeframe filter.** `p_days` subtracted from `NOW()`. Because the backtest
   data ends 2026-06-09 (12 days before today), the 7-day and most of the 14-day windows
   returned 0 rows -> empty page.
   - Fix: the window is now anchored to `MAX(as_of_ts)` (the end of the backtest) in both the
     RPC and the JS fallback and the CSV route. Verified post-fix: 7d=83 bets, 14d=165, all=763.

3. **Non-deterministic intra-day ordering.** `as_of_ts` is date-granular (all `00:00:00`), so
   ordering bets within a day by `as_of_ts` alone was unstable — the weekly equity "last
   bankroll" and the "recent 20" list could flip between requests.
   - Fix: tie-break by `id` (the monotonic bet sequence) everywhere ordering matters.

4. **Recent-bets table cosmetics.** Raw `h2h`/`total` were shown to users; a negative edge
   would have rendered `+-1.50`; sortable headers were mouse-only.
   - Fix: friendly market labels, prettified selections (`over_8.5 -> Over 8.5`), Bet Score +
     tier badge (replacing legacy edge points; edge kept in the cell tooltip), and
     keyboard-accessible sortable headers (`<button>` + `aria-sort`).

## Upgrades (surfacing data that already existed)

`sim_bets` already stores `bet_score` / `bet_tier` / `game_pk`, and the engine DB already
exposes `sim_risk_metrics`, `sim_market_summary`, `sim_baseline_compare`,
`sim_bet_grade_summary`, and `sim_equity_daily.drawdown`. New route
`pages/api/mlb/portfolio-extras.ts` reads those views (best-effort, degrades gracefully) and
the page now renders:

- Bet Score + tier per bet (canonical suite-wide scoring).
- Kelly-sizing vs flat-staking comparison (Kelly final $6,956.60 vs flat $2,173.68).
- Risk & Quality panel (profit factor 1.57x, expectancy, avg stake, longest win/loss run,
  best/worst day).
- Results by market and Results by Bet Score tier tables.
- Daily drawdown (underwater) chart.
- CSV export button (respects active filters; now includes bet_score/bet_tier).
- Data-freshness stamp ("Backtest window: ...") + methodology / not-betting-advice note.
- Accessibility: `aria-pressed` filter chips, chart `aria-label`s, >=36px tap targets.
- Removed dead interfaces (`SimBet`, `PortfolioPageProps`, `WeeklyCurveItem`) and corrected
  the SEO/JSON-LD copy (was claiming 2025 + CLV/Brier the page never shows -> now 2026 + the
  metrics actually present).

Decision: portfolio is a **public** track-record page (matches `validation`, `standings`,
`index`); it was intentionally NOT wrapped in `MlbPremiumGate` (which gates only the
actionable pick pages: best-bets, props, backtest, accuracy, model-intel).

## SQL

- `supabase/migrations/20260621000000_mlb_portfolio_rpc_anchor_window_betscore.sql`
  — `CREATE OR REPLACE get_portfolio_stats` (anchor window to latest bet; stable ordering by
  `id`; add `bet_score`/`bet_tier`/`game_pk` to recentBets). Applied to
  `nscdmxldtyszyvcxxwgr` via Supabase MCP `apply_migration` and verified by calling the RPC.
  Preserves `SECURITY DEFINER` + pinned `search_path`. No new tables/views created.

## Forward checks

- Market chips only ever expose values that exist in `sim_bets.market`. If a third market is
  ever added to the engine, add it to `MARKETS` in `portfolio.tsx`.
- The "Full Backtest Analytics" sections are intentionally filter-independent (the underlying
  views aggregate all history) and are labelled as such.
- If `get_portfolio_stats` is re-edited, keep the JS fallback in `utils/mlbStats.ts` in sync
  (anchor window, stable order, bet_score/bet_tier/game_pk columns).
