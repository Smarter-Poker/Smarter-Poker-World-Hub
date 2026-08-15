-- 2026-08-15 social audit:
-- 1. social_page_post_comments: the engage API attaches GIF/image comments
--    with media_url/media_type — columns that exist on social_comments (the
--    global table) but were never added here, so every media comment on a
--    page post 42703'd into a generic 500.
ALTER TABLE public.social_page_post_comments
  ADD COLUMN IF NOT EXISTS media_url text,
  ADD COLUMN IF NOT EXISTS media_type text;

-- 2. SocialService wrote follows to social_connections while every read
--    surface (profiles, reels, live viewers, cache warmer, follower counts)
--    reads social_follows. Backfill the orphaned follows so they finally
--    become visible, then the code switches to social_follows.
INSERT INTO public.social_follows (follower_id, following_id, created_at)
SELECT sc.follower_id, sc.following_id, COALESCE(sc.created_at, now())
FROM public.social_connections sc
WHERE COALESCE(sc.status, 'active') = 'active'
  AND sc.follower_id IS NOT NULL AND sc.following_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.social_follows sf
    WHERE sf.follower_id = sc.follower_id AND sf.following_id = sc.following_id
  );
