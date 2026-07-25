# MLB Engine — Health verification + A/B-tier open-list work (2026-07-05, evening session)

Continuation of the MLB-ANALYTICS handoff. Everything below verified against production
(engine DB `nscdmxldtyszyvcxxwgr`, live card, GitHub HEADs) before being claimed.

## Step 1 health verification — results

| Check | Result |
|---|---|
| No prohibited BETs in DB | PASS — today's `pred_market_output` BET recs exist only in h2h / run_line / total |
| Card gate integrity | PASS — all card rows `gate_status:'bet'`; the `hits` prop on the card is a LEGITIMATE clv-provisional promotion (see below), not a leak |
| gate_config freshness | PASS — generated_at 2026-07-05T12:16Z, `basis`/`kelly_scale` populated (h2h/run_line/total = profit basis, full Kelly) |
| clv_weekly landing | PASS — rows upserted today 20:17Z by nightly clv_report |
| price_ts populating | PASS — line + prop rows stamped (engine commit e257b4e) |
| Ingest duration | ~12 min (WAF breaker holding; one 03:49 abort on fetch_lineups guard, retried clean at 04:07) |
| Nightly `[daily] DONE` | NOT VERIFIABLE from sandbox (no SSH) — full 20:16–20:17 stage chain success in `pipeline_runs` is the proxy; journal check delegated to handoff |

## Errors found in today's pipeline_runs and their disposition

- `enrich.weather NameError 'gid'` (10:44) — FIXED: `weather.py:78` referenced undefined
  `gid` in the per-game except, so any weather hiccup crashed the whole stage.
- `enrich.profile None<=int` (04:56, 06:24) — already fixed by commit 825e01e at 08:22; no
  recurrence since. No action.
- `evaluate/compute/ingest HTTP 406` storms (through 05:35) — statsapi WAF; addressed by
  the WAF circuit breaker (2caa304) + retry widening (1ba1488) earlier today; no 406 errors
  after those landed. Monitor only.
- `reprice` 20:33 status=error, EMPTY error_msg — FIXED the telemetry: `run_intraday.py`
  now records which sub-step failed in `pipeline_runs.error_msg`. Root cause of the 20:33
  failure itself is delegated to the Hetzner handoff (needs journal).
- `predict` 12:16 httpx "URL missing protocol" — one-off; suspect env not loaded in the
  noon unit. Delegated to Hetzner handoff.

## Open-list work completed

**A1 (quote age):** `/api/mlb/best-bets` now attaches `price_ts`, `quote_age_min`,
`quote_stale` (>15 min) to every bet row via `attachQuoteMeta` (both RPC and fallback
paths); best-bets page renders "Quote age: N min" under Best Odds with an amber stale
warning.

**A2 (gate provenance):** created + applied migration `model_meta` table in the engine DB
(auto_gate's existing best-effort mirror now lands; seeded with today's gate_config so the
card badges immediately). API attaches `gate_basis` / `gate_kelly_scale`; page shows a
"PROVISIONAL · 0.5x KELLY" badge on clv-provisional markets.

**B4 (CLV digest):** `clv_report.py` now persists per-book weekly CLV to `clv_weekly`
under `book:<name>` keys (ran once live: 43 rows, e.g. book:betrivers +2.16 pts / 66.7%
beat-close vs book:draftkings -0.28). `/api/mlb/validation` + validation page now show
weekly CLV by market and by book. `/model-intel` already had CLV (KPIs + trend) — no change.

**B5 (props self-promotion + granularity):** VERIFIED, no code needed. `hits` self-promoted
to clv-provisional (n=449, min_edge 4.0, half-Kelly); all other props correctly suppressed.
Prob granularity healthy: e.g. hits 160 unique probs across 174 rows today; no 0.5677
plateau anywhere.

**D15 (scratch cleanup):** deleted SWARM-BRIEF.md (untracked, self-labeled safe to delete)
and `engine/pipeline/.dp_decoded_tmp.py` (tracked — removed on GitHub too). `sgp_cache/`
contains only live game-pk cache entries; no test artifact remains.

## Commits

- Engine `Smarter-Poker/mlb-analytics-engine@4073374aa5` (+ scratch deletion commit)
- Web `Smarter-Poker/Smarter-Poker-World-Hub@ae4cff03f8` (+ this audit / handoff commit)
- Migration `model_meta_gate_config_mirror` applied via Supabase MCP; verified via
  `list_migrations` availability of table + seeded row.

## Deferred / next

- Hetzner `git pull` + journal verification: `.agent/handoffs/2026-07-05-mlb-engine-hetzner-sync.md`
- B3 totals over-skew: leave alone per handoff — recheck calibrator after >=2 weeks graded
- B6 price-edge vs model-edge decomposition; C7-12 data completeness builds; D13 live-ingest
  team_total writer root-cause — all still open, ranked in the handoff doc.
