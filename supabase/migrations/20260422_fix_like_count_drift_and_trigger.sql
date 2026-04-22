-- ============================================================
-- Migration: Add like_count auto-sync trigger + fix drift
-- ============================================================
-- PROBLEM: social_posts.like_count was not being updated atomically
-- when social_likes rows were inserted/deleted. This caused 2737 posts
-- (361 in past 7 days) to show incorrect like counts.
--
-- FIX 1: Recalculate all drifted like_counts from the source of truth
-- FIX 2: Add DB trigger to keep like_count in sync going forward

-- Step 1: Fix all drifted like_counts
UPDATE social_posts sp
SET like_count = (
    SELECT COUNT(*) FROM social_likes sl WHERE sl.post_id = sp.id
)
WHERE sp.like_count != (
    SELECT COUNT(*) FROM social_likes sl WHERE sl.post_id = sp.id
);

-- Step 2: Create the sync function
CREATE OR REPLACE FUNCTION trig_sync_like_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE social_posts SET like_count = like_count + 1 WHERE id = NEW.post_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE social_posts SET like_count = GREATEST(0, like_count - 1) WHERE id = OLD.post_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$;

-- Step 3: Attach trigger to social_likes
DROP TRIGGER IF EXISTS trg_sync_like_count ON social_likes;
CREATE TRIGGER trg_sync_like_count
AFTER INSERT OR DELETE ON social_likes
FOR EACH ROW EXECUTE FUNCTION trig_sync_like_count();

-- Step 4: Feed query performance indexes
CREATE INDEX IF NOT EXISTS idx_social_posts_feed_main
    ON public.social_posts (created_at DESC)
    WHERE (visibility = 'public' OR visibility IS NULL);

CREATE INDEX IF NOT EXISTS idx_social_likes_post_id_user
    ON public.social_likes (post_id, user_id, reaction_type);
