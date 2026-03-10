-- ═══════════════════════════════════════════════════════════════════════════
-- STORIES & SOCIAL MEDIA STORAGE BUCKETS
-- Creates required storage buckets for Stories and Social Feed functionality
-- Migration: 020_stories_social_storage.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 📸 STORIES BUCKET - For 24-hour story uploads
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'stories',
    'stories',
    true,                           -- Public bucket for stories
    52428800,                       -- 50MB max file size
    ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime']
)
ON CONFLICT (id) DO UPDATE SET
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ─────────────────────────────────────────────────────────────────────────────
-- 📱 SOCIAL-MEDIA BUCKET - For social feed posts
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'social-media',
    'social-media',
    true,                           -- Public bucket for social media
    104857600,                      -- 100MB max file size (videos can be larger)
    ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime']
)
ON CONFLICT (id) DO UPDATE SET
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ─────────────────────────────────────────────────────────────────────────────
-- 🔒 STORIES BUCKET RLS POLICIES
-- ─────────────────────────────────────────────────────────────────────────────

-- Allow authenticated users to upload stories
CREATE POLICY "stories_upload_own"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'stories' AND
    (storage.foldername(name))[1] = 'stories' AND
    (storage.foldername(name))[2] = auth.uid()::text
);

-- Allow authenticated users to delete their own stories
CREATE POLICY "stories_delete_own"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'stories' AND
    (storage.foldername(name))[2] = auth.uid()::text
);

-- Allow public read access for stories
CREATE POLICY "stories_public_read"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'stories');

-- ─────────────────────────────────────────────────────────────────────────────
-- 🔒 SOCIAL-MEDIA BUCKET RLS POLICIES
-- ─────────────────────────────────────────────────────────────────────────────

-- Allow authenticated users to upload social media
CREATE POLICY "social_media_upload_own"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'social-media'
);

-- Allow authenticated users to delete their own media
CREATE POLICY "social_media_delete_own"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'social-media' AND
    (storage.foldername(name))[2] = auth.uid()::text
);

-- Allow public read access for social media
CREATE POLICY "social_media_public_read"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'social-media');
