-- ═══════════════════════════════════════════════════════════════
-- FIX: Add 'report' to social_interactions interaction_type CHECK constraint
-- 
-- PROBLEM: The report button inserts interaction_type='report' but the 
--          CHECK constraint only allows ('like', 'share', 'bookmark').
--          This causes silent insertion failures.
--
-- SOLUTION: Drop and recreate CHECK to include 'report'.
-- ═══════════════════════════════════════════════════════════════

-- Step 1: Drop the existing CHECK constraint
ALTER TABLE social_interactions DROP CONSTRAINT IF EXISTS social_interactions_interaction_type_check;

-- Step 2: Recreate with 'report' added
ALTER TABLE social_interactions ADD CONSTRAINT social_interactions_interaction_type_check 
  CHECK (interaction_type IN ('like', 'share', 'bookmark', 'report'));
