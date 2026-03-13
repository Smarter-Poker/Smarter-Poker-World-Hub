-- =========================================================================
-- MIGRATION: 50-LEVEL CLUB CAPACITY SYSTEM - SYSTEM CRON BYPASS & OWNER FAILSAFE
-- =========================================================================
-- Purpose: The previous Auth Guard successfully blocked DoS compute exhaustion 
-- on the Database from malicious clients, but inadvertently locked out the 
-- system's `service_role` and Admin Cron Jobs (since their auth.uid() is NULL).
-- This migration fixes the Adversarial Guard to explicitly allow system-level 
-- bypasses, and adds a failsafe for Club Founders whose membership records detach.

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
    -- 0. ADVERSARIAL THREAT GUARD & SYSTEM BYPASS
    -- Prevent compute exhaustion DoS by blocking unauthorized clients, 
    -- while explicitly allowing internal system operations (`service_role` or native PG).
    IF current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role' OR current_role IN ('postgres', 'service_role') THEN
        -- System Bypass: Allow execution
    ELSIF NOT EXISTS (
        SELECT 1 FROM public.club_members 
        WHERE club_id = p_club_id 
          AND user_id = auth.uid() 
          AND role IN ('owner', 'admin', 'manager')
    ) AND NOT EXISTS (
        SELECT 1 FROM public.clubs 
        WHERE id = p_club_id AND owner_id = auth.uid()
    ) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Unauthorized: Only club owners and admins can trigger level recalculation.'
        );
    END IF;

    -- 1. Gather live member statistics (EXCLUDING banned/suspended)
    SELECT COUNT(*) INTO v_total_players 
    FROM public.club_members 
    WHERE club_id = p_club_id AND status NOT IN ('banned', 'suspended');
    
    SELECT COUNT(*) INTO v_admin_count 
    FROM public.club_members 
    WHERE club_id = p_club_id AND role IN ('admin', 'manager') AND status NOT IN ('banned', 'suspended');
    
    SELECT COUNT(*) INTO v_super_agent_count 
    FROM public.club_members 
    WHERE club_id = p_club_id AND role = 'super_agent' AND status NOT IN ('banned', 'suspended');
    
    SELECT COUNT(*) INTO v_agent_count 
    FROM public.club_members 
    WHERE club_id = p_club_id AND role IN ('agent', 'sub_agent') AND status NOT IN ('banned', 'suspended');
    
    -- 2. Compute Hierarchy Units
    v_hierarchy_units := (v_admin_count * 1.00) + (v_super_agent_count * 1.00) + (v_agent_count * 0.25);
    v_hierarchy_rounded := CEIL(v_hierarchy_units);
    
    -- 3. Determine Player Level (Max 50)
    -- Formula: ROUND(30 * 1.125^(L-1))
    v_player_level := 1;
    FOR L IN REVERSE 1..50 LOOP
        IF v_total_players >= ROUND(30 * POWER(1.125, L - 1)) THEN
            v_player_level := L;
            EXIT;
        END IF;
    END LOOP;
    
    -- 4. Determine Hierarchy Level (Max 50)
    -- Formula: ROUND(2 * 1.086^(L-1))
    v_hierarchy_level := 1;
    FOR L IN REVERSE 1..50 LOOP
        IF v_hierarchy_rounded >= ROUND(2 * POWER(1.086, L - 1)) THEN
            v_hierarchy_level := L;
            EXIT;
        END IF;
    END LOOP;
    
    -- 5. Calculate Final Target Level
    v_final_level := GREATEST(v_player_level, v_hierarchy_level, 1);
    
    -- 6. Compute boundary thresholds for the computed levels
    IF v_player_level = 1 THEN
        v_pt_curr := 0;
    ELSE
        v_pt_curr := ROUND(30 * POWER(1.125, v_player_level - 1));
    END IF;
    v_pt_next := ROUND(30 * POWER(1.125, LEAST(v_player_level + 1, 50) - 1));
    
    IF v_hierarchy_level = 1 THEN
        v_ht_curr := 0;
    ELSE
        v_ht_curr := ROUND(2 * POWER(1.086, v_hierarchy_level - 1));
    END IF;
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
