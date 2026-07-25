# MLB Engine — Phase 3: F5 betting surface end to end + grading gap closed (2026-07-05, night)

Follow-on from phases 1-2 (same date). Engine commits: `e3a0541919`, `6522110ad1`, `a07eb0499c`.
Trigger: Dan flagged that every sportsbook offers F5 markets while the engine had none bettable.

## Root causes found (three separate ones)

1. **Vendor gap**: The Odds API carries NO baseball F5 team-totals market under any key
   (verified against their published market list). We were requesting three nonexistent
   keys (`team_totals_1st_5_innings`, `alternate_team_totals_1st_5_innings`,
   `team_totals_1st_half` — 0 rows ever) and NOT requesting two F5 keys they DO support.
2. **Starving consensus chain**: daily_compute + betting_stats already parsed
   `team_totals_1st_5_innings` raw rows into `f5_tt_*` consensus, and predict had a
   documented TODO for the kwargs — the chain existed end to end but had no data source.
3. **Grading black hole**: `_resolve_market` only settled h2h/total/run_line/nrfi. ALL F5
   markets AND full-game team_total were never graded live (600+ result=null rows/week) —
   which is WHY those markets sat sample-starved behind the gate forever.

## Shipped

- `e3a0541919` — odds_api.py: dead keys removed; `spreads_1st_5_innings` (F5 run line) +
  `alternate_totals_1st_5_innings` now fetched (live probe: 7 books quoting F5 RL tonight).
  run_intraday maps spreads_1st_5_innings -> f5_run_line.
- `6522110ad1` — NEW `extractors/bovada_odds.py`: one Bovada coupon request per cycle lands
  F5 team totals for the whole slate as raw_odds `team_totals_1st_5_innings` rows
  (selection `<Team>::Over/Under`, the exact shape daily_compute already parses).
  Best-effort contract. daily_predict now prices the REAL market line with a real
  market_novig_prob (market_f5_tt_* kwargs); mean-derived MODEL ONLY lines are fallback.
  fill_best_prices maps the market for prices/price_ts. Tests: test_bovada_odds.py PASS.
- `a07eb0499c` — grade_predictions.py: linescore-based settlement for f5_moneyline,
  f5_total, f5_run_line, f5_team_total + selection-parsed grading for team_total.

## Verification (all against production)

- Bovada extractor live run: 32 rows landed; SD@LAD = LAD F5 TT 3.5 (O +110 / U -145),
  SD 1.5 (O -150 / U +115). Notably the sim's self-generated F5 lines were 6.5/7.5 —
  the market anchor corrects a large distortion.
- daily_compute re-run: `agg_market.metrics` now carries `f5_tt_home_line 3.5 @ 0.4402`,
  `f5_tt_away_line 1.5 @ 0.5697` for the Dodgers game.
- Backfill-graded 452 rows (6/28-6/29), 0 failures. Mirror-symmetry sanity: f5_team_total
  122W/122L, team_total 59W/59L, f5_total 30W/30L + 6 pushes (over/under pairs must split).
  External spot-check vs game 822795 linescore (away F5 runs = 0 -> away overs loss,
  away under 2.5 win): exact.
- py_compile clean; test_bovada_odds PASS.

## Gate discipline unchanged

f5_team_total / f5_run_line remain UNPROVEN_MARKETS with prohibitive floors. Nothing new
is bettable today. What changed: these markets now accrue GRADED evidence (and CLV once
closing prices land), so auto_gate can promote them on real performance — the same path
hits props took. No shrinks hardcoded, no gates bypassed.

## Also this phase (earlier in session)

Dodgers-game manual review + SGP copula pricing using the stored joint_corr matrix
(LAD -1.5 + Over 10: independent 27.7% vs joint 33.3%, fair +201) — first real use of
the C11 data; the production consumer is designed but NOT yet built.

## Open (ranked for next session)

1. **C11 SGP consumer**: productionize the copula parlay pricer (bet_card_engine or a new
   `model/sgp_pricing.py`): for each gate-approved pair of correlated legs, emit joint
   prob + fair price + breakeven so the card can show "parlay worth it above +X".
   scipy IS available on the pipeline host (adaptive sim uses it). The manual math from
   this session is the spec: Gaussian copula, sim's margin-total corr, blended marginals.
2. F5 run line emission in daily_predict (raw_f5 margins exist; mirror the f5_total
   pattern; odds now flow).
3. C12 live in-game repricing scope; retire-or-fill agg_defense.framing_runs.
4. Known cosmetic: commit message of a07eb0499c contains a stray CJK char ("were永never").
5. Hetzner: needs `git pull` to reach a07eb0499c (timers pick up fresh code, no restarts).

## Ops notes

- Bovada coupon is fetched once per odds cycle with a browser UA; if they ever block the
  datacenter IP the extractor degrades to {"rows":0,"error":...} without hurting the cycle.
  Watch the reprice output key `bovada_f5_tt` for persistent errors.
- The 22:41 UTC manual extractor run seeded tonight's slate; the pipeline takes over
  after the Hetzner pull.
