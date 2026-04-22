-- =======================================================================
-- Fix social-media bucket allowed_mime_types
-- Context: Video uploads were failing because iOS/Android report MIME types
-- like "video/x-m4v", "video/3gpp", "video/x-msvideo", "video/x-matroska"
-- which were NOT in the bucket's original allowed_mime_types list.
-- The bucket was rejecting the PUT requests from Supabase signed URLs.
--
-- Also: Remove the 100MB file_size_limit for the bucket — videos uploaded
-- via signed URLs bypass Vercel limits and can be gigabytes in size.
-- The server-side upload-url.js enforces its own 5GB cap instead.
-- =======================================================================

UPDATE storage.buckets
SET
    file_size_limit = NULL,  -- No bucket-level limit; server enforces per upload type
    allowed_mime_types = ARRAY[
        -- Images
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',
        'image/svg+xml',
        -- Videos (all formats accepted by upload-url.js)
        'video/mp4',
        'video/webm',
        'video/quicktime',   -- MOV (iPhone default)
        'video/x-msvideo',   -- AVI
        'video/x-m4v',       -- M4V (Apple iTunes video)
        'video/3gpp',        -- 3GP (Android)
        'video/3gpp2',       -- 3G2
        'video/hevc',        -- HEVC/H.265
        'video/x-matroska'   -- MKV
    ]
WHERE id = 'social-media';

-- Also fix the stories bucket to include x-m4v/3gpp for consistency
UPDATE storage.buckets
SET
    allowed_mime_types = ARRAY[
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',
        'video/mp4',
        'video/webm',
        'video/quicktime',
        'video/x-m4v',
        'video/3gpp',
        'video/3gpp2'
    ]
WHERE id = 'stories';
