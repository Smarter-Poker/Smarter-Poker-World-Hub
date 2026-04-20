-- =====================================================================
-- Pass 35b revert: existing trg_enforce_home_game_delete (installed in
-- an earlier pass) already enforces active-state guard with stricter
-- behaviour (blocks 'draft' with deps too). My duplicate trigger is
-- redundant. Drop it to keep the schema clean.
--
-- The original trigger body remains unchanged and retains:
--   - GUC bypass (app.hg_skip_active_game_delete_check='1')
--   - Terminal-status allowance (cancelled/completed/ended)
--   - Counts RSVPs + non-released reservations (via table_id join) +
--     non-empty seats
-- ========================================================================
DROP TRIGGER IF EXISTS trg_enforce_home_games_delete ON public.commander_home_games;
DROP FUNCTION IF EXISTS public.fn_enforce_home_games_delete();