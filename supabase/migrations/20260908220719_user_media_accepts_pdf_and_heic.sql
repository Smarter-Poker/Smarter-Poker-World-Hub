-- ═══════════════════════════════════════════════════════════════════════
-- 20260908220719_user_media_accepts_pdf_and_heic.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        2                              (additive bucket config)
-- AUTHOR:      cowork-receipts (Claude)
-- AFFECTS:     storage.buckets row 'user-media' (allowed_mime_types)
-- IRREVERSIBLE: no
-- APPLIED:     2026-09-08 via the Supabase MCP apply_migration, recorded as
--              version 20260908220719. Dry-run in a rolled-back transaction first.
--
-- WHY:
--   The W-2G Document Vault and the Dealer Vault forms both accept .pdf. Since
--   #1651 they upload through receiptStorage to the `user-media` bucket, whose
--   allowed_mime_types listed images and video only, so a PDF W-2G was refused
--   by the bucket ("mime type application/pdf is not supported"). Before #1651
--   the same upload was refused by RLS on `images`, so it has never worked.
--   HEIC/HEIF are added for iPhone camera captures that arrive un-converted.
--
-- HOW:
--   - append the three types; idempotent (skips when pdf is already allowed)
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'user-media') THEN
        RAISE EXCEPTION 'pre-flight failed: bucket user-media not found';
    END IF;
END $$;

UPDATE storage.buckets
   SET allowed_mime_types = allowed_mime_types || ARRAY['application/pdf','image/heic','image/heif']
 WHERE id = 'user-media' AND NOT ('application/pdf' = ANY(allowed_mime_types));

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM storage.buckets
        WHERE id = 'user-media' AND 'application/pdf' = ANY(allowed_mime_types)
    ) THEN
        RAISE EXCEPTION 'post-apply failed: application/pdf still not allowed on user-media';
    END IF;
END $$;

COMMIT;
