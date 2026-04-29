-- Set the social-media bucket's file_size_limit EXPLICITLY to 5GB.
--
-- WHY THIS MIGRATION EXISTS:
-- The previous migration (20260422_fix_social_media_bucket_mime_types.sql) set
-- file_size_limit = NULL with a comment claiming "No bucket-level limit; server
-- enforces per upload type." That comment is WRONG. In Supabase Storage:
--   - bucket.file_size_limit = NULL means "fall back to the project-level cap"
--   - the project-level upload cap defaults to 50MB unless raised in the
--     project dashboard's Storage Settings page (separate from this migration)
-- So setting NULL did NOT mean "unlimited" — it meant "use whatever the
-- project says", which has been 50MB. Every video upload >50MB has been
-- hitting HTTP 413 / "Maximum size exceeded" on the TUS endpoint.
--
-- PROOF (queried 2026-04-29):
--   SELECT max((metadata->>'size')::bigint) FROM storage.objects
--   WHERE bucket_id = 'social-media';
--   -> 50,491,473 bytes (~48MB) — every upload above ~50MB has failed.
--
-- This migration sets the bucket cap to 5GB explicitly. NOTE: this STILL only
-- enforces UP TO the project-level cap. The project-level cap must be raised
-- separately in the Supabase dashboard:
--   Project Settings -> Storage -> Upload File Size Limit -> 5GB
-- That setting is not exposed via SQL — it's a project-config-only field.

UPDATE storage.buckets
SET file_size_limit = 5368709120  -- 5GB in bytes
WHERE id = 'social-media';
