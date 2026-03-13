-- =========================================================================
-- MIGRATION: 50-LEVEL CLUB CAPACITY SYSTEM - COLUMN PROTECTION TRIGGER
-- =========================================================================
-- Purpose: In Pass 3 (Adversarial Threat Model) of the 10th Sweep, I discovered
-- that the RLS policy `clubs_update_owner` allows BOTH owners AND admins to 
-- directly UPDATE the `clubs` table. A malicious admin could bypass the server-side
-- calculation engine by running:
--   supabase.from('clubs').update({ level: 50 }).eq('id', clubId)
-- 
-- CRITICAL FIX (Sweep 11): The original version checked `request.jwt.claims`
-- which is a SESSION-LEVEL GUC that persists across SECURITY DEFINER boundaries.
-- This caused the protection trigger to SILENTLY REVERT every legitimate level  
-- calculation performed by the autonomous trigger (Migration 007).
-- 
-- The correct approach uses `current_user` which reflects the SECURITY DEFINER
-- function owner ('postgres') when called from the RPC trigger chain, vs.
-- the PostgREST user role when called from a direct client UPDATE.

CREATE OR REPLACE FUNCTION public.trg_protect_club_level_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Allow writes from privileged system roles (postgres, service_role)
    -- These are used by SECURITY DEFINER RPCs and the autonomous trigger chain.
    -- Block writes from regular users (authenticated, anon) who attempt
    -- direct UPDATE on the clubs table.
    IF current_user NOT IN ('postgres', 'supabase_admin', 'service_role') THEN
        -- Revert ALL protected level columns to their previous (OLD) values
        NEW.level := OLD.level;
        NEW.player_level := OLD.player_level;
        NEW.hierarchy_level := OLD.hierarchy_level;
        NEW.hierarchy_units := OLD.hierarchy_units;
        NEW.hierarchy_units_rounded_up := OLD.hierarchy_units_rounded_up;
        NEW.player_threshold_current := OLD.player_threshold_current;
        NEW.player_threshold_next := OLD.player_threshold_next;
        NEW.hierarchy_threshold_current := OLD.hierarchy_threshold_current;
        NEW.hierarchy_threshold_next := OLD.hierarchy_threshold_next;
    END IF;

    RETURN NEW;
END;
$$;

-- Bind BEFORE UPDATE to intercept and revert before the write hits disk
DROP TRIGGER IF EXISTS trg_clubs_protect_level_columns ON public.clubs;
CREATE TRIGGER trg_clubs_protect_level_columns
BEFORE UPDATE ON public.clubs
FOR EACH ROW
EXECUTE FUNCTION public.trg_protect_club_level_columns();

