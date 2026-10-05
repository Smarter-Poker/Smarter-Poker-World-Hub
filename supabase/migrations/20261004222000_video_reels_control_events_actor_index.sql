BEGIN;

DO $preflight$
BEGIN
  IF to_regclass('public.video_reels_control_events') IS NULL THEN
    RAISE EXCEPTION 'preflight: Phase 10 control event table is missing';
  END IF;
END
$preflight$;

CREATE INDEX IF NOT EXISTS video_reels_control_events_actor_idx
  ON public.video_reels_control_events(actor_user_id);

DO $postflight$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_index i
    JOIN pg_class t ON t.oid = i.indrelid
    JOIN pg_class idx ON idx.oid = i.indexrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'video_reels_control_events'
      AND idx.relname = 'video_reels_control_events_actor_idx'
      AND i.indisvalid
  ) THEN
    RAISE EXCEPTION 'postflight: control event actor index is missing or invalid';
  END IF;
END
$postflight$;

COMMIT;
