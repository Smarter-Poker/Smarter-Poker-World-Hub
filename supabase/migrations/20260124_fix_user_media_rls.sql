-- ═══════════════════════════════════════════════════════════════════════════
-- FIX USER MEDIA STORAGE RLS POLICIES
-- The existing policy was blocking messenger uploads because it required
-- exact folder match. This fix allows uploads anywhere under userId/
-- Migration: 20260124_fix_user_media_rls.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- Drop existing policies
DROP POLICY IF EXISTS "user_media_upload_own" ON storage.objects;
DROP POLICY IF EXISTS "user_media_update_own" ON storage.objects;
DROP POLICY IF EXISTS "user_media_delete_own" ON storage.objects;

-- Recreate with looser path matching (allows any subfolder under userId/)
-- Using position matching to check path starts with userId/
CREATE POLICY "user_media_upload_own"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'user-media' AND
    (name LIKE auth.uid()::text || '/%')
);

-- Allow authenticated users to update their own files
CREATE POLICY "user_media_update_own"
ON storage.objects FOR UPDATE
TO authenticated
USING (
    bucket_id = 'user-media' AND
    (name LIKE auth.uid()::text || '/%')
);

-- Allow authenticated users to delete their own files
CREATE POLICY "user_media_delete_own"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'user-media' AND
    (name LIKE auth.uid()::text || '/%')
);

-- Public read is already there but recreate to be safe
DROP POLICY IF EXISTS "user_media_public_read" ON storage.objects;
CREATE POLICY "user_media_public_read"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'user-media');
