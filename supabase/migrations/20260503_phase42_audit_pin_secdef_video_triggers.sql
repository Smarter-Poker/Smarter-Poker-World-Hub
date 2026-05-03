-- Phase 42 deep-audit fix: lock search_path on 2 video pipeline trigger funcs
-- (parallel session added these without the pinned search_path).
-- Applied to production via Supabase MCP on 2026-05-03.
ALTER FUNCTION public.fn_queue_video_transcode() SET search_path = '';
ALTER FUNCTION public.fn_video_transcode_jobs_touch_updated_at() SET search_path = '';
