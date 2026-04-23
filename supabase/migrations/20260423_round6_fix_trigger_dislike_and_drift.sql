-- ============================================================
-- ROUND 6 BUG FIXES: Trigger dislike exclusion + drift repair
-- ============================================================

-- BUG 1: trig_sync_like_count counted reaction_type='dislike' as a like.
-- Every dislike was incrementing like_count. Fix: only count non-dislike reactions.
CREATE OR REPLACE FUNCTION public.trig_sync_like_count()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        -- Only count non-dislike reactions towards like_count
        IF NEW.reaction_type IS DISTINCT FROM 'dislike' THEN
            UPDATE social_posts
              SET like_count = GREATEST(0, COALESCE(like_count, 0) + 1)
              WHERE id = NEW.post_id;
            UPDATE social_reels
              SET like_count = GREATEST(0, COALESCE(like_count, 0) + 1)
              WHERE id = NEW.post_id;
        END IF;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        -- Only decrement for non-dislike reactions
        IF OLD.reaction_type IS DISTINCT FROM 'dislike' THEN
            UPDATE social_posts
              SET like_count = GREATEST(0, COALESCE(like_count, 0) - 1)
              WHERE id = OLD.post_id;
            UPDATE social_reels
              SET like_count = GREATEST(0, COALESCE(like_count, 0) - 1)
              WHERE id = OLD.post_id;
        END IF;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$;

-- BUG 2: Mass-recalculate all drifted like_counts on social_posts
-- (2,738 posts had drifted counts from the old trigger + the previous double-count RPC bug)
UPDATE social_posts sp
SET like_count = (
    SELECT COUNT(*) 
    FROM social_likes sl 
    WHERE sl.post_id = sp.id 
      AND (sl.reaction_type IS NULL OR sl.reaction_type != 'dislike')
)
WHERE sp.like_count != (
    SELECT COUNT(*) 
    FROM social_likes sl 
    WHERE sl.post_id = sp.id 
      AND (sl.reaction_type IS NULL OR sl.reaction_type != 'dislike')
);

-- BUG 3: Mass-recalculate drifted like_counts on social_reels
UPDATE social_reels sr
SET like_count = (
    SELECT COUNT(*) 
    FROM social_likes sl 
    WHERE sl.post_id = sr.id 
      AND (sl.reaction_type IS NULL OR sl.reaction_type != 'dislike')
)
WHERE sr.like_count != (
    SELECT COUNT(*) 
    FROM social_likes sl 
    WHERE sl.post_id = sr.id 
      AND (sl.reaction_type IS NULL OR sl.reaction_type != 'dislike')
);

-- Verify the repair
SELECT 
  'social_posts drifted after fix' as check_name,
  COUNT(*) as count
FROM social_posts sp
WHERE sp.like_count != (
    SELECT COUNT(*) FROM social_likes sl 
    WHERE sl.post_id = sp.id AND (sl.reaction_type IS NULL OR sl.reaction_type != 'dislike')
)
UNION ALL
SELECT 
  'social_reels drifted after fix' as check_name,
  COUNT(*) as count
FROM social_reels sr
WHERE sr.like_count != (
    SELECT COUNT(*) FROM social_likes sl 
    WHERE sl.post_id = sr.id AND (sl.reaction_type IS NULL OR sl.reaction_type != 'dislike')
);
