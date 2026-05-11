-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: streaming_deep_audit_round5_add_image_mime_types_for_thumbnails
-- Version:   20260511060000
-- Applied:   2026-05-11 via Supabase MCP apply_migration
--
-- SLM-1 / GLM-thumb (CRITICAL regression introduced by round 2 / PR #315):
--   PR #315 tightened the live-recordings bucket mime allowlist to
--   ['video/mp4','video/webm','video/quicktime'] for STO-2. I didn't
--   realize that the SAME bucket is also used to host stream thumbnails
--   (image JPEG/PNG/WebP uploads) by both GoLiveModal.uploadThumbnail()
--   and ScheduleLiveModal.handleThumbnailUpload().
--
--   Result: every thumbnail upload since round 2 has silently failed.
--   GoLiveModal swallows the error (returns null), so a broadcaster
--   going live with a thumbnail just gets no thumbnail. ScheduleLiveModal
--   also silently no-ops the thumbnail. Symptom: scheduled lives appear
--   with the placeholder gradient instead of the user's chosen image.
--
--   Verified via storage.buckets row:
--     allowed_mime_types = video/mp4, video/webm, video/quicktime
--   And confirmed via grep: GoLiveModal.jsx:630, ScheduleLiveModal.jsx:48,
--   LiveStreamViewer.jsx:556 (Clip-It video — correctly video).
--
-- Fix: add the three image MIME types to the bucket allowlist. The bucket
-- name 'live-recordings' is misleading (it stores both recordings and
-- thumbnails) but renaming is high-risk and the path conventions
-- ('live-thumbnails/' subdir for images, 'clips/' for clips, recordings
-- at the root) keep them logically separate.
--
-- Better long-term: separate buckets. Tracked as STO-3 (not in this PR).
-- ═══════════════════════════════════════════════════════════════════════════

UPDATE storage.buckets
   SET allowed_mime_types = ARRAY[
     'video/mp4',
     'video/webm',
     'video/quicktime',
     'image/jpeg',
     'image/png',
     'image/webp'
   ]
 WHERE id = 'live-recordings';

DO $$
DECLARE v_mime text;
BEGIN
  SELECT array_to_string(allowed_mime_types, ',') INTO v_mime
    FROM storage.buckets WHERE id = 'live-recordings';
  IF v_mime IS NULL OR v_mime NOT LIKE '%image/jpeg%' THEN
    RAISE EXCEPTION 'live-recordings bucket update failed: %', v_mime;
  END IF;
END $$;
