-- ═══════════════════════════════════════════════════════════════════════════
-- Messenger Media Storage Bucket — Phase 8 Infrastructure
-- Creates the `messenger_media` bucket for voice notes, images, videos
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Create the bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'messenger_media',
    'messenger_media',
    true,
    52428800, -- 50MB max
    ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/webm', 'audio/webm', 'audio/mp4', 'audio/mpeg', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- 2. RLS: Allow authenticated users to upload
CREATE POLICY "Authenticated users can upload messenger media"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'messenger_media');

-- 3. RLS: Allow public read access
CREATE POLICY "Public read access for messenger media"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'messenger_media');

-- 4. RLS: Allow owners to delete their own uploads
CREATE POLICY "Users can delete their own messenger media"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'messenger_media' AND auth.uid()::text = (storage.foldername(name))[1]);
