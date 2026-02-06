-- ═══════════════════════════════════════════════════════════════════════════
-- AUTO-STORY FROM POSTS - Create story when posting with media
-- Migration: 20260206_auto_story_from_posts.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- Function: Auto-create story when a post is created
CREATE OR REPLACE FUNCTION fn_auto_create_story_from_post()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Create story from ANY post (with or without media)
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
        -- Use first media URL from JSONB array if exists
        CASE WHEN NEW.media_urls IS NOT NULL AND jsonb_array_length(NEW.media_urls) > 0 
             THEN NEW.media_urls->>0 
             ELSE NULL 
        END,
        -- Detect media type from first URL
        CASE 
            WHEN NEW.media_urls IS NOT NULL AND jsonb_array_length(NEW.media_urls) > 0 THEN
                CASE WHEN NEW.media_urls->>0 ILIKE '%.mp4' OR NEW.media_urls->>0 ILIKE '%video%' 
                     THEN 'video' 
                     ELSE 'image' 
                END
            ELSE NULL
        END,
        NOW(),
        NOW() + INTERVAL '24 hours',
        true
    );
    
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
