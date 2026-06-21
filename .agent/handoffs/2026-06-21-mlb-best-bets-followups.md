# Handoff — MLB Best Bets follow-ups (out of page scope)

**Created:** 2026-06-21
**Origin:** Best Bets deep-audit session (see `.agent/audits/2026-06-21-mlb-best-bets-audit-and-fixes.md`).
**Why a handoff:** these four items fall outside the Best Bets page itself — they touch the engine repo/DB or a different feature's endpoint. Each is self-contained so a credentialed agent can execute end-to-end.

---

## 1. Optional perf index on the engine DB (mlb-analytics-engine, `nscdmxldtyszyvcxxwgr`)

The best-bets and props enrichment both run `SELECT ... FROM agg_pitcher WHERE window_kind='fg_season' ORDER BY as_of DESC` on every request. Measured: ~32 ms using the existing `(as_of, window_kind)` index. A `(window_kind, as_of DESC)` index seeks the equality column first and would cut this. Additive, low-risk, but belongs in the engine repo's migration flow (do not mutate the engine schema from a hub session — RULE 12).

```sql
-- engine repo migration
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agg_pitcher_wk_asof
  ON public.agg_pitcher (window_kind, as_of DESC);
-- then re-run EXPLAIN ANALYZE on the enrichment query and confirm the new index is chosen.
```

Bigger win (code, not index): the enrichment fetches the **entire** hitter/pitcher pools (~1950 + ~1220 rows) on every request to name-match ~50 bets. Refactor `enrichBets` to collect the slate's `player_id`s / names first and query only those.

## 2. Security: `/api/mlb/portfolio-csv` is unauthenticated (this repo)

`pages/api/mlb/portfolio-csv.ts` serves a full betting ledger with no auth/user filter — anyone who discovers the URL gets the data. Add the standard JWT check (`supabase.auth.getUser(token)` via `src/lib/supabaseServerClient`) and filter rows by the authenticated user id. Not part of the Best Bets page, so left untouched here.

## 3. CLV (closing-line value) still non-functional

`avg_clv_ml` is ~0 across the board because no engine job captures closing odds at game time to diff open vs close. Needs an engine-side closing-odds snapshot cron + `run_backtest_clv.py`. Hub accuracy/backtest pages already label CLV honestly, so this is not user-visible-broken, just unbuilt.

## 4. (Optional) Paywall teaser decision

The 4 Best Bets header counts (Bets / Elite / Top Score / Top Lock) render above `MlbPremiumGate`, so non-VIPs see them. The pick list itself is gated. Left as an intentional conversion teaser. If you'd rather mask the three model-derived values for non-VIPs, add `useVIP()` to the page and blank Elite/Top Score/Top Lock when `!isVip`.
