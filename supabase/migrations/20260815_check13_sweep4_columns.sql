-- CHECK 13 sweep 4 — additive columns for designed features that referenced
-- nonexistent columns (each site 42703'd silently; see .agent/audits).
--
-- profiles: five per-surface preference stores (matches the existing
-- hub_preferences / reels_preferences / messenger_preferences pattern) plus
-- the memory-games ELO rating read/written by src/games/ELOService.js.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS bankroll_preferences jsonb,
  ADD COLUMN IF NOT EXISTS diamond_arena_preferences jsonb,
  ADD COLUMN IF NOT EXISTS memory_games_preferences jsonb,
  ADD COLUMN IF NOT EXISTS news_preferences jsonb,
  ADD COLUMN IF NOT EXISTS video_library_preferences jsonb,
  ADD COLUMN IF NOT EXISTS memory_elo integer;

-- horse_source_assignments: the admin initializer and ClipDeduplicationService
-- distinguish poker vs sports sources; table carried no type column.
ALTER TABLE public.horse_source_assignments
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'poker';

-- player_notes: upsert identity for per-player notes sync
-- (0 duplicate (user_id,target_user_id) pairs verified before creating).
CREATE UNIQUE INDEX IF NOT EXISTS uq_player_notes_user_target
  ON public.player_notes (user_id, target_user_id);

-- training_scenarios: client filters by game_id and cached flag
-- (table is empty — 0 rows — so backfill is moot).
ALTER TABLE public.training_scenarios
  ADD COLUMN IF NOT EXISTS game_id text,
  ADD COLUMN IF NOT EXISTS cached boolean NOT NULL DEFAULT false;

-- sandbox study-replay: the writer stores the full analysis payload and the
-- spot's action history; the study deck reader replays them.
ALTER TABLE public.sandbox_sessions
  ADD COLUMN IF NOT EXISTS action_history jsonb;
ALTER TABLE public.sandbox_results
  ADD COLUMN IF NOT EXISTS full_analysis jsonb;

-- poker_venues: scraper source-priority guard (higher-priority source wins);
-- provenance-only, does not touch live-table data (live-cash-games policy).
ALTER TABLE public.poker_venues
  ADD COLUMN IF NOT EXISTS source_priority integer;
