-- Add iPhone photo formats (HEIC/HEIF) to allowed bucket mime types.
--
-- Background: iPhone Photos defaults to HEIC/HEIF format. Without these in
-- the bucket allowlist, Safari sends image/heic and Supabase Storage rejects
-- with 415 Unsupported Media Type — a separate failure mode from the
-- "Invalid Compact JWS" video bug, but visible to the same iPhone users.
--
-- This is just the bucket-level mime allowlist; pages/api/social/upload-url.js
-- ALLOWED_TYPES is updated in the same commit.
--
-- NOTE: HEIC images render natively on Safari/iOS but NOT on Chrome/Firefox
-- desktop. A follow-up should add server-side conversion (via sharp or
-- heic-convert) so feeds render the same image everywhere. Until then,
-- iPhone-uploaded photos may show as "broken image" on non-Apple browsers.
-- Tracked in .memory/SUMMARY.md.

UPDATE storage.buckets
SET allowed_mime_types = array_append(allowed_mime_types, 'image/heic')
WHERE id = 'social-media'
  AND NOT ('image/heic' = ANY(allowed_mime_types));

UPDATE storage.buckets
SET allowed_mime_types = array_append(allowed_mime_types, 'image/heif')
WHERE id = 'social-media'
  AND NOT ('image/heif' = ANY(allowed_mime_types));

UPDATE storage.buckets
SET allowed_mime_types = array_append(allowed_mime_types, 'image/heic')
WHERE id = 'stories'
  AND NOT ('image/heic' = ANY(allowed_mime_types));

UPDATE storage.buckets
SET allowed_mime_types = array_append(allowed_mime_types, 'image/heif')
WHERE id = 'stories'
  AND NOT ('image/heif' = ANY(allowed_mime_types));
