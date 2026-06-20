# MLB Standings page — Phase 2 upgrade (2026-06-20)

Follows `.agent/audits/2026-06-20-mlb-standings-audit.md` (Phase 1 fixed the broken
wrong-DB wiring and added the live view + grade scale). Phase 2 is pure
enhancement on top of a working page.

## What shipped

### Database (mlb-analytics-engine `nscdmxldtyszyvcxxwgr`)
- Extended `public.v_mlb_standings` with four appended columns (CREATE OR
  REPLACE-safe — original 20 columns unchanged, in order):
  - `gp`  = games played (w + l)
  - `pyth` = Pythagorean win expectation RS^1.83/(RS^1.83+RA^1.83), 3dp
  - `x_w` = expected wins = round(pyth * gp)
  - `x_l` = expected losses = gp - x_w  (x_w + x_l = gp exactly)
- Applied via MCP (`mlb_standings_expected_record`). Migration file:
  `mlb-analytics-engine/supabase/migrations/20260620140000_mlb_standings_expected_record.sql`.
- Validated: e.g. LAD x53-23 (luck -4), TB x37-35 (luck +5). gp = x_w + x_l for all 30.

### API (`pages/api/mlb/standings.ts`)
- Now returns `last_game_date` (latest final game date) so the page can show
  an honest "Through <date>" label instead of request time.

### Page (`pages/hub/MLB-ANALYTICS/standings.tsx`)
- New **Wild Card** view (3rd toggle): per league, 3 division leaders (auto-berth,
  DIV1-3) then the wild-card race (WC1-3) with a visual playoff cut line and a
  GB/+ column (games ahead of the cut for in-teams, games behind for the rest).
  Computed client-side from team records.
- **Clickable rows** in every view -> `/hub/MLB-ANALYTICS/teams/[team_id]`.
- **EXP column** (Pythagorean expected W-L) with a luck tooltip (actual vs
  expected), shown on xl screens in the table views.
- **"Through <date>"** in the subtitle from `last_game_date`.
- SEO title/description updated for 2026 + wild card.

## Verification
- `npx tsc --noEmit`: exit 0, 0 errors.
- Grep: no `.single()`, no emoji, hooks all used, no raw supabase import in API.
- View output validated in SQL before/after apply.
- Post-deploy: `/api/mlb/standings` returns gp/pyth/x_w/x_l; page renders the
  three views; rows navigate to team pages.

## Notes
- Wild-card math is league-standard: division leaders removed, remaining teams
  ranked by pct; top 3 are wild cards; GB computed via ((w1-w2)+(l2-l1))/2.
- Power-score grade scale unchanged — still sourced from `src/lib/betScore.ts`.
