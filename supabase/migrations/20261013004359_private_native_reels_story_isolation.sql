-- TIER: 2 - CREATE OR REPLACE of an existing trigger producer; no signature change or drop.
-- AFFECTS: public.fn_auto_create_story_from_post(), called by trg_auto_story_on_post.
-- WHY: restricted native source posts currently create publicly readable stories.
-- Change only the producer audience guard; no historical row mutation, public-feed change or fixture bypass.
-- ROLLBACK: use a separately reviewed new migration restoring the prior producer body
-- from 20260430_fix_auto_story_trigger_return.sql with its installed ASCII warning,
-- owner postgres, SECURITY DEFINER, fixed search_path and unchanged service-only ACL.
-- Never replay this installed migration or remove the privacy guard without explicit scope.
BEGIN;
DO $baseline$ BEGIN
 IF md5(pg_get_functiondef('public.fn_auto_create_story_from_post()'::regprocedure)) <> '361d53230ceac434d88a7785dd66530a' THEN
  RAISE EXCEPTION 'Auto-story function baseline changed or migration already installed; never replay';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid='public.fn_auto_create_story_from_post()'::regprocedure
   AND proowner='postgres'::regrole AND prosecdef
   AND proacl::text='{postgres=X/postgres,service_role=X/postgres}') THEN
  RAISE EXCEPTION 'Auto-story owner/security/ACL baseline changed';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.social_posts'::regclass AND tgname='trg_auto_story_on_post' AND tgfoid='public.fn_auto_create_story_from_post()'::regprocedure AND tgtype=5 AND tgenabled='O' AND pg_get_triggerdef(oid) = 'CREATE TRIGGER trg_auto_story_on_post AFTER INSERT ON public.social_posts FOR EACH ROW WHEN ((new.origin_type IS DISTINCT FROM ''video_library''::text)) EXECUTE FUNCTION fn_auto_create_story_from_post()') THEN
  RAISE EXCEPTION 'Auto-story producer trigger baseline changed';
 END IF;
END $baseline$;
CREATE OR REPLACE FUNCTION public.fn_auto_create_story_from_post()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    -- A story is publicly readable; a restricted source must never fan out.
    IF NEW.visibility IS DISTINCT FROM 'public'
       OR COALESCE(NEW.audience_mode, 'public') <> 'public' THEN
        RETURN NEW;
    END IF;
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
        -- Silently swallow - story creation is optional, never block the post
        RAISE WARNING '[fn_auto_create_story_from_post] Failed: %', SQLERRM;
    END;

    RETURN NEW;  -- CRITICAL: Always return NEW so the INSERT proceeds
END;
$$;

DO $postimage$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid='public.fn_auto_create_story_from_post()'::regprocedure
   AND proowner='postgres'::regrole AND prosecdef
   AND proconfig=ARRAY['search_path=public, extensions']
   AND proacl::text='{postgres=X/postgres,service_role=X/postgres}'
   AND strpos(prosrc, 'NEW.visibility IS DISTINCT FROM ''public''') > 0
   AND strpos(prosrc, 'COALESCE(NEW.audience_mode, ''public'') <> ''public''') > 0
   AND strpos(prosrc, 'RETURN NEW;') < strpos(prosrc, 'INSERT INTO social_stories')) THEN
  RAISE EXCEPTION 'Auto-story privacy producer post-image did not qualify';
 END IF;
END $postimage$;
COMMIT;
