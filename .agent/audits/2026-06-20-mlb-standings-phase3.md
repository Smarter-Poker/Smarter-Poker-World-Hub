# MLB Standings page — Phase 3: verification, quality, optimization (2026-06-20)

Follows Phase 1 (fixed broken wrong-DB wiring + grade scale) and Phase 2
(wild card view, expected record, clickable rows). Phase 3 is verification,
DB optimization, and accessibility/quality polish on a working page.

## Verification (ran first)
- Live API healthy: 30 teams, season 2026, all columns (gp/pyth/x_w/x_l/last_game_date).
- Deployed SHA 8eeca655 serving the Phase-2 page; "Wild Card" toggle present.
- Supabase advisors (security + performance) reviewed: every flagged item is
  pre-existing and on OTHER objects (sim_* SECURITY DEFINER views, pipeline_runs
  RLS, unused indexes on raw_* tables). `v_mlb_standings` is clean and already
  `security_invoker=on` (matches v_team_profile / v_hitter_profile / v_pitcher_profile).

## Optimization (DB)
- EXPLAIN before: 3 sequential scans of fact_games (EXTRACT(YEAR ...) blocked
  index use; WHERE final ~37% selectivity). Execution ~35.8ms, 99 buffer reads.
- Fix (migration `20260620160000_mlb_standings_perf_index.sql`, applied via MCP):
  1. Partial covering index `idx_fact_games_standings` on `official_date`
     INCLUDE (home/away_team_id, home/away_score, game_pk)
     WHERE final AND home_score IS NOT NULL AND away_score IS NOT NULL.
  2. Rewrote the view's date filter from `EXTRACT(YEAR ...)` to a half-open
     range `[yr_start, yr_end)` so the planner uses the index. Output columns
     byte-identical; security_invoker=on preserved explicitly.
- EXPLAIN after: **Index Only Scan** on the new index; execution **~18.7ms
  (~48% faster)**, 13 buffer reads. Verified identical results (30 teams,
  2256 team-games, LAD 49-27 grade 90 x53-23, etc.) and live API unchanged.
- Migration committed to the engine repo (`mlb-analytics-engine`).

## Quality / Accessibility (page)
- Clickable rows are now keyboard-accessible: `role="link"`, `tabIndex={0}`,
  Enter/Space activation (`handleRowKey`), descriptive `aria-label`, and a
  visible `focus-visible` ring. Applies to division, power, and wild-card rows.
- View toggle marked up as a `role="tablist"` with `aria-selected` + focus ring.
- Replaced the plain "Initiating sync" text with a shimmer `StandingsSkeleton`
  (aria-busy) for a smoother perceived load.
- Unified **playoff-position accent bars** across Division + Power views:
  cyan left bar = division leader, green = wild-card position (derived from the
  same wild-card computation). Legend updated to explain the bars. Wild Card
  cut-line divider marked `aria-hidden`.

## Verification (after)
- `npx tsc --noEmit`: exit 0, 0 errors (incl. the SEOHead `jsonLd` Dataset block).
- Grep: no `.single()`, no emoji, hooks all used.
- EXPLAIN + data parity confirmed (see Optimization).
- Post-deploy live re-check of API + page.

## Notes
- No new page deps. Power-score grade scale still sourced from src/lib/betScore.ts.
- Pre-existing advisor items (sim_* definer views, etc.) are out of scope for the
  standings task and were left for their owners.
