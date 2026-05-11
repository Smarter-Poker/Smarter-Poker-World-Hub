-- STREAM-POLISH-R4 STORY-EXPIRY-1: real cleanup for expired stories.
--
-- Audit found 23,216 stories in social_stories with expires_at < now()
-- (21,306 of them more than 1 week old). Stories.jsx + fn_get_stories
-- correctly hide expired rows via `WHERE is_active = true AND expires_at > NOW()`,
-- but nothing actually DELETES them — they accumulate forever.
--
-- This RPC is service-role only; the matching cron endpoint
-- /api/cron/cleanup-expired-stories.js (added alongside) calls it
-- every 6 hours via Open Claw.
--
-- p_grace_hours = 24 by default so a just-expired story can still be
-- referenced by views/reactions that may have been in-flight when
-- expiry hit. After grace, hard-delete (CASCADE on FK takes out the
-- view rows + reaction rows). Storage blob cleanup is a separate
-- concern handled by the existing cleanup-orphan-uploads cron.

CREATE OR REPLACE FUNCTION public.fn_cleanup_expired_stories(p_grace_hours int DEFAULT 24)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_deleted int;
  v_grace int;
BEGIN
  -- Defensive clamp: never run with grace=0 (would delete stories at
  -- the exact moment they expire — too aggressive). Min 1h, max 7d.
  v_grace := GREATEST(1, LEAST(168, COALESCE(p_grace_hours, 24)));

  DELETE FROM social_stories
  WHERE expires_at < (now() - make_interval(hours => v_grace));

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'deleted_count', v_deleted,
    'grace_hours', v_grace,
    'cutoff', (now() - make_interval(hours => v_grace))::text
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'fn_cleanup_expired_stories failed: % %', SQLERRM, SQLSTATE;
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_cleanup_expired_stories(int) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_cleanup_expired_stories(int) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_cleanup_expired_stories(int) FROM authenticated;
-- service_role retains EXECUTE by default; cron uses service-role key.
