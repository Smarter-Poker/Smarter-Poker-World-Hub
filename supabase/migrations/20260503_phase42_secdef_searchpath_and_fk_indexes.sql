-- Phase 42 — security/perf advisor cleanup (audit-trail copy)
-- Already applied via Supabase MCP on 2026-05-03.
--   (1) Pinned search_path on 2 owned SECURITY DEFINER funcs
--   (2) Added 5 FK column indexes (perf — DELETE on parent now O(log n))
ALTER FUNCTION public.fn_get_social_feed_v2(uuid, integer, integer, text) SET search_path = '';
ALTER FUNCTION public.update_live_peak_viewers(uuid, integer) SET search_path = '';
CREATE INDEX IF NOT EXISTS idx_club_wallet_tx_club_id_fk ON public.club_wallet_transactions(club_id);
CREATE INDEX IF NOT EXISTS idx_video_transcode_jobs_post_id_fk ON public.video_transcode_jobs(post_id);
CREATE INDEX IF NOT EXISTS idx_video_transcode_jobs_reel_id_fk ON public.video_transcode_jobs(reel_id);
CREATE INDEX IF NOT EXISTS idx_video_transcode_jobs_user_id_fk ON public.video_transcode_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_live_reactions_sender_id_fk ON public.live_reactions(sender_id);
