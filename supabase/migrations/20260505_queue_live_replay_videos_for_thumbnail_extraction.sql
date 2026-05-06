-- Live-stream replays were posting to social_posts with thumbnail_url=NULL
-- because fn_queue_video_transcode trigger only matched .mov/.hevc/.heic/
-- .mkv/.avi extensions. Live recordings are .webm files in live-recordings
-- bucket. Trigger missed them → never queued → no thumbnail extraction.
--
-- Already applied to production via Supabase MCP on 2026-05-05.
CREATE OR REPLACE FUNCTION public.fn_queue_video_transcode()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
BEGIN
  IF NEW.content_type = 'video'
     AND (NEW.media_urls->>0) IS NOT NULL
     AND (
       (NEW.media_urls->>0) ILIKE '%.mov'
       OR (NEW.media_urls->>0) ILIKE '%.hevc'
       OR (NEW.media_urls->>0) ILIKE '%.heic'
       OR (NEW.media_urls->>0) ILIKE '%.mkv'
       OR (NEW.media_urls->>0) ILIKE '%.avi'
       OR (NEW.media_urls->>0) ILIKE '%.webm'
       OR (NEW.media_urls->>0) ILIKE '%/live-recordings/%'
     )
  THEN
    NEW.transcode_status := 'queued';
    NEW.original_media_url := (NEW.media_urls->>0);
  END IF;
  RETURN NEW;
END;
$function$;

UPDATE social_posts
SET transcode_status = 'queued',
    original_media_url = COALESCE(original_media_url, media_urls->>0)
WHERE content_type = 'video'
  AND thumbnail_url IS NULL
  AND transcode_status IS NULL
  AND (
    media_urls::text LIKE '%/live-recordings/%'
    OR media_urls::text ILIKE '%.webm%'
  );
