/**
 * Social Media Upload API — Server-side file upload proxy
 * 
 * POST /api/social/upload  (multipart/form-data)
 *   - file: The file to upload (image or video)
 *   - folder: Optional subfolder (e.g. 'photos', 'videos', 'club-posts', 'covers', 'logos')
 *   - prefix: Optional path prefix (e.g. user ID or page ID)
 * 
 * Returns: { success: true, url: '...public URL...' }
 * 
 * Uses the service role key to bypass RLS — the client never needs direct storage access.
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { IncomingForm } from 'formidable';
import fs from 'fs';

import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { getServerUser } from '../../../src/lib/serverAuth';

export const config = {
    api: {
        bodyParser: false, // Required for multipart/form-data
        responseLimit: '50mb',
    },
    maxDuration: 60, // Allow up to 60 seconds for large video uploads
};

const BUCKET = 'social-media';
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const ALLOWED_TYPES = [
    'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml',
    'video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo',
];

export default async function handler(req, res) {
  if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  }

    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'POST only' });
    }

    const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
    const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

    if (!supabaseUrl || !serviceKey) {
        return res.status(500).json({ success: false, error: 'Server configuration error' });
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // ── Auth: verify JWT identity (check BEFORE parsing large file body) ──
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: 'Auth required' });
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

    try {
        const form = new IncomingForm({
            maxFileSize: MAX_FILE_SIZE,
            keepExtensions: true,
        });

        const { fields, files } = await new Promise((resolve, reject) => {
            form.parse(req, (err, fields, files) => {
                if (err) reject(err);
                else resolve({ fields, files });
            });
        });

        // formidable v3+ wraps fields/files in arrays
        const file = Array.isArray(files.file) ? files.file[0] : files.file;
        const folder = Array.isArray(fields.folder) ? fields.folder[0] : (fields.folder || '');
        const prefix = Array.isArray(fields.prefix) ? fields.prefix[0] : (fields.prefix || '');

        if (!file) {
            return res.status(400).json({ success: false, error: 'No file provided' });
        }

        // Validate file type
        const mimeType = file.mimetype || file.type || '';
        if (!ALLOWED_TYPES.includes(mimeType)) {
            return res.status(400).json({ success: false, error: `File type not allowed: ${mimeType}` });
        }

        // Validate file size
        if (file.size > MAX_FILE_SIZE) {
            return res.status(400).json({ success: false, error: `File too large (max ${MAX_FILE_SIZE / 1024 / 1024}MB)` });
        }

        // Build storage path
        const ext = file.originalFilename?.split('.').pop() || 'bin';
        const timestamp = Date.now();
        const safeName = (file.originalFilename || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
        const pathParts = [folder, prefix, `${timestamp}_${safeName}`].filter(Boolean);
        const storagePath = pathParts.join('/');

        // Read file buffer
        const fileBuffer = fs.readFileSync(file.filepath);

        // Upload to Supabase Storage using service role (bypasses RLS)
        const { data, error: uploadError } = await supabase.storage
            .from(BUCKET)
            .upload(storagePath, fileBuffer, {
                contentType: mimeType,
                upsert: false,
            });

        // Clean up temp file
        try { fs.unlinkSync(file.filepath); } catch (e) { /* ignore */ }

        if (uploadError) {
            console.error('[Upload API] Storage upload error:', uploadError.message);
            return res.status(500).json({ success: false, error: 'Upload failed: ' + uploadError.message });
        }

        // Get public URL
        const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
        const publicUrl = urlData?.publicUrl;

        if (!publicUrl) {
            return res.status(500).json({ success: false, error: 'Failed to get public URL' });
        }

        const isVideo = mimeType.startsWith('video/');

        return res.status(200).json({
            success: true,
            url: publicUrl,
            type: isVideo ? 'video' : 'photo',
            path: storagePath,
            size: file.size,
            mimeType,
        });

    } catch (err) {
        console.error('[Upload API] Error:', err.message);
        return res.status(500).json({ success: false, error: 'Upload failed: ' + err.message });
    }
}
