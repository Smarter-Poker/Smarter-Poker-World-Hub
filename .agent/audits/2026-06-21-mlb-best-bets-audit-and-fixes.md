# MLB Best Bets — deep audit, bug hunt, and fixes

**Date:** 2026-06-21
**Page:** https://smarter.poker/hub/MLB-ANALYTICS/best-bets
**Files touched:** `pages/hub/MLB-ANALYTICS/best-bets.tsx`, `pages/api/mlb/best-bets.ts`
**Method:** read-only audit delegated to subagents (frontend page, API/data wiring, docs/backlog); decisions + fixes kept in the main thread; data layer verified live against the engine DB.

---

## TL;DR

Audited the Best Bets page end-to-end. Found and fixed **one render-crashing BLOCKER**, **three detail tiles that read columns that don't exist** (so they never rendered), a **filter mis-bucketing bug**, a wasted re-render, and several wiring/quality gaps. Pitcher props now show K and WHIP; accented/suffixed player names now enrich correctly. No SQL migration was required — the slate query already runs in ~2 ms on the correct index, and the docs-suggested partial index would not be used by the actual query. Four items are out of this page's scope and were handed off (CLV, portfolio-csv auth, an optional engine index, enrichment over-fetch).

## Data layer (verified live)

Best Bets is backed by the **mlb-analytics-engine** Supabase project (`nscdmxldtyszyvcxxwgr`), not the World Hub DB. The endpoint calls RPC `get_best_bets_stats` (DISTINCT ON dedupe of intraday repricing snapshots) with a JS fallback over `pred_best_bets`, then enriches via views `v_hitter_profile` / `v_pitcher_profile` and `agg_pitcher (window_kind='fg_season')`. Today (2026-06-21) `pred_best_bets` has 43 fresh rows; data is live. Real shape: `bet_type` in {line, prop}; `market` in {h2h, run_line, total, hits, total_bases, pitcher_strikeouts, home_run, rbi, walks, runs, hrr, earned_runs, pitcher_walks}.

---

## BLOCKER (fixed)

**React Rules-of-Hooks violation — page white-screened whenever the API errored.** `gameGroups = useMemo(...)` was placed *after* the conditional `if (error || data?.error) return ...`. On an error render fewer hooks ran than on a success render, throwing "Rendered more hooks than during the previous render" and blanking the page exactly when the API was flaky. **Fix:** moved the derived state and both `useMemo`s (`filteredBets`, `gameGroups`) above the early return so hook order is stable across error/success renders. Verified: `filteredBets` (1181) and `gameGroups` (1206) now precede the error return (1220).

## HIGH (fixed)

1. **Three detail tiles read non-existent columns -> never rendered.** The UI read `bet.edge`, `bet.ev_kelly`, `bet.market_novig_prob`, `bet.implied_prob_novig`; the table columns are `edge_pts`, `kelly_pct`, `market_prob`, `model_prob`. The RPC passes columns through verbatim, so these tiles were silently dead. **Fix:** mapped to the real columns. Edge, Stake (Kelly), and the Market No-Vig / Model Prob block now render with live values (scales confirmed: probs are 0-1 -> x100; edge_pts is points; kelly_pct is %).
2. **Filter tabs mis-bucketed bets.** Substring matching (`market.includes('total')`) routed `total_bases` props into the TOTAL tab and let one bet satisfy multiple tabs. **Fix:** rewrote `filteredBets` to structured `bet_type`/`market` equality (ML=line+h2h, TOTAL=line+total, RUN LINE=line+run_line, PROPS=prop). Mutually exclusive and correct.
3. **Wasted re-render.** `gameGroups` `useMemo([filteredBets])` recomputed every render because `filteredBets` was a fresh array each render. **Fix:** memoized `filteredBets` on `[bets, filter]`; replaced fragile `Math.max(...spread)` with a `reduce`.
4. **Unlogged fetch errors / dead import.** `logError` was imported but never used (a Rule-4b/CI risk), and the SWR fetcher threw with no logging. **Fix:** wrapped the fetcher in try/catch and routed failures through `logError`.

## MEDIUM (fixed — feature completion)

1. **Pitcher props had no K or WHIP.** The UI renders `pitcher_so` and `pitcher_whip` but enrichment never set them. **Fix:** widened the `agg_pitcher` select to include `so, bb, h, ip`; set `pitcher_so` directly and compute `pitcher_whip = (bb + h) / ip`.
2. **Player enrichment missed accented/suffixed names** (e.g. "Jose Ramirez", "Luis Robert Jr."). **Fix:** added a pure-ASCII `normName()` (lowercase, NFD accent strip via char-code, punctuation + Jr/Sr/II/III/IV suffix strip) applied to both the lookup maps and the bet selection text, improving the name-match hit rate.

## LOW (fixed)

- Missing team abbreviations `AZ`, `ATH`, `WSH` added to the logo maps (page + API) so those clubs' logos render.
- React row keys switched from `${game_pk}-${selection}-${idx}` to the full bet-identity composite, preventing `BetRow` remounts and headshot re-flash on re-sort.
- `haElite` typo renamed to `hasElite`.

---

## SQL decision (evidence-based — no migration applied)

My code changes use only existing columns (`agg_pitcher.so/bb/h/ip`, `pred_best_bets.*`), so **no schema change was required**. I verified the hot paths with `EXPLAIN ANALYZE`:

- Slate RPC inner query: **2.19 ms**, Index Scan on `idx_pred_best_bets_official_date`, in-memory quicksort of 53 rows. Already optimal. The docs-suggested `pred_best_bets(as_of_ts) WHERE best_price IS NOT NULL` partial index would **not** be used by this query (it filters `official_date`, not `as_of_ts`) — adding it would be dead weight, so it was deliberately not added.
- `agg_pitcher` enrichment: **32 ms** via existing `(as_of, window_kind)` index. The real cost is the full-pool over-fetch, a code refactor, not an index. A `(window_kind, as_of DESC)` index is a marginal win — handed off to the engine repo rather than mutating the engine schema from a hub session (RULE 12).

## Verification

- `tsc --noEmit` across the repo: **0 errors** (exit 0).
- Both files NUL/DEL-clean; my additions are pure ASCII (pre-existing UI box-drawing/dashes untouched).
- Hook-order, single-definition, and dead-field-removal confirmed by grep.
- Production SHA confirmation recorded at push time (see commit / `/api/health`).

## Deferred (out of this page's scope — see handoff `2026-06-21-mlb-best-bets-followups.md`)

1. **CLV** still non-functional (`avg_clv_ml` ~0) — needs an engine-side closing-odds capture job. Hub pages already label it honestly.
2. **`/api/mlb/portfolio-csv` is unauthenticated** — portfolio page endpoint, security follow-up.
3. **Optional `agg_pitcher (window_kind, as_of DESC)` index** — engine DB perf parity.
4. **Best-bets enrichment over-fetches the full hitter/pitcher pools every request** — fetch only the players referenced by the slate.
5. **Paywall teaser:** the 4 header counts (Bets/Elite/Top Score/Top Lock) render above `MlbPremiumGate` for non-VIPs. The pick list itself is gated; the counts are an intentional conversion teaser. Left as-is by design — flip to masked if preferred.
