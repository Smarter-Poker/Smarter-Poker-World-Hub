-- =====================================================================
-- Pass 42: Numeric range lockdown for commander_home_game_templates
--          and upper-bound CHECKs for buyin fields across games/groups
--
-- BUGS (6 verified — BF-1..BF-6):
--   commander_home_game_templates had ZERO CHECK constraints on its
--   numeric fields (buyin_min, buyin_max, max_players, min_players,
--   guest_limit). Host/admin could INSERT or UPDATE templates with:
--     BF-1 — negative buyin (-1000)                        → display nonsense
--     BF-2 — huge buyin (2,000,000,000)                    → int overflow risk in UI math
--     BF-3 — inverted range (buyin_min > buyin_max)        → contradictory stakes
--     BF-4 — huge max_players (2.1B)                       → overflow in capacity math
--     BF-5 — negative max_players                          → broken capacity logic
--     BF-6 — absurd guest_limit (99999)                    → bypasses game-level 0..10 cap
--                                                             when inherited via
--                                                             create_home_game_from_template
--                                                             (game-level CHECK catches
--                                                             this at game insert, but
--                                                             template is still persisted
--                                                             with broken data)
--
--   Additionally, commander_home_games has buyin_min/max >= 0 but NO
--   upper bound — a host can INSERT a game directly with buyin_max =
--   2 billion, passing all existing checks, and cause:
--     - UI overflow in prize-pool estimators (buyin_max * max_players)
--     - display nonsense ("$2,147,483,647 buyin")
--     - misleading recommendation scoring
--
-- FIX:
--   (1) Add CHECK constraints to commander_home_game_templates matching
--       the game-level bounds (>= 0, min <= max, max_players 1..100,
--       min_players 0..100, min <= max, guest_limit 0..10).
--   (2) Add upper-bound CHECKs on buyin fields across templates, games,
--       and groups: buyin_max <= 100,000,000 (100M cap — well above any
--       realistic home-game stake, well below int overflow risk).
--
--   No data migration needed: existing rows are all within bounds
--   (verified via COUNT scan: 0 violating rows across templates,
--   games, groups).
-- =====================================================================

-- (1) commander_home_game_templates CHECK constraints
ALTER TABLE public.commander_home_game_templates
  ADD CONSTRAINT chk_tmpl_buyin_min_nonneg
    CHECK (buyin_min IS NULL OR buyin_min >= 0) NOT VALID;
ALTER TABLE public.commander_home_game_templates
  VALIDATE CONSTRAINT chk_tmpl_buyin_min_nonneg;

ALTER TABLE public.commander_home_game_templates
  ADD CONSTRAINT chk_tmpl_buyin_max_nonneg
    CHECK (buyin_max IS NULL OR buyin_max >= 0) NOT VALID;
ALTER TABLE public.commander_home_game_templates
  VALIDATE CONSTRAINT chk_tmpl_buyin_max_nonneg;

ALTER TABLE public.commander_home_game_templates
  ADD CONSTRAINT chk_tmpl_buyin_ordered
    CHECK (buyin_min IS NULL OR buyin_max IS NULL OR buyin_min <= buyin_max) NOT VALID;
ALTER TABLE public.commander_home_game_templates
  VALIDATE CONSTRAINT chk_tmpl_buyin_ordered;

ALTER TABLE public.commander_home_game_templates
  ADD CONSTRAINT chk_tmpl_buyin_max_upper
    CHECK (buyin_max IS NULL OR buyin_max <= 100000000) NOT VALID;
ALTER TABLE public.commander_home_game_templates
  VALIDATE CONSTRAINT chk_tmpl_buyin_max_upper;

ALTER TABLE public.commander_home_game_templates
  ADD CONSTRAINT chk_tmpl_buyin_min_upper
    CHECK (buyin_min IS NULL OR buyin_min <= 100000000) NOT VALID;
ALTER TABLE public.commander_home_game_templates
  VALIDATE CONSTRAINT chk_tmpl_buyin_min_upper;

ALTER TABLE public.commander_home_game_templates
  ADD CONSTRAINT chk_tmpl_max_players_range
    CHECK (max_players IS NULL OR (max_players >= 1 AND max_players <= 100)) NOT VALID;
ALTER TABLE public.commander_home_game_templates
  VALIDATE CONSTRAINT chk_tmpl_max_players_range;

ALTER TABLE public.commander_home_game_templates
  ADD CONSTRAINT chk_tmpl_min_players_range
    CHECK (min_players IS NULL OR (min_players >= 0 AND min_players <= 100)) NOT VALID;
ALTER TABLE public.commander_home_game_templates
  VALIDATE CONSTRAINT chk_tmpl_min_players_range;

ALTER TABLE public.commander_home_game_templates
  ADD CONSTRAINT chk_tmpl_players_ordered
    CHECK (min_players IS NULL OR max_players IS NULL OR min_players <= max_players) NOT VALID;
ALTER TABLE public.commander_home_game_templates
  VALIDATE CONSTRAINT chk_tmpl_players_ordered;

ALTER TABLE public.commander_home_game_templates
  ADD CONSTRAINT chk_tmpl_guest_limit_range
    CHECK (guest_limit IS NULL OR (guest_limit >= 0 AND guest_limit <= 10)) NOT VALID;
ALTER TABLE public.commander_home_game_templates
  VALIDATE CONSTRAINT chk_tmpl_guest_limit_range;

-- (2) Upper-bound CHECK on buyin for games
ALTER TABLE public.commander_home_games
  ADD CONSTRAINT chk_game_buyin_max_upper
    CHECK (buyin_max IS NULL OR buyin_max <= 100000000) NOT VALID;
ALTER TABLE public.commander_home_games
  VALIDATE CONSTRAINT chk_game_buyin_max_upper;

ALTER TABLE public.commander_home_games
  ADD CONSTRAINT chk_game_buyin_min_upper
    CHECK (buyin_min IS NULL OR buyin_min <= 100000000) NOT VALID;
ALTER TABLE public.commander_home_games
  VALIDATE CONSTRAINT chk_game_buyin_min_upper;

-- (3) Upper-bound CHECK on typical_buyin for groups
ALTER TABLE public.commander_home_groups
  ADD CONSTRAINT chk_group_typical_buyin_max_upper
    CHECK (typical_buyin_max IS NULL OR typical_buyin_max <= 100000000) NOT VALID;
ALTER TABLE public.commander_home_groups
  VALIDATE CONSTRAINT chk_group_typical_buyin_max_upper;

ALTER TABLE public.commander_home_groups
  ADD CONSTRAINT chk_group_typical_buyin_min_upper
    CHECK (typical_buyin_min IS NULL OR typical_buyin_min <= 100000000) NOT VALID;
ALTER TABLE public.commander_home_groups
  VALIDATE CONSTRAINT chk_group_typical_buyin_min_upper;

-- (4) Upper-bound CHECK on game_tables buyin
ALTER TABLE public.commander_home_game_tables
  ADD CONSTRAINT chk_gtable_buyin_max_upper
    CHECK (buyin_max IS NULL OR buyin_max <= 100000000) NOT VALID;
ALTER TABLE public.commander_home_game_tables
  VALIDATE CONSTRAINT chk_gtable_buyin_max_upper;

ALTER TABLE public.commander_home_game_tables
  ADD CONSTRAINT chk_gtable_buyin_min_upper
    CHECK (buyin_min IS NULL OR buyin_min <= 100000000) NOT VALID;
ALTER TABLE public.commander_home_game_tables
  VALIDATE CONSTRAINT chk_gtable_buyin_min_upper;

COMMENT ON CONSTRAINT chk_tmpl_max_players_range
  ON public.commander_home_game_templates IS
  'Pass 42: Blocks template inserts with max_players outside 1..100. '
  'Matches commander_home_games.max_players CHECK.';

COMMENT ON CONSTRAINT chk_game_buyin_max_upper ON public.commander_home_games IS
  'Pass 42: Caps buyin_max at 100M to prevent int-overflow risk in UI math '
  '(prize-pool estimators, recommendation scoring). Well above any realistic '
  'home-game stake.';
