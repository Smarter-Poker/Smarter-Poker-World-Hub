# Smarter.Poker MLB Prediction Engine

Python 3.10+ prediction model layer for the MLB Analytics hub.  
Pure stdlib (except `supabase-py` for live DB mode). No external ML dependencies.

---

## Directory layout

```
engine/
├── model/
│   ├── team_strength.py    # Baseline home-win prior (log5 + Pythagorean)
│   └── situational_v2.py   # Situational adjustment layer (treatment arm)
├── common/
│   └── db.py               # Supabase client factory + fetch_all helper
├── tests/
│   └── situational_ab.py   # Ship-gate A/B harness (run before merging Phase 1)
└── README.md               # This file
```

---

## Quick start

```bash
# Selftest (no DB needed — runs synthetic A/B in ~0.1s)
python3 engine/tests/situational_ab.py --selftest

# Replay graded slates (JSON files from the pipeline)
python3 engine/tests/situational_ab.py --slates "exports/slate_*.json"

# Live DB A/B (requires SUPABASE_MLB_URL + SUPABASE_MLB_SERVICE_KEY in .env.local)
python3 engine/tests/situational_ab.py --db --start 2025-04-01 --end 2025-06-19
```

---

## Model architecture

### `team_strength.team_prior` (baseline / control)

Converts season-level team metrics into a home-win probability using:

1. **log5 matchup** (Bill James) — isolates each team's true strength
2. **Pythagorean win%** (Smyth/Patriot `exp=1.83`) blended with raw win%
3. **Flat HFA** +3.5% (MLB historical long-run baseline)
4. Clamped to `[0.10, 0.90]` — never degenerate

Metric inputs (from `agg_situational` / `fact_games`):

| Key | Description |
|-----|-------------|
| `win_pct` | Season win% |
| `pythag_pct` | Pre-computed Pythagorean win% |
| `ops_plus` | Weighted OPS+ (100 = league avg) |
| `fip` | Fielding-independent pitching |
| `era_plus` | ERA+ (100 = avg, 120+ = elite) |
| `bullpen_era` | Bullpen ERA |

### `situational_v2.team_prior_v2` (treatment / v2)

Wraps `team_prior` and adds **gated situational signals** in log-odds space:

| Signal | Key | Gate | Weight |
|--------|-----|------|--------|
| vs Losing/Winning record | `vs_losing_teams`, `vs_winning_teams` | ≥40 games | 0.65 |
| Recent form (rolling N) | `recent_form` | ≥10 games | 0.45 |
| Rest-day advantage | `days_rest` (ctx) | always | 0.30 |
| Park factor | `park_factor` (ctx) | always | 0.20 |
| Ump K-rate | `ump_k_rate` (ctx) | always | 0.15 |

Total log-odds adjustment is capped at `±0.30` (~±7.5% prob) to prevent runaway predictions.

---

## Ship-gate protocol (situational_ab.py)

Before enabling `situational_v2` in production:

1. Run `--selftest` → must `PASS (0 failures)`
2. Run `--slates` on your most recent 30-day export → `brier_delta < 0`
3. Run `--db` over `2025-04-01..today` → `brier_delta < 0` AND `v2_roi ≥ base_roi`
4. Run the full `run_backtest.py --diff` (end-to-end gate) → no regressions on any market

Only then set `SITUATIONAL_V2_ENABLED=true` in Vercel env and merge.

---

## Adding a new signal

1. Add an extractor function `_my_signal_adj(home_m, away_m, ctx, cfg) -> float`  
   in `situational_v2.py`.
2. Add its config key + default weight to `DEFAULT_CFG`.
3. Add it to the accumulation block in `team_prior_v2()`.
4. Update `selftest()` in `situational_ab.py` with a synthetic test that detects it.
5. Pass the `--selftest` gate before committing.
