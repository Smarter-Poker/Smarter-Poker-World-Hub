-- Replace the blanket "Authenticated users can upload" RLS policy on
-- storage.objects with a bucket-scoped allowlist.
--
-- Background: the original policy is `WITH CHECK (true)` for role
-- `authenticated`, which means any logged-in user can write to ANY bucket
-- including ones that should be admin-only. The path-prefix check in
-- pages/api/social/upload-url.js prevents the *normal* client from doing
-- this, but a hand-crafted curl bypassing the API can write anywhere a
-- valid JWT can authenticate against — a privilege escalation on the
-- storage layer.
--
-- This migration replaces the blanket with an explicit allowlist of every
-- bucket that currently has its own bucket-specific policy, so behavior
-- is identical for existing apps but new buckets are fail-closed (must
-- get an explicit policy before authenticated INSERT works).
--
-- Bucket-specific INSERT policies that still cover their respective bucket:
--   avatars            -> "Users can upload own avatar"
--   live-recordings    -> "Broadcasters can upload recordings"
--   messenger_media    -> "Authenticated users can upload messenger media"
--   social-media       -> "social_media_upload_own"
--   stories            -> "stories_upload_own"
--   uploads            -> "uploads_authenticated_insert"
--   user-media         -> "user_media_upload_own"

DROP POLICY IF EXISTS "Authenticated users can upload" ON storage.objects;

CREATE POLICY "Authenticated upload to allowlisted buckets"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id IN (
    'avatars',
    'live-recordings',
    'messenger_media',
    'social-media',
    'stories',
    'uploads',
    'user-media'
  )
);
