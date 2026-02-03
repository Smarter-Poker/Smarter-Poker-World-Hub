-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Purge Corrupted Training Question Data
-- Date: 2026-02-03
-- Purpose: Delete all mis-tagged cached questions and placeholder PIO data
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Delete ALL cached questions (all 1,010 are corrupted/mis-tagged)
DELETE FROM training_question_cache;

-- 2. Delete placeholder/fake data from solved_spots_gold
-- Keep only real PIO solver exports (if any exist with proper format)
DELETE FROM solved_spots_gold 
WHERE scenario_hash IS NULL 
   OR scenario_hash = ''
   OR game_type IS NULL;

-- 3. Log the cleanup
DO $$
BEGIN
    RAISE NOTICE 'Training data cleanup complete at %', NOW();
END $$;
