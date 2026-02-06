-- ═══════════════════════════════════════════════════════════════════════════
-- AUTO-STORY FROM POSTS - Create story when posting with media
-- Migration: 20260206_auto_story_from_posts.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- Function: Auto-create story when a post with media is created
CREATE OR REPLACE FUNCTION fn_auto_create_story_from_post()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Only create story for posts with media (image or video)
    IF NEW.media_url IS NOT NULL AND NEW.media_url != '' THEN
        INSERT INTO social_stories (
            author_id, 
            content, 
            media_url, 
            media_type,
            created_at,
            expires_at,
            is_active
        )
        VALUES (
            NEW.author_id,
            LEFT(NEW.content, 200), -- Truncate content for story overlay
            NEW.media_url,
            COALESCE(NEW.media_type, 
                CASE 
                    WHEN NEW.media_url ILIKE '%.mp4' OR NEW.media_url ILIKE '%video%' THEN 'video'
                    ELSE 'image'
                END
            ),
            NOW(),
            NOW() + INTERVAL '24 hours',
            true
        );
        
        RAISE NOTICE 'Auto-created story for post % by user %', NEW.id, NEW.author_id;
    END IF;
    
    RETURN NEW;
END;
$$;

-- Drop existing trigger if exists (for re-runs)
DROP TRIGGER IF EXISTS trg_auto_story_on_post ON social_posts;

-- Create trigger: Fires after a new post is inserted
CREATE TRIGGER trg_auto_story_on_post
    AFTER INSERT ON social_posts
    FOR EACH ROW
    EXECUTE FUNCTION fn_auto_create_story_from_post();

-- Grant execute permission
GRANT EXECUTE ON FUNCTION fn_auto_create_story_from_post() TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICATION: Check that trigger is active
-- ═══════════════════════════════════════════════════════════════════════════
-- Run this to verify:
-- SELECT tgname, tgrelid::regclass, tgenabled 
-- FROM pg_trigger 
-- WHERE tgname = 'trg_auto_story_on_post';
