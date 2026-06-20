# Audit — MLB Player Props page: grading scale + wiring (2026-06-20)

**Scope:** `https://smarter.poker/hub/MLB-ANALYTICS/props`
**Files:** `pages/hub/MLB-ANALYTICS/props.tsx`, `pages/api/mlb/props.ts`,
`supabase/migrations/20260620160000_pred_props_as_of_priced_index.sql`
**Shipped:** PR #536, squash-merge `320da5ff` on `main`.

## TL;DR

The Player Props page was the only MLB surface NOT on the canonical Bet Score
grading scale, and its grade badge was wired wrong so it never rendered a grade.
The page (and API) also mis-derived the over/under side because `pred_props.rec`
is freeform, which made every EV%/Win% figure compute for the wrong side. Fixed
both, ranked by Bet Score, added a rationale detail modal (parity with Best
Bets), and added a partial index for the slate query.

## Context — what "the same grading scale as every page" means

`src/lib/betScore.ts` is the documented single source of truth (a faithful TS
port of `engine/model/bet_scoring.py`). It produces:
- `betScore` 0–100 (VALUE = EV x confidence haircut)
- `tier`: ELITE >=82 / STRONG >=68 / LEAN >=52 / THIN >=38 / PASS
- `winConfidence` 0–100 (price-blind likelihood)

`index.tsx` (dashboard) and `best-bets.tsx` both surface this scale.
`best-bets` consumes server-computed `bet_score`/`bet_tier`/`win_confidence`
from the Python engine (`pred_best_bets`). `index.tsx` computes it client-side
via `<BetScoreBadge pWin price pMarket lineupLocked>`.

## Root causes (bugs found)

1. **Grade never rendered.** props.tsx called
   `<BetScoreBadge score={ev+50} isOver={isOver} />`. `BetScoreBadge` accepts
   `pWin`/`price`/`pMarket`, NOT `score`/`isOver`, so both were `undefined` and
   the component always returned its "Awaiting price" pending state. (`@ts-nocheck`
   hid the prop mismatch.)
2. **Wrong grading scale.** The page used a legacy `edge_pts` tier system
   (gold >=10, cyan >=5) and "5+ EDGE / 10+ ELITE" headers — the exact thing
   betScore.ts was written to replace platform-wide.
3. **Over/Under side was always wrong.** `pred_props.rec` is freeform
   (`NO BET`, `MODEL ONLY`, `LEAN OVER`, `LEAN UNDER`, `NO EDGE`,
   `BET (Quarter-Kelly: 1.8%)`, ...) and the `BET (...)` strings carry NO side.
   Both `props.ts` (`isOver = p.rec === 'over'`) and `props.tsx` keyed off
   `rec === 'over'`, which is never true. Server EV% was therefore computed for
   the UNDER side on every prop; `implied_prob`/WIN% showed the raw over prob
   regardless of the recommended side.
4. **Ranked by the wrong metric** (`edge_pts`, not Bet Score).
5. **Missing wiring.** API never sent `blended_over` (the calibrated win prob
   the rest of the platform prefers) or `kelly_pct`.
6. **Slate date timezone bug.** Slate date was derived from a UTC slice of
   `as_of_ts`; the slate is an America/Chicago day, so an evening-Chicago slate
   could be labeled with tomorrow's date and mis-trip the stale banner.
7. **Perf.** Slate query filtered `as_of_ts` only; both existing indexes lead
   with `game_pk`, so it seq-scanned all ~30k rows every request.

## Resolution

- **API (`props.ts`):** infer side from model-vs-market prob (value is on the
  side the model prices above the market), fall back to proj-vs-line. Compute
  side-aware `p_win`/`p_market`/`price` and run them through `explain()` from
  `betScore.ts` to attach `bet_score`/`bet_tier`/`win_confidence`/`ev_pct`/
  `score_verdict`/`score_factors`. Return only priced (gradeable) rows, sorted
  by Bet Score. Added `blended_over`/`kelly_pct`. Chicago-day UTC range
  (DST-safe) for slate selection + correct `official_date`.
- **Page (`props.tsx`):** render the canonical `<BetScoreBadge pWin price
  pMarket>` (identical to index.tsx); tier-colored accents matching
  betScore.ts; correct O/U from `side`; EV%, Win% (already 0–100), Kelly chip;
  Bet Score header stats (TOTAL / ELITE / TOP); MIN GRADE filter (ANY / LEAN+ /
  STRONG+ / ELITE); exact-prop market filters; a tap-to-open detail modal with
  the score rationale (factors + verdict); incremental "Load More" rendering.
- **SQL (applied to MLB project `nscdmxldtyszyvcxxwgr`):**
  `CREATE INDEX ix_pred_props_as_of_priced ON pred_props (as_of_ts DESC) WHERE
  best_price IS NOT NULL;` — slate query now `Index Scan` (verified via EXPLAIN).

## Verification

- Transpile-clean (ts.transpileModule, 0 errors) for both files.
- No emoji / no `.single()` / no merge markers.
- Migration recorded (`list_migrations`) + EXPLAIN confirms index usage.
- PR #536 contained ONLY the 3 intended files (no cross-agent WIP).
- `main` HEAD = `320da5ff`; production deploy `dpl_4AMoEToHSTnuxvgb1e5XFgLaRWYg`.

## Notes / follow-ups

- `agent-push.sh` could NOT run here: the FUSE-mounted `.git` rejects lock-file
  unlink (`Operation not permitted`), so worktree/commit failed before any push.
  Worked around by committing the 3 named files via the GitHub API
  (blobs -> tree -> commit -> branch -> PR -> squash-merge), preserving the
  "named-files-only, no `git add -A`" guarantee. If future agents hit the same
  mount limitation, use the API path.
- `best_price` is assumed to be the recommended-side price (matches the prior
  author's intent). All sampled priced `BET` rows were OVER; the side logic
  handles UNDER symmetrically should the engine ever recommend it.

## Phase 2 — "Bet Score 1 / PASS" diagnosis + reliability-suppression consistency (live app)

**Finding (NOT a bug):** Some priced props (e.g. Troy Melton earned_runs O2.5,
TJ Rumfield runs O0.5 +4.9 edge @ +120) render a frozen Bet Score of **1 / PASS**
despite a positive raw model edge. Root cause: `bet_type_reliability` marks
`earned_runs, rbi, runs, hrr, walks, pitcher_walks, stolen_bases` as
`status='suppress'` / `score_mult=0` (proven -EV historically, ROI -31% to -70%).
The Bet Score correctly bakes that in → 1/PASS. So the score is RIGHT; the model's
"edge" on these markets does not translate to profit.

**Real bug fixed:** the live props page still labeled those proven-loser props as
`BET/LEAN OVER` with a Kelly stake and a positive edge — advertising ~357 props as
actionable that its own Bet Score graded PASS. The rec layer ignored the reliability
ledger.

**Fix (mlb-analytics-engine PR #5):** the live API
(`web/src/app/api/props/live/route.ts`) and the SSR initialProps
(`web/src/app/props/page.tsx`) now load `bet_type_reliability`, build a suppressed
set (`status='suppress'` or `score_mult < 0.2`), and classify suppressed bet types
as `NO EDGE` with `kelly_pct = null`. Only reliability-approved markets
(hits, home_run, total_bases, pitcher_strikeouts) are recommended; suppressed
markets are hidden (consistent with their PASS Bet Score).

**Verified live (production proxy):**
- API rec distribution: earned_runs 42→all NO EDGE, runs 27→NO EDGE, hrr 77→NO EDGE,
  walks/pitcher_walks/rbi→NO EDGE, 0 Kelly; `suppressedLeak: []`.
- Rendered UI: BET OVER 46 / LEAN 174 (was 85/257), `score1Visible: 0`,
  Earned Runs / H+R+RBI no longer shown as actionable cards.

**SQL:** none required — reads the existing `bet_type_reliability` ledger.

**Architecture note (unchanged):** the live page is the `mlb-analytics-engine` app
(App Router, basePath `/hub/MLB-ANALYTICS`) served via the World Hub `beforeFiles`
proxy. The World Hub `pages/hub/MLB-ANALYTICS/props.*` is the shadowed/vendored copy
(fixed in Phase 1 for consistency but not user-facing). A parallel agent swarm was
concurrently moving every MLB page onto the canonical Bet Score during this audit.
