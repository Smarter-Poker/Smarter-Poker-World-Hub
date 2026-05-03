-- ════════════════════════════════════════════════════════════════════════════
-- M7.2: Mirror ALL video posts to social_reels, not just YouTube ones.
-- ════════════════════════════════════════════════════════════════════════════
--
-- Bug-hunt finding (after M7 dropped postsResult): horse-posted NATIVE
-- Supabase videos and rare other-host URLs lacked a reel mirror, so they
-- became invisible to the Reels feed which now reads exclusively from
-- social_reels. Tiny in absolute terms (1 supabase + 1 other-URL) but
-- the trigger should be correct in principle, not an accidental hole.
--
-- Fix: drop the YouTube-only filter from the mirror trigger. Mirror EVERY
-- public video post. The BEFORE INSERT trigger on social_reels still
-- correctly tags only YouTube URLs as source_type='youtube' and queues
-- conversion only for those — non-YouTube reels become source_type='user'
-- (default), media_status='ready' (default), and never enter the pipeline.
--
-- Also: this migration is the on-disk record of changes already applied
-- to production via Supabase MCP at 2026-05-03 (the sub-second trigger
-- update + 2-row backfill). Re-applying is idempotent.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION fn_social_posts_video_to_reel_mirror()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_first_url TEXT;
  v_thumb     TEXT;
BEGIN
  IF NEW.content_type IS DISTINCT FROM 'video' THEN RETURN NEW; END IF;
  IF NEW.media_urls IS NULL OR jsonb_typeof(NEW.media_urls) <> 'array' OR jsonb_array_length(NEW.media_urls) = 0 THEN
    RETURN NEW;
  END IF;
  v_first_url := NEW.media_urls->>0;
  IF v_first_url IS NULL OR length(v_first_url) = 0 THEN RETURN NEW; END IF;

  -- M7.2: removed the YouTube-only short-circuit. Mirror every video post.

  IF EXISTS (SELECT 1 FROM social_reels WHERE source_post_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM social_reels
    WHERE author_id = NEW.author_id AND video_url = v_first_url
  ) THEN
    RETURN NEW;
  END IF;

  v_thumb := NEW.thumbnail_url;
  INSERT INTO social_reels (
    author_id, video_url, thumbnail_url, caption, source_post_id, is_public
  ) VALUES (
    NEW.author_id, v_first_url, v_thumb, NEW.content, NEW.id, COALESCE(NEW.visibility = 'public', true)
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'fn_social_posts_video_to_reel_mirror skipped post % (%)', NEW.id, SQLERRM;
  RETURN NEW;
END;
$fn$;

-- Backfill orphaned video posts (idempotent: skip rows that already have a mirror)
INSERT INTO social_reels (author_id, video_url, thumbnail_url, caption, source_post_id, is_public)
SELECT sp.author_id, sp.media_urls->>0, sp.thumbnail_url, sp.content, sp.id, true
FROM social_posts sp
WHERE sp.visibility='public'
  AND sp.content_type='video'
  AND (sp.media_urls->>0) IS NOT NULL
  AND length(sp.media_urls->>0) > 0
  AND NOT EXISTS (SELECT 1 FROM social_reels sr WHERE sr.source_post_id = sp.id)
  AND NOT EXISTS (
    SELECT 1 FROM social_reels sr2
    WHERE sr2.author_id = sp.author_id AND sr2.video_url = sp.media_urls->>0
  );
