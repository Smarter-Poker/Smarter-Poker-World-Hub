-- ════════════════════════════════════════════════════════════════════════════════
-- Migration: Harden live moderation RLS policies
-- ════════════════════════════════════════════════════════════════════════════════
-- BUGS FOUND (Pass 3 adversarial audit):
--   1. live_comments had NO delete policy — any authenticated user could delete 
--      any comment via direct Supabase API call
--   2. live_bans INSERT only checked banned_by=auth.uid() — a viewer could ban
--      other viewers on a stream they don't own
--   3. live_pins ALL only checked pinned_by=auth.uid() — same issue
--
-- FIXES:
--   1. Added lc_del: author OR stream broadcaster can delete comments
--   2. Tightened lb_ins: must be both banned_by AND stream broadcaster
--   3. Tightened lp_all: must be both pinned_by AND stream broadcaster
-- ════════════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. Comment delete: author or broadcaster
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='live_comments' AND policyname='lc_del') THEN
    CREATE POLICY lc_del ON public.live_comments FOR DELETE
    USING (
      auth.uid() = user_id
      OR auth.uid() IN (
        SELECT broadcaster_id FROM public.live_streams
        WHERE id = live_comments.stream_id
      )
    );
  END IF;
END $$;

-- 2. Ban insert: broadcaster only
DROP POLICY IF EXISTS lb_ins ON public.live_bans;
CREATE POLICY lb_ins ON public.live_bans FOR INSERT
WITH CHECK (
  auth.uid() = banned_by
  AND auth.uid() IN (
    SELECT broadcaster_id FROM public.live_streams
    WHERE id = live_bans.stream_id
  )
);

-- 3. Pin: broadcaster only
DROP POLICY IF EXISTS lp_all ON public.live_pins;
CREATE POLICY lp_all ON public.live_pins FOR ALL
USING (
  auth.uid() = pinned_by
  AND auth.uid() IN (
    SELECT broadcaster_id FROM public.live_streams
    WHERE id = live_pins.stream_id
  )
);

COMMIT;
