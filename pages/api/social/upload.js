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
import { requireAuth } from '../../../src/lib/auth-middleware';
import { IncomingForm } from 'formidable';
import fs from 'fs';
import { reportApiError } from '../../../src/lib/sentryWrap';

import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

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
    'image/png', 'image/jpeg', 'image/gif', 'image/webp', // svg removed: stored-XSS vector on the public bucket

    // iPhone Photos default formats — added 2026-04-29 to match upload-url.js
    'image/heic', 'image/heif',
    'video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo',
    'video/x-m4v', 'video/3gpp', 'video/3gpp2', 'video/hevc', 'video/x-matroska',
];

// Extension fallback for iOS Photo Library (same as upload-url.js)
const EXT_MIME_MAP = {
    mp4: 'video/mp4', mov: 'video/quicktime', m4v: 'video/x-m4v',
    avi: 'video/x-msvideo', webm: 'video/webm',
    '3gp': 'video/3gpp', '3g2': 'video/3gpp2',
    hevc: 'video/hevc', mkv: 'video/x-matroska',
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    gif: 'image/gif', webp: 'image/webp',
    heic: 'image/heic', heif: 'image/heif',  // iPhone Photos
};
function sniffMime(file) {
    let mime = (file.mimetype || file.type || '').split(';')[0].trim();
    if (!mime && file.originalFilename) {
        const ext = file.originalFilename.split('.').pop().toLowerCase();
        mime = EXT_MIME_MAP[ext] || '';
    }
    return mime;
}


let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

export default async function handler(req, res) {
  try {
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


      // ── Auth: verify JWT identity (check BEFORE parsing large file body) ──
      const user = await requireAuth(req, res);
      if (!user) return;

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
          // SECURITY: Always use the authenticated user's ID as the storage prefix.
          const prefix = user.id;

          if (!file) {
              return res.status(400).json({ success: false, error: 'No file provided' });
          }

          // Validate file type — use sniffMime to handle iOS empty/codec-suffixed types
          const mimeType = sniffMime(file);
          if (!ALLOWED_TYPES.includes(mimeType)) {
              return res.status(400).json({ success: false, error: `File type not allowed: ${mimeType}` });
          }

          // Validate file size
          if (file.size > MAX_FILE_SIZE) {
              return res.status(400).json({ success: false, error: `File too large (max ${MAX_FILE_SIZE / 1024 / 1024}MB)` });
          }

          // Build storage path
          // AUDIT-MAX-4 (2026-05-03): Date.now() + same filename collision
          // hazard. See upload-url.js for the same fix. 6-char random suffix
          // makes path collision-free.
          const ext = file.originalFilename?.split('.').pop() || 'bin';
          const timestamp = Date.now();
          const rand = Math.random().toString(36).slice(2, 8);
          const safeName = (file.originalFilename || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
          const pathParts = [folder, prefix, `${timestamp}_${rand}_${safeName}`].filter(Boolean);
          const storagePath = pathParts.join('/');

          // Read file buffer
          const fileBuffer = fs.readFileSync(file.filepath);

          // Upload to Supabase Storage using service role (bypasses RLS).
          // upsert: true matches upload-url.js — protects against retries to the
          // same timestamped path (rare but possible on flaky networks).
          const { data, error: uploadError } = await getSupabase().storage
              .from(BUCKET)
              .upload(storagePath, fileBuffer, {
                  contentType: mimeType,
                  upsert: true,
              });

          // Clean up temp file
          try { fs.unlinkSync(file.filepath); } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }

          if (uploadError) {
              console.warn('[Upload API] Storage upload error:', uploadError.message);
              return res.status(500).json({ success: false, error: 'Upload failed: ' + uploadError.message });
          }

          // Get public URL
          const { data: urlData } = getSupabase().storage.from(BUCKET).getPublicUrl(storagePath);
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
          console.warn('[Upload API] Error:', err.message);
          return res.status(500).json({ success: false, error: 'Upload failed: ' + err.message });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
