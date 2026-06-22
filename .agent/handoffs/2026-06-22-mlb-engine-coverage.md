# Handoff: MLB engine data-coverage expansion (Players page)

**For:** an agent running in the MLB engine pipeline repo (the Python job that writes
`agg_batter` / `agg_pitcher` / `pred_props` on engine DB `nscdmxldtyszyvcxxwgr`).
**Why a handoff:** these are data-generation gaps in the engine pipeline, not in the
World-Hub web repo. The web side already reads this data correctly — it just isn't
generated for most players yet. Nothing in `Smarter-Poker-World-Hub` can fix it.

## Context (verified 2026-06-22 against the live engine DB)

The Players detail page renders these sections conditionally and they work when data
exists, but coverage is low:

1. **Situational splits + pitch-type/velocity tendencies (hitters).**
   `agg_batter` window `situational` and `historical_trends` exist for only **562 of 1,959**
   batters (29%). The web reads keys: situational = high_leverage_woba, runners_on_woba,
   bases_empty_woba, low_leverage_woba, grass_woba, turf_woba, month_woba_avg, dow_woba_avg,
   extra_innings_woba; tendencies = velo_under90_woba, velo_90_95_woba, velo_95plus_woba,
   fb_heavy_woba, offspeed_heavy_woba, best_park_woba, worst_park_woba.
   **Ask:** extend the producer so every qualified hitter (PA >= ~150) gets these windows.
   Note some values come through as 0 for tiny samples — prefer null over 0 so the web
   (which hides null/0 tiles) doesn't show misleading ".000" splits.

2. **Streaks (hitters).** ~182 of 1,955 batters (9%) have no `streaks` blob in the
   `profile` window (e.g. player 663538). The web handles null gracefully; backfilling
   would make Recent Form appear for them.

3. **Props freshness.** `pred_props` latest `as_of_ts` was `2026-06-22 00:00Z`
   (= 2026-06-21 America/Chicago) while the calendar day was 2026-06-22 — i.e. the daily
   props slate can be a day behind. Confirm the props job fires early enough each day; the
   detail RPC joins props on `as_of_ts = max(as_of_ts)`, so a late job shows yesterday.

4. **Pitcher tendencies (optional).** Pitchers have no situational/tendencies section
   because `agg_pitcher` window `pitching_custom` only stores `{ERA}` (no pitch-mix /
   wOBA-against). If you want a pitcher tendencies section on the web, the engine would
   need to produce a richer pitcher split window first.

## What's already done on the web/DB side (do NOT redo)
- get_mlb_player_detail returns situational/tendencies/health/props/matchup; league
  averages cached (8.5s->11ms); directory RPCs lateral-distinct (hitter 2.2s->0.9s);
  partial indexes idx_agg_{batter,pitcher}_fgseason_latest added.

No web changes are needed when coverage improves — the sections light up automatically.
