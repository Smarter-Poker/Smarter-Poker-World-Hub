-- ═══════════════════════════════════════════════════════════════
-- FIX: Add 'bookmark' to social_interactions interaction_type CHECK constraint
-- 
-- PROBLEM: The CHECK constraint only allows ('like', 'share').
--          The bookmark/save feature inserts interaction_type='bookmark'
--          which is silently rejected — making the Save button non-functional.
--
-- SOLUTION: Drop and recreate the CHECK constraint to include 'bookmark'.
-- ═══════════════════════════════════════════════════════════════

-- Step 1: Drop the existing CHECK constraint
ALTER TABLE social_interactions DROP CONSTRAINT IF EXISTS social_interactions_interaction_type_check;

-- Step 2: Recreate with 'bookmark' added
ALTER TABLE social_interactions ADD CONSTRAINT social_interactions_interaction_type_check 
  CHECK (interaction_type IN ('like', 'share', 'bookmark'));

-- Step 3: Add a unique constraint for bookmarks to prevent duplicates
-- (delete-then-insert pattern works, but a unique constraint is safer)
-- Only add if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'social_interactions_unique_bookmark'
  ) THEN
    ALTER TABLE social_interactions 
      ADD CONSTRAINT social_interactions_unique_bookmark 
      UNIQUE (post_id, user_id, interaction_type);
  END IF;
END $$;
