-- The unique index on poker_clips.video_id was created partial
-- (WHERE video_id IS NOT NULL), and ON CONFLICT (video_id) cannot infer a
-- partial index without repeating its predicate - so the scraper's upsert,
-- which is the whole reason the constraint exists, failed with 42P10.
-- Postgres already allows repeated NULLs in a plain unique index, so the
-- predicate bought nothing. Made unconditional.
BEGIN;
DROP INDEX IF EXISTS public.poker_clips_video_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS poker_clips_video_id_key
  ON public.poker_clips (video_id);
COMMIT;
