-- CHECK 13 sweep-2 additive columns. Applied to production 2026-08-15 via
-- Supabase MCP apply_migration (this file is the auditable mirror).
--
-- 1. profiles.club_arena_tos_accepted_at — accept-tos.js always 500'd; TOS
--    acceptance was never recorded.
-- 2. table_templates.use_count — template list ordering + usage tracking dead.
-- 3. god_mode_hand_history analytics columns — the designed insert payload;
--    the whole insert 42703'd (0 rows ever).
-- 4. rakeback_periods.user_id DROP NOT NULL — the API's master-period marker
--    row has no user; 2,336 engine rows unaffected (relaxation only).
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS club_arena_tos_accepted_at timestamptz;
ALTER TABLE public.table_templates ADD COLUMN IF NOT EXISTS use_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.god_mode_hand_history
  ADD COLUMN IF NOT EXISTS user_sizing text,
  ADD COLUMN IF NOT EXISTS gto_frequency numeric,
  ADD COLUMN IF NOT EXISTS ev_of_user_action numeric,
  ADD COLUMN IF NOT EXISTS ev_of_gto_action numeric,
  ADD COLUMN IF NOT EXISTS is_indifferent boolean DEFAULT false;
ALTER TABLE public.rakeback_periods ALTER COLUMN user_id DROP NOT NULL;
-- ROLLBACK: drop the added columns; ALTER rakeback_periods.user_id SET NOT NULL (only if no NULL rows).
