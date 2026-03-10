-- ═══════════════════════════════════════════════════════════════════════════
-- USER MEDIA STORAGE BUCKET SETUP
-- Creates the user-media bucket with RLS policies for secure uploads
-- Migration: 019_user_media_storage.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- Create the user-media storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'user-media',
    'user-media',
    true,                           -- Public bucket for profile pictures
    52428800,                       -- 50MB max file size
    ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime']
)
ON CONFLICT (id) DO UPDATE SET
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ─────────────────────────────────────────────────────────────────────────────
-- 🔒 STORAGE RLS POLICIES
-- ─────────────────────────────────────────────────────────────────────────────

-- Allow authenticated users to upload to their own folder
CREATE POLICY "user_media_upload_own"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'user-media' AND
    (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow authenticated users to update their own files
CREATE POLICY "user_media_update_own"
ON storage.objects FOR UPDATE
TO authenticated
USING (
    bucket_id = 'user-media' AND
    (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow authenticated users to delete their own files
CREATE POLICY "user_media_delete_own"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'user-media' AND
    (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow public read access (since bucket is public)
CREATE POLICY "user_media_public_read"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'user-media');
