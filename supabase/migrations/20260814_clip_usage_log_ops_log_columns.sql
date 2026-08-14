-- CHECK 13 root cause (2026-08-14): TWO archive migrations both ran
-- CREATE TABLE IF NOT EXISTS clip_usage_log. 012_clip_library.sql (engagement
-- design: horse_id, caption_used, likes_received) won the race; 015's
-- ops-log design (author_id, source, video_id, story_id, success,
-- error_message, used_at) — the one ALL repo code is written against — was a
-- silent no-op. Result: 0 rows ever; the horse pipeline's clip-reuse dedupe
-- and failure log 42703 on every call. Additive columns complete 015's design
-- alongside 012's engagement columns; no code change needed. 012's SQL writer
-- (log_clip_usage) is unaffected: new columns are nullable or defaulted.
-- Applied to production via Supabase MCP apply_migration 2026-08-14.

DO $$
BEGIN
  IF to_regclass('public.clip_usage_log') IS NULL THEN
    RAISE EXCEPTION 'clip_usage_log does not exist — wrong database?';
  END IF;
  IF (SELECT count(*) FROM public.clip_usage_log) <> 0 THEN
    RAISE EXCEPTION 'clip_usage_log unexpectedly has rows — re-verify writers before altering';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='clip_usage_log'
               AND column_name IN ('author_id','source','video_id','story_id','success','error_message','used_at')) THEN
    RAISE EXCEPTION 'one of the 015 columns already exists — investigate';
  END IF;
END $$;

ALTER TABLE public.clip_usage_log
  ADD COLUMN author_id uuid,
  ADD COLUMN source text,
  ADD COLUMN video_id text,
  ADD COLUMN story_id uuid,
  ADD COLUMN success boolean NOT NULL DEFAULT true,
  ADD COLUMN error_message text,
  ADD COLUMN used_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_clip_usage_recent ON public.clip_usage_log (clip_id, used_at DESC);
CREATE INDEX IF NOT EXISTS idx_clip_usage_author ON public.clip_usage_log (author_id, used_at DESC);

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_schema='public' AND table_name='clip_usage_log'
     AND column_name IN ('author_id','source','video_id','story_id','success','error_message','used_at');
  IF n <> 7 THEN
    RAISE EXCEPTION 'post-apply assertion failed: expected 7 new columns, found %', n;
  END IF;
END $$;
