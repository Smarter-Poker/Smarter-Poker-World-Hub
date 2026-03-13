-- =========================================================================
-- MIGRATION: 50-LEVEL CLUB CAPACITY SYSTEM - AUTONOMOUS TRIGGER
-- =========================================================================
-- Purpose: In Pass 2 of the 8th Sweep, I discovered that the system relied 
-- on manual API calls (Dashboard Button Clicks) to calculate newly acquired 
-- members or lost members. 
-- This migration hard-wires the Postgres Engine to universally trigger 
-- `recompute_club_levels` on any `club_members` transaction, guaranteeing 
-- 100% autonomous, true real-time Capacity updates.

-- 1. Create the Trigger Function
CREATE OR REPLACE FUNCTION public.trg_auto_recompute_club_level()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_club_id UUID;
BEGIN
    -- Determine the target club ID based on the event type
    IF TG_OP = 'DELETE' THEN
        v_club_id := OLD.club_id;
    ELSE
        v_club_id := NEW.club_id;
    END IF;

    -- Fire the RPC silently in the background
    -- (We ignore the JSONB return value as this is a background trigger)
    PERFORM public.recompute_club_levels(v_club_id);

    -- Return the appropriate record for the trigger pipeline
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$;

-- 2. Bind the Trigger to the club_members table
DROP TRIGGER IF EXISTS trg_club_members_level_sync ON public.club_members;
CREATE TRIGGER trg_club_members_level_sync
AFTER INSERT OR UPDATE OF role, status OR DELETE
ON public.club_members
FOR EACH ROW
EXECUTE FUNCTION public.trg_auto_recompute_club_level();
