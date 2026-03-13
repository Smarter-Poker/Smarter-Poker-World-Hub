-- =========================================================================
-- MIGRATION: 50-LEVEL CLUB CAPACITY SYSTEM - COLUMN PROTECTION TRIGGER
-- =========================================================================
-- Purpose: In Pass 3 (Adversarial Threat Model) of the 10th Sweep, I discovered
-- that the RLS policy `clubs_update_owner` allows BOTH owners AND admins to 
-- directly UPDATE the `clubs` table. A malicious admin could bypass the server-side
-- calculation engine by running:
--   supabase.from('clubs').update({ level: 50 }).eq('id', clubId)
-- 
-- This trigger SILENTLY REVERTS any direct writes to the protected level columns,
-- ensuring they can ONLY be modified by the `recompute_club_levels` RPC 
-- (via the SECURITY DEFINER autonomous trigger).

CREATE OR REPLACE FUNCTION public.trg_protect_club_level_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- If any protected level column is being changed AND the caller is NOT
    -- the autonomous recompute trigger (which runs as postgres/service_role),
    -- silently revert the level columns to their previous values.
    -- The recompute trigger calls recompute_club_levels() which is SECURITY DEFINER
    -- and runs as 'postgres' role. Normal user updates come through as 'authenticated'.
    
    IF current_setting('request.jwt.claims', true) IS NOT NULL 
       AND (current_setting('request.jwt.claims', true)::jsonb->>'role') = 'authenticated' THEN
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
