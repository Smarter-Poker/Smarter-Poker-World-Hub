-- =========================================================================
-- MIGRATION: 50-LEVEL CLUB CAPACITY SYSTEM - BASELINE DEFAULTS HOTFIX
-- =========================================================================
-- Purpose: In Pass 1 of the 7th Sweep Audit, it was discovered that while
-- `level`, `player_level`, and `hierarchy_level` received a DEFAULT 1 in the 
-- root schema, the threshold variables received no default at all. 
-- Thus, a newly created club gets NULL for `player_threshold_next`, creating 
-- catastrophic Math / Progress Bar glitches (NaN or false 100% completions) 
-- on the frontend UI for level 1 clubs until the RPC is manually run.
-- This migration forces strict mathematical baselines (Level 1 parameters) 
-- natively into the table schema.

-- 1. Apply Strict Level 1 Mathematical Thresholds to the Root Table 
ALTER TABLE public.clubs ALTER COLUMN player_threshold_current SET DEFAULT 0;
ALTER TABLE public.clubs ALTER COLUMN player_threshold_next SET DEFAULT 30;

ALTER TABLE public.clubs ALTER COLUMN hierarchy_threshold_current SET DEFAULT 0;
ALTER TABLE public.clubs ALTER COLUMN hierarchy_threshold_next SET DEFAULT 2;

-- 2. Retroactively fix any existing "NULL" state clubs created prior to this patch
UPDATE public.clubs 
SET 
    player_threshold_current = 0,
    player_threshold_next = 30,
    hierarchy_threshold_current = 0,
    hierarchy_threshold_next = 2
WHERE player_threshold_next IS NULL OR hierarchy_threshold_next IS NULL;
