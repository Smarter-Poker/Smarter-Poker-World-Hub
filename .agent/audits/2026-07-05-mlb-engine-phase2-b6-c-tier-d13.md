# MLB Engine — Phase 2: deque fix, B6 decomposition, C-tier verification, D13 root cause (2026-07-05, late)

Follow-on from `.agent/audits/2026-07-05-mlb-engine-health-and-display-tier.md` and the
Hetzner sync audit (`hetzner-sync-2026-07-05.md`). Engine commit: `aca37129e0`.

## Shipped

1. **Deque-race soft retry** (`daily_enrich._safe`): pybaseball's module-level cache deque
   is not thread-safe under the 3-worker ThreadPoolExecutor; "deque mutated during
   iteration" (the real cause behind the 20:33 reprice error, per Hetzner journal) now
   retries once instead of aborting the pregame run. Any other RuntimeError still fails fast.

2. **B6 edge decomposition** (`bet_card_engine.score_bet_card`): every scored card now
   carries `model_edge_pts` (model vs consensus) and `price_edge_pts` (consensus vs offered
   price) plus an "Edge split" score factor labeling the bet as model disagreement,
   line-shopping value, or a mix. Persisted through the existing `score_factors` jsonb —
   no schema change. Live-verified against prod: Braves total under_9.0 decomposes to
   +5.1 pts model / -2.0 pts price.

3. **D13 root cause CLOSED**: the "live-ingest team_total writer" is `live_ingest.run_live()`
   itself — it delegates to `daily_predict.run(live=True)`, which re-runs the full slate
   prediction and re-emits EVERY market row (team_total, f5_*, nrfi) each reprice cycle.
   Historical BET resurrections happened because re-emission outran the sweeps. Containment
   is now at the source (999.0 prohibitive floors inside daily_predict's own emission);
   verified empirically — today's 60 team_total rows are all NO BET, zero affirmative BETs
   on any prohibited market. Documented in the live_ingest docstring.

## C-tier verification results (no code needed)

- **C7 pitch arsenals**: REAL — 713 agg_pitcher window_kind='arsenal' rows today,
  486/500 sampled with fastball usage (312 unique values); batter side 186 unique
  overall_whiff values. Consumed by daily_predict via k_rate_multiplier (clamped ±8%).
- **C8 catcher framing**: REAL — 51 catchers with framing_runs in the sc_adv window
  (range −9.2..+6.2 runs, 44 unique), FG FRM primary with Savant fallback + CS% shrinkage.
  Note: team-level `agg_defense.framing_runs` is NULL for all 30 teams — that column is
  NOT what predict reads (per-catcher sc_adv is); harmless but could be retired or filled.
- **C9 rookie priors**: implemented via `model/small_sample_penalty.py` (continuous ramp,
  severity-scaled by SIERA/xFIP + ERA>>SIERA bump) plus market_trust deference for 0-IP
  debuts. test_rookie_prior PASS.
- **C10 adaptive sims**: wired (`adaptive=True`, blocks of 2000, CI-based stop) and
  observable — today's packages show n_sims_run=18000 (escalated past the 10k nominal).
  test_adaptive_sim ALL PASS.
- **C11 SGP correlation**: joint_corr matrix (matrix + outcomes) IS stored per game in
  pred_game_features; still ZERO consumers — SGP correlation pricing remains the open
  build. test_sgp_corr ALL PASS.
- **C12 live in-game repricing**: still scope-only; not started.

## Verification

py_compile clean on all touched files; tests: test_pitch_arsenal, test_catcher_defense,
test_rookie_prior PASS; test_adaptive_sim, test_sgp_corr ALL PASS; test_clv_report PASS
(prior phase). Live prod queries backed every claim above.

## Hetzner

Needs one `git pull` to reach `aca37129e0` (no service restarts; timers exec fresh).

## Open (ranked)

B3 totals skew (wait for 2 weeks graded, auto_gate owns demotion) -> C11 SGP pricing
consumer -> C12 live repricing scope -> retire-or-fill agg_defense.framing_runs.
