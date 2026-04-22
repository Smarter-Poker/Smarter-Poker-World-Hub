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
import { createClient } from '../../../src/lib/supabaseServerClient';
import { requireAuth } from '../../../src/lib/auth-middleware';
import { reportApiError } from '../../../src/lib/sentryWrap';

import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

const BUCKET = 'social-media';
const MAX_VIDEO_SIZE = 5 * 1024 * 1024 * 1024; // 5GB — Supabase Pro max, no practical limit
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;        // 10MB for images

const ALLOWED_TYPES = [
    'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml',
    'video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo',
    'video/x-m4v', 'video/3gpp', 'video/3gpp2', 'video/hevc',
    'video/x-matroska',
];

// Fallback MIME sniffer — iOS Photo Library sometimes returns empty file type
const EXT_MIME_MAP = {
    mp4: 'video/mp4', mov: 'video/quicktime', m4v: 'video/x-m4v',
    avi: 'video/x-msvideo', webm: 'video/webm',
    '3gp': 'video/3gpp', '3g2': 'video/3gpp2',
    hevc: 'video/hevc', mkv: 'video/x-matroska',
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    gif: 'image/gif', webp: 'image/webp',
};

function sniffMimeFromExt(fileName) {
    const ext = (fileName || '').split('.').pop().toLowerCase();
    return EXT_MIME_MAP[ext] || null;
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
      if (!applyRateLimit(req, res, LIMITS.upload)) return;
    }

      if (req.method !== 'POST') {
          return res.status(405).json({ success: false, error: 'POST only' });
      }

      const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
      const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

      if (!supabaseUrl || !serviceKey) {
          return res.status(500).json({ success: false, error: 'Server configuration error' });
      }


      // ── Auth: verify JWT identity ──
      const user = await requireAuth(req, res);
      if (!user) return;

      try {
          const { fileName, fileSize, folder, prefix } = req.body || {};
          // mimeType may be empty from iOS Photo Library — sniff from extension as fallback
          let mimeType = (req.body?.mimeType || '').split(';')[0].trim(); // strip codec suffix
          if (!mimeType && fileName) mimeType = sniffMimeFromExt(fileName) || '';
          // If client sent generic octet-stream (iOS fallback), try to upgrade via extension
          if (mimeType === 'application/octet-stream' && fileName) {
              const sniffed = sniffMimeFromExt(fileName);
              if (sniffed) mimeType = sniffed;
          }

          if (!fileName || !fileSize || !mimeType) {
              return res.status(400).json({ success: false, error: 'Missing required fields: fileName, fileSize, mimeType' });
          }

          // Validate file type
          if (!ALLOWED_TYPES.includes(mimeType)) {
              return res.status(400).json({ success: false, error: `File type not allowed: ${mimeType}` });
          }

          // Validate file size based on type
          const isVideo = mimeType.startsWith('video/');
          const maxSize = isVideo ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE;
          if (fileSize > maxSize) {
              const maxMB = Math.round(maxSize / 1024 / 1024);
              return res.status(400).json({
                  success: false, error: `File too large (max ${maxMB}MB for ${isVideo ? 'video' : 'image'})`
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
          const { data, error: signError } = await getSupabase().storage
              .from(BUCKET)
              .createSignedUploadUrl(storagePath);

          if (signError) {
              console.warn('[Upload-URL API] Signed URL error:', signError.message);
              return res.status(500).json({ success: false, error: 'Failed to create upload URL: ' + signError.message });
          }

          // Build the full absolute PUT URL.
          // createSignedUploadUrl returns data.signedUrl as a relative path like
          // "/object/upload/sign/bucket/path?token=..." — the client must PUT to
          // the full Supabase Storage URL, not the app origin.
          const rawSignedPath = data.signedUrl; // may already be absolute or relative
          const fullSignedUrl = rawSignedPath.startsWith('http')
              ? rawSignedPath
              : `${supabaseUrl}/storage/v1${rawSignedPath}`;

          // Get the public URL for after upload completes
          const { data: urlData } = getSupabase().storage.from(BUCKET).getPublicUrl(storagePath);
          const publicUrl = urlData?.publicUrl;

          return res.status(200).json({
              success: true,
              signedUrl: fullSignedUrl,
              token: data.token,
              path: storagePath,
              publicUrl,
              type: isVideo ? 'video' : 'photo',
          });

      } catch (err) {
          console.warn('[Upload-URL API] Error:', err.message);
          return res.status(500).json({ success: false, error: 'Upload URL generation failed: ' + err.message });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
