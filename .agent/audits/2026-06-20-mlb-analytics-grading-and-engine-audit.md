# MLB Analytics — Grading / Engine / Evaluation Audit + Fixes

**Date:** 2026-06-20
**Scope:** `/hub/MLB-ANALYTICS` — grading scale consistency, scoring engine, evaluation
(accuracy / backtest / validation / model-intel), simulator, and the API + DB wiring behind them.
**Agent:** Cowork (Claude) deep line-by-line audit of all 17 pages + 18 API routes + data engine.

> Concurrency note: throughout this session a second agent (the "Phase 2–5 / mobile sweep"
> commits in `git log`) was actively rewriting MLB pages and pushing to `origin/main`. Its
> `git add -A` pushes swept this session's edits into commits `6e9a97f30f` (carried forward in
> `81569e0ced`). All 9 code fixes below were verified present in `origin/main` HEAD by marker
> grep; the SQL fix was applied directly to the MLB engine DB and is independent of git.

---

## 1. Architecture ground truth

- The **scoring engine is a separate repo + separate Supabase project**. The Python pipeline
  (`engine/model/bet_scoring.py`, ingest→predict→score→grade→backtest→export) lives in
  `mlb-analytics-engine`; the data lives in Supabase project **`nscdmxldtyszyvcxxwgr`**
  ("mlb-analytics-engine"), NOT the main hub project `kuklfnapbkmacvwxktbh`.
- The World Hub is the **presentation + API layer**, reading the engine DB via `getMlbSupabase()`.
- The autonomous loop is **real and healthy** — GitHub Actions in the engine repo ran a full clean
  cycle on 2026-06-20 (all 10 pipeline stages `success`; `pred_best_bets`/`pred_props`/
  `backtest_accuracy` all `as_of` 2026-06-20).

## 2. Grading scale — was it consistent? (the headline question)

- **Canonical scale = `src/lib/betScore.ts`**: `betScore()` 0–100; tiers **ELITE >=82, STRONG >=68,
  LEAN >=52, THIN >=38, PASS**; `TIER_STYLE` colors (ELITE cyan, STRONG **emerald**, LEAN sky,
  THIN amber, PASS slate).
- **Scoring math has ZERO Python<->TS drift** — `betScore.ts` is a faithful port of
  `bet_scoring.py` (verified line-by-line: `evValue` sigmoid, `confidenceMult` bands, clamp,
  tier cutoffs all identical). The number itself is consistent everywhere.
- **The inconsistency was in the PRESENTATION layer**, now fixed:
  - `best-bets.tsx` painted **STRONG gold (#FFD700)** and dumped LEAN/THIN/PASS into one slate color.
  - The `get_best_bets_stats` RPC defined "ELITE" as `edge_pts >= 5` -> it would have counted **311**
    "elite" bets today when canonically only **1** is ELITE (top score 85). (The RPC was also
    *dead* — see section 4.)
  - `game/[id].tsx` showed a raw cyan score with no tier.

## 3. Code fixes applied (9 files, on `origin/main`)

| File | Fix |
|------|-----|
| `pages/api/mlb/accuracy.ts` | Read **real** `v_backtest_summary` columns (`n/brier/avg_clv/roi`) instead of non-existent `bets_won/bets_lost/accuracy`. The page was showing all-zeros / empty table; now shows real measured Brier + ROI (n-weighted). |
| `pages/api/mlb/model-intel.ts` | `total_bets_tracked` from real `n` (was always 0); `recent_roi` n-weighted over window; **model_version read from real `sim_bets.model_version`** instead of the fabricated `'v4.2.1-Edge'`. |
| `pages/api/mlb/best-bets.ts` | Added `fetchAllRows()` pagination (PostgREST 1000-row cap was silently truncating the ~1,950-hitter / ~1,220-pitcher enrichment pools -> blank player stats). `eliteBets` now canonical `bet_tier==='ELITE'` in both RPC and fallback paths (was `edge` which is never populated -> always 0). |
| `pages/api/mlb/players.ts` | Pagination — the directory returned exactly **1000** of 1953 hitters / 1000 of 1223 pitchers (verified live). Now returns the full pool. |
| `pages/hub/MLB-ANALYTICS/best-bets.tsx` | `getTierColors()` -> full **canonical 5-tier palette** (STRONG emerald, distinct LEAN/THIN/PASS). Removed gold STRONG on cards + game-group accent. |
| `pages/hub/MLB-ANALYTICS/game/[id].tsx` | Frozen Bet Score now rendered with canonical tier color + tier label; fixed `prop.price` (undefined -> `prop.odds ?? prop.price`). |
| `pages/hub/MLB-ANALYTICS/validation.tsx` | Negative ROI in the edge-bucket table rendered identical cyan to positive (losses looked like wins) -> now red `#FF0055`. |
| `pages/hub/MLB-ANALYTICS/hr-tracker.tsx` | Removed bare emoji from `STATUS_CONFIG` (RULE 7 / SWC build risk) -> geometric markers. |
| `pages/hub/MLB-ANALYTICS/tracker.tsx` | Footer claimed "Real-Time WebSockets Active" but it's 15s SWR polling -> "Live Auto-Refresh Active"; scoped the global `div::-webkit-scrollbar` leak to `.scrollbar-hide`. |

## 4. SQL applied (MLB engine DB `nscdmxldtyszyvcxxwgr`)

Migration **`fix_best_bets_stats_date_cast_and_elite_tier`** (applied via Supabase, recorded in
`list_migrations`):

- **Resurrected a dead RPC.** `get_best_bets_stats` compared `official_date` (date) `=` `actual_date`
  (text) — no such operator, so the function **always errored** and `best-bets.ts` had silently been
  running its JS fallback. Fixed by typing `actual_date` as `date`.
- **Canonical elite count.** `eliteBets` filter changed `edge_pts >= 5` -> `bet_tier = 'ELITE'`.
- Verified: `get_best_bets_stats()` now returns `totalBets 366, eliteBets 1 (canonical), topScore 85`
  vs the legacy `edge>=5` count of 311.

## 5. Deferred / handed off (not fixed here)

- **CLV is structurally present but ~0** (`avg_clv_ml` approx 1e-18): no closing-line snapshot job runs at
  game time to diff open vs close. This is an **engine-repo** task (`run_backtest_clv.py` + a
  closing-odds capture cron) — out of scope for the Hub. Accuracy/backtest now label CLV honestly.
- Files actively owned by the concurrent agent this session (`props.tsx`, `props.ts`, `standings.*`,
  `teams.ts`, `teams/[team_id].*`) were **left to that agent** to avoid clobbering its WIP; it had
  already canonicalized `props.tsx` (correct `BetScoreBadge` usage) and added `TeamGradeBadge`.
- Minor remaining items for a later pass: `best-bets.ts` fuzzy name-matching for enrichment (prefer
  `player_id` joins); intraday-snapshot dedupe on the best-bets list; `portfolio-csv.ts` is an
  unauthenticated full-ledger export.

## 6. Verification

- All 9 code fixes confirmed in `origin/main` HEAD by marker grep; the carrying commit passed the
  repo build gate.
- SQL fix verified by direct RPC call against the engine DB (numbers in section 4).
- Production deploy of the carrying commit was in flight at audit close (prod advancing
  c5020d52 -> 0f8d7d37 -> ...6e9a97f3); the engine-DB SQL fix is live immediately.
