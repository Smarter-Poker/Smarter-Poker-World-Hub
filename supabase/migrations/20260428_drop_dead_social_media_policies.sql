-- Drop two dead RLS policies on storage.objects that reference a non-existent bucket.
--
-- Background: the actual bucket id is 'social-media' (HYPHEN). Two policies
-- were created at some point referencing 'social_media' (UNDERSCORE), so they
-- never matched any row and were silently dead. They've been confusing every
-- subsequent audit. The active policies for the real bucket are:
--   - "social_media_upload_own"    (INSERT, role authenticated, bucket 'social-media')
--   - "social_media_public_read"   (SELECT, public, bucket 'social-media')
--   - "social_media_delete_own"    (DELETE, authenticated, bucket 'social-media')
-- Plus a blanket "Authenticated users can upload" (INSERT, authenticated, WITH CHECK true)
-- that is broader than needed but separately tracked.
--
-- This migration only drops the dead underscore policies — the security-tightening
-- of the blanket policy is intentionally a separate, reviewed change.
--
-- Authored alongside the 2026-04-28 video-upload root-cause fix.
-- See: .memory/problems/2026-04-28-video-upload-jws.md

DROP POLICY IF EXISTS "social_media_insert" ON storage.objects;
DROP POLICY IF EXISTS "social_media_select" ON storage.objects;
