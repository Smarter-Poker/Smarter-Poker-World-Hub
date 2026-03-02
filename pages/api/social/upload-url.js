/**
 * Social Media Signed Upload URL API — Direct-to-Supabase uploads
 * 
 * POST /api/social/upload-url
 *   Body JSON: { fileName, fileSize, mimeType, folder?, prefix? }
 * 
 * Returns: { success: true, signedUrl, token, publicUrl, path }
 * 
 * The client uses the signed URL to upload the file directly to Supabase Storage,
 * completely bypassing Vercel's serverless function body size limits.
 * This enables uploads of large video files (200MB+).
 */
import { createClient } from '@supabase/supabase-js';

const BUCKET = 'social-media';
const MAX_VIDEO_SIZE = 5 * 1024 * 1024 * 1024; // 5GB — Supabase Pro max, no practical limit
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;        // 10MB for images

const ALLOWED_TYPES = [
    'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml',
    'video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo',
];

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'POST only' });
    }

    const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
    const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

    if (!supabaseUrl || !serviceKey) {
        return res.status(500).json({ error: 'Server configuration error' });
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // ── Auth: verify JWT identity ──
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Auth required' });
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

    try {
        const { fileName, fileSize, mimeType, folder, prefix } = req.body || {};

        if (!fileName || !fileSize || !mimeType) {
            return res.status(400).json({ error: 'Missing required fields: fileName, fileSize, mimeType' });
        }

        // Validate file type
        if (!ALLOWED_TYPES.includes(mimeType)) {
            return res.status(400).json({ error: `File type not allowed: ${mimeType}` });
        }

        // Validate file size based on type
        const isVideo = mimeType.startsWith('video/');
        const maxSize = isVideo ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE;
        if (fileSize > maxSize) {
            const maxMB = Math.round(maxSize / 1024 / 1024);
            return res.status(400).json({
                error: `File too large (max ${maxMB}MB for ${isVideo ? 'video' : 'image'})`
            });
        }

        // Build storage path
        const ext = fileName.split('.').pop() || 'bin';
        const timestamp = Date.now();
        const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
        const subFolder = isVideo ? (folder || 'videos') : (folder || 'photos');
        const pathParts = [subFolder, prefix, `${timestamp}_${safeName}`].filter(Boolean);
        const storagePath = pathParts.join('/');

        // Create signed upload URL (one-time use, expires in 5 minutes)
        const { data, error: signError } = await supabase.storage
            .from(BUCKET)
            .createSignedUploadUrl(storagePath);

        if (signError) {
            console.error('[Upload-URL API] Signed URL error:', signError.message);
            return res.status(500).json({ error: 'Failed to create upload URL: ' + signError.message });
        }

        // Get the public URL for after upload completes
        const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
        const publicUrl = urlData?.publicUrl;

        console.log(`[Upload-URL API] ✅ Signed URL created for: ${storagePath} (${(fileSize / 1024 / 1024).toFixed(1)}MB, ${mimeType})`);

        return res.status(200).json({
            success: true,
            signedUrl: data.signedUrl,
            token: data.token,
            path: storagePath,
            publicUrl,
            type: isVideo ? 'video' : 'photo',
        });

    } catch (err) {
        console.error('[Upload-URL API] Error:', err.message);
        return res.status(500).json({ error: 'Upload URL generation failed: ' + err.message });
    }
}
