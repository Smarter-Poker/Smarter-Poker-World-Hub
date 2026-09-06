-- A reel waiting on a dead job falls back to YouTube.
--
-- 144 reels sat at media_status='queued' from 2026-08-05 to 2026-09-06 -
-- twenty-three days invisible to every viewer, because the reels feed only
-- shows 'ready'.
--
-- The chain: a horse posts a YouTube clip; fn_social_posts_video_to_reel_mirror
-- mirrors the post into social_reels; fn_social_reels_yt_intercept recognises
-- the YouTube url, records youtube_video_id / original_youtube_url and sets
-- media_status='queued'; fn_social_reels_yt_queue_job files a job to download
-- the video into our own storage with yt-dlp.
--
-- All 149 of those jobs FAILED, every one with
--   yt-dlp_exit_1: ERROR: [youtube] <id>: The page needs to be reloaded.
-- which is YouTube's anti-bot response, not a problem with the video. The job
-- was marked failed. THE REEL WAS NEVER TOLD. It kept the storage URL the
-- pipeline had promised to write and never wrote: fetching one returns HTTP
-- 400, while the YouTube original answers oEmbed 200.
--
-- Two records of one truth, only one of them updated on failure - the same
-- shape as the post_briefs defect fixed the same morning.
--
-- THE REPAIR is not an invention: 10,961 reels already play as
-- source_type='youtube' with video_url pointing at YouTube, and the 144
-- already carried youtube_video_id and original_youtube_url. They differed
-- from a working reel in two columns. Rehearsed in a rolled-back transaction
-- first: 144 queued before, 0 after, 0 shape mismatches across all 11,105
-- YouTube reels.
--
-- THE FIX THAT STOPS IT RECURRING is the trigger: when a download job reaches
-- a terminal 'failed', the reel stops waiting and falls back to the source it
-- came from. A local copy is an optimisation; being watchable is the product.

BEGIN;

UPDATE public.social_reels
SET source_type  = 'youtube',
    video_url    = original_youtube_url,
    media_status = 'ready'
WHERE media_status = 'queued'
  AND source_type  = 'native'
  AND original_youtube_url IS NOT NULL
  AND youtube_video_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.fn_reel_falls_back_when_job_dies()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status IS DISTINCT FROM 'failed' THEN RETURN NEW; END IF;
  IF NEW.reel_id IS NULL THEN RETURN NEW; END IF;

  UPDATE public.social_reels r
  SET source_type  = 'youtube',
      video_url    = r.original_youtube_url,
      media_status = 'ready'
  WHERE r.id = NEW.reel_id
    AND r.media_status IN ('queued','processing')
    AND r.original_youtube_url IS NOT NULL
    AND r.youtube_video_id IS NOT NULL;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'fn_reel_falls_back_when_job_dies skipped job % (%)', NEW.id, SQLERRM;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_reel_falls_back_when_job_dies ON public.video_transcode_jobs;
CREATE TRIGGER trg_reel_falls_back_when_job_dies
  AFTER INSERT OR UPDATE OF status ON public.video_transcode_jobs
  FOR EACH ROW EXECUTE FUNCTION public.fn_reel_falls_back_when_job_dies();

DO $$
DECLARE v_stuck int; v_bad_shape int;
BEGIN
  SELECT count(*) INTO v_stuck FROM public.social_reels
   WHERE media_status='queued' AND source_type='native';
  SELECT count(*) INTO v_bad_shape FROM public.social_reels
   WHERE source_type='youtube' AND media_status='ready'
     AND (youtube_video_id IS NULL OR original_youtube_url IS NULL
          OR video_url NOT LIKE '%youtube%');
  IF v_stuck <> 0 THEN
    RAISE EXCEPTION 'social_reels: % native reels still queued after the repair', v_stuck;
  END IF;
  IF v_bad_shape <> 0 THEN
    RAISE EXCEPTION 'social_reels: % youtube reels do not match the working shape', v_bad_shape;
  END IF;
  RAISE NOTICE 'social_reels: queue drained, every youtube reel matches the shape that plays';
END $$;

COMMIT;
