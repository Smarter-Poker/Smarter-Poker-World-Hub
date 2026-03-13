-- =========================================================================
-- MIGRATION: 50-LEVEL CLUB CAPACITY SYSTEM (POKERBROS-STYLE)
-- =========================================================================
-- Purpose: Implements the non-linear dynamic club leveling hierarchy.
-- Rules: 
-- 1. player_level: ROUND(30 * 1.125^(L-1))
-- 2. hierarchy_units: (admins * 1) + (super_agents * 1) + (agents/sub_agents * 0.25)
-- 3. hierarchy_level: ROUND(2 * 1.086^(L-1))
-- 4. final_level: MAX(player_level, hierarchy_level, 1)

-- 1. SCHEMA EXPANSION 
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS player_level INTEGER DEFAULT 1;
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS hierarchy_level INTEGER DEFAULT 1;
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS level INTEGER DEFAULT 1;

ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS player_threshold_current INTEGER;
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS player_threshold_next INTEGER;

ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS hierarchy_units NUMERIC(10,2) DEFAULT 0;
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS hierarchy_units_rounded_up INTEGER DEFAULT 0;
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS hierarchy_threshold_current INTEGER;
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS hierarchy_threshold_next INTEGER;

-- 2. CALCULATION RPC
CREATE OR REPLACE FUNCTION public.recompute_club_levels(p_club_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_total_players INTEGER := 0;
    v_admin_count INTEGER := 0;
    v_super_agent_count INTEGER := 0;
    v_agent_count INTEGER := 0;
    
    v_hierarchy_units NUMERIC;
    v_hierarchy_rounded INTEGER;
    
    v_player_level INTEGER := 1;
    v_hierarchy_level INTEGER := 1;
    v_final_level INTEGER := 1;
    
    v_pt_curr INTEGER;
    v_pt_next INTEGER;
    v_ht_curr INTEGER;
    v_ht_next INTEGER;
    
    L INTEGER;
BEGIN
    -- 1. Gather live member statistics
    SELECT COUNT(*) INTO v_total_players 
    FROM public.club_members 
    WHERE club_id = p_club_id;
    
    SELECT COUNT(*) INTO v_admin_count 
    FROM public.club_members 
    WHERE club_id = p_club_id AND role IN ('admin', 'manager');
    
    SELECT COUNT(*) INTO v_super_agent_count 
    FROM public.club_members 
    WHERE club_id = p_club_id AND role = 'super_agent';
    
    SELECT COUNT(*) INTO v_agent_count 
    FROM public.club_members 
    WHERE club_id = p_club_id AND role IN ('agent', 'sub_agent');
    
    -- 2. Compute Hierarchy Units
    v_hierarchy_units := (v_admin_count * 1.00) + (v_super_agent_count * 1.00) + (v_agent_count * 0.25);
    v_hierarchy_rounded := CEIL(v_hierarchy_units);
    
    -- 3. Determine Player Level (Max 50)
    -- Formula: ROUND(30 * 1.125^(L-1))
    v_player_level := 1;
    FOR L IN REVERSE 50..1 LOOP
        IF v_total_players >= ROUND(30 * POWER(1.125, L - 1)) THEN
            v_player_level := L;
            EXIT;
        END IF;
    END LOOP;
    
    -- 4. Determine Hierarchy Level (Max 50)
    -- Formula: ROUND(2 * 1.086^(L-1))
    v_hierarchy_level := 1;
    FOR L IN REVERSE 50..1 LOOP
        IF v_hierarchy_rounded >= ROUND(2 * POWER(1.086, L - 1)) THEN
            v_hierarchy_level := L;
            EXIT;
        END IF;
    END LOOP;
    
    -- 5. Calculate Final Target Level
    v_final_level := GREATEST(v_player_level, v_hierarchy_level, 1);
    
    -- 6. Compute boundary thresholds for the computed levels
    v_pt_curr := ROUND(30 * POWER(1.125, v_player_level - 1));
    v_pt_next := ROUND(30 * POWER(1.125, LEAST(v_player_level + 1, 50) - 1));
    
    v_ht_curr := ROUND(2 * POWER(1.086, v_hierarchy_level - 1));
    v_ht_next := ROUND(2 * POWER(1.086, LEAST(v_hierarchy_level + 1, 50) - 1));
    
    -- 7. Persist to DB
    UPDATE public.clubs SET
        player_level = v_player_level,
        hierarchy_level = v_hierarchy_level,
        level = v_final_level,
        player_threshold_current = v_pt_curr,
        player_threshold_next = v_pt_next,
        hierarchy_units = v_hierarchy_units,
        hierarchy_units_rounded_up = v_hierarchy_rounded,
        hierarchy_threshold_current = v_ht_curr,
        hierarchy_threshold_next = v_ht_next,
        updated_at = NOW()
    WHERE id = p_club_id;
    
    -- 8. Return resulting matrix
    RETURN jsonb_build_object(
        'success', true,
        'club_id', p_club_id,
        'computed_level', v_final_level,
        'player_level', v_player_level,
        'hierarchy_level', v_hierarchy_level,
        'total_players', v_total_players,
        'hierarchy_units', v_hierarchy_units
    );
END;
$$;
