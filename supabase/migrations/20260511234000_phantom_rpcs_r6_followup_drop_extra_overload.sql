-- STREAM-POLISH-R6 FOLLOW-UP: drop leftover phantom 3-arg
-- fn_create_media_upload(uuid, text, text) overload. The 5-arg
-- real impl from migration 20260511230000 is the only callable
-- signature now. No client referenced the 3-arg overload (verified
-- via repo-wide grep for `.rpc('fn_create_media_upload', ...)` —
-- the only hit is src/services/MediaUploadService.js:230 which
-- uses the 5-arg signature).

-- Idempotent: only acts if the phantom overload still exists.
DROP FUNCTION IF EXISTS public.fn_create_media_upload(uuid, text, text);

-- Post-condition verification embedded in the migration: if this
-- block raises, the migration log will surface the issue.
DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM pg_proc
  WHERE proname = 'fn_create_media_upload';

  IF v_count <> 1 THEN
    RAISE WARNING 'fn_create_media_upload: expected exactly 1 overload after drop, found %', v_count;
  END IF;
END
$$;
