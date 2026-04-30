-- ============================================================================
-- Fix: "control reached end of trigger procedure without RETURN"
-- 2026-04-30
--
-- The fn_auto_create_story_from_post() trigger fires on every social_posts
-- INSERT. If the social_stories INSERT fails (e.g. table missing, constraint
-- violation, or exception), the function reaches END without RETURN NEW.
-- This migration wraps the body in an EXCEPTION block so it always returns.
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_auto_create_story_from_post()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Wrap in exception handler so a failed story insert never blocks the post
    BEGIN
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
            LEFT(NEW.content, 200),
            CASE WHEN NEW.media_urls IS NOT NULL AND jsonb_array_length(NEW.media_urls) > 0
                 THEN NEW.media_urls->>0
                 ELSE NULL
            END,
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
    EXCEPTION WHEN OTHERS THEN
        -- Silently swallow — story creation is optional, never block the post
        RAISE WARNING '[fn_auto_create_story_from_post] Failed: %', SQLERRM;
    END;

    RETURN NEW;  -- CRITICAL: Always return NEW so the INSERT proceeds
END;
$$;
