-- Bump social-media + live-recordings buckets to 50GB to match the
-- project-level cap that Dan raised in the dashboard at
-- https://supabase.com/dashboard/project/kuklfnapbkmacvwxktbh/settings/storage
-- on 2026-04-29.
--
-- Bucket file_size_limit only enforces UP TO the project-level cap, so the
-- bucket value can be any number ≤ 50GB. We set both to 50GB to give
-- headroom for long live recordings AND high-bitrate phone videos.
--
-- Prior state:
--   social-media     5,368,709,120  ( 5GB) — set today by 20260429_social_media_bucket_5gb_explicit_limit
--   live-recordings    524,288,000  (500MB) — original from create
--
-- After:
--   both = 53,687,091,200 (50GB)

UPDATE storage.buckets
SET file_size_limit = 53687091200  -- 50 GB
WHERE id IN ('social-media', 'live-recordings');
