-- ============================================================================
-- PRIVATE CLUB GAMES INSIDE UNIONS (2026-08-19) — APPLIED to production via
-- Supabase MCP as migration: union_private_club_games
--
-- Rule: a club in a union does not create union-visible games (only union
-- admins do, enforced by fn_can_create_games). But a club MAY still run
-- PRIVATE games/tournaments inside its own club (is_private = true, never
-- union-visible; the ownership triggers null union_id on private rows).
-- This migration opens exactly that path:
--   1. tables INSERT RLS: club owner/admin may insert when is_private = true.
--   2. fn_create_tournament: accepts isPrivate; club owner/admin may create a
--      private tournament; private rows never carry union_id.
-- ============================================================================

-- 1. tables INSERT policy --------------------------------------------------
DROP POLICY IF EXISTS tables_insert_owner_or_admin ON tables;
CREATE POLICY tables_insert_owner_or_admin ON tables
  FOR INSERT TO authenticated
  WITH CHECK (
    fn_can_create_games(club_id, (SELECT auth.uid()))
    OR (COALESCE(is_private, false) AND is_club_admin(club_id, (SELECT auth.uid())))
  );

-- 2. fn_create_tournament: isPrivate support --------------------------------
-- Full function body as applied (identical to prior version except:
--   v_is_private := COALESCE((p_config->>'isPrivate')::boolean, false);
--   auth: private -> is_club_admin(p_club_id, v_uid) OR fn_can_create_games;
--         non-private -> fn_can_create_games (unchanged);
--   insert adds is_private and nulls union_id on private rows).
-- The exact applied body lives in the Supabase migration history
-- (`union_private_club_games`, list_migrations) and in the live function
-- (pg_get_functiondef('public.fn_create_tournament'::regproc)).
