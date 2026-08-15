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

// Bucket allowlist — NEVER trust client blindly
const ALLOWED_BUCKETS = ['social-media', 'stories'];
const DEFAULT_BUCKET = 'social-media';

const MAX_VIDEO_SIZE = 5 * 1024 * 1024 * 1024; // 5GB — Supabase Pro max (social-media bucket)
const MAX_STORY_VIDEO_SIZE = 50 * 1024 * 1024; // 50MB — stories bucket config
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;        // 10MB for images

const ALLOWED_TYPES = [
    'image/png', 'image/jpeg', 'image/gif', 'image/webp', // svg removed: stored-XSS vector on the public bucket

    // iPhone Photos default formats — accepted at the bucket layer 2026-04-29.
    // NOTE: render natively on Safari/iOS but NOT on Chrome/Firefox desktop.
    // Server-side conversion to JPEG is a follow-up in .memory/SUMMARY.md.
    'image/heic', 'image/heif',
    'video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo',
    'video/x-m4v', 'video/3gpp', 'video/3gpp2', 'video/hevc',
    'video/x-matroska',
    'audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/wav',
    'audio/x-m4a', 'audio/aac',
];

// Fallback MIME sniffer — iOS Photo Library sometimes returns empty file type
const EXT_MIME_MAP = {
    mp4: 'video/mp4', mov: 'video/quicktime', m4v: 'video/x-m4v',
    avi: 'video/x-msvideo', webm: 'video/webm',
    '3gp': 'video/3gpp', '3g2': 'video/3gpp2',
    hevc: 'video/hevc', mkv: 'video/x-matroska',
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    gif: 'image/gif', webp: 'image/webp',
    heic: 'image/heic', heif: 'image/heif',  // iPhone Photos
    // Audio
    webm_audio: 'audio/webm', ogg: 'audio/ogg', mp3: 'audio/mpeg',
    m4a: 'audio/x-m4a', aac: 'audio/aac', wav: 'audio/wav',
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
          const { fileName, fileSize, folder } = req.body || {};
          // SECURITY: Always use the authenticated user's ID as the storage prefix.
          // Never trust the client-supplied prefix — it could spoof another user's namespace.
          const prefix = user.id;
          // Bucket: strict allowlist — default to social-media
          const requestedBucket = req.body?.bucket || DEFAULT_BUCKET;
          const BUCKET = ALLOWED_BUCKETS.includes(requestedBucket) ? requestedBucket : DEFAULT_BUCKET;
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

          // Validate file size based on type and bucket
          const isVideo = mimeType.startsWith('video/');
          const isAudio = mimeType.startsWith('audio/');
          // Stories bucket has a 50MB hard cap (Supabase bucket config)
          const maxSize = isVideo
              ? (BUCKET === 'stories' ? MAX_STORY_VIDEO_SIZE : MAX_VIDEO_SIZE)
              : isAudio
              ? 25 * 1024 * 1024  // 25MB for audio files
              : MAX_IMAGE_SIZE;
          if (fileSize > maxSize) {
              const maxMB = Math.round(maxSize / 1024 / 1024);
              return res.status(400).json({
                  success: false, error: `File too large (max ${maxMB}MB for ${isVideo ? 'video' : isAudio ? 'audio' : 'image'} in ${BUCKET})`
              });
          }


          // Build storage path
          // AUDIT-MAX-4 (2026-05-03 Pass 2 finding): Date.now() alone is NOT
          // collision-free. Two simultaneous uploads from the same user with
          // the same filename in the same millisecond (rare but possible —
          // double-tab uploads, batch picks of identically-named files) end
          // up with the SAME storagePath. Combined with `upsert: true` on
          // the signed URL, the second PUT silently overwrites the first
          // and both posts then reference the same public URL with whichever
          // content finished last. Real data-corruption vector. Add a 6-char
          // random suffix to make the path collision-free under any rate.
          const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
          const timestamp = Date.now();
          const rand = Math.random().toString(36).slice(2, 8);
          const uniqueName = `${timestamp}_${rand}_${safeName}`;
          // Stories: flat path — stories/{userId}/{timestamp}_{rand}_{name}
          // Social-media: grouped by type — {type}/{prefix}/{timestamp}_{rand}_{name}
          const storagePath = BUCKET === 'stories'
              ? [folder || 'stories', prefix, uniqueName].filter(Boolean).join('/')
              : [(isVideo ? (folder || 'videos') : isAudio ? (folder || 'audio') : (folder || 'photos')), prefix, uniqueName].filter(Boolean).join('/');

          // Create a presigned upload token. { upsert: true } makes the token's
          // claim match the client's `x-upsert: true` header so retries to the
          // same path don't fail with "Asset already exists" after a partial
          // upload. createSignedUploadUrl returns BOTH a single-shot signedUrl
          // (for small-file PUT, used by thumbnailUploader) and a token (used
          // as x-signature on the TUS resumable path for videos/large files).
          const { data: signData, error: signError } = await getSupabase().storage
              .from(BUCKET)
              .createSignedUploadUrl(storagePath, { upsert: true });

          if (signError) {
              console.warn('[Upload-URL API] Signed URL error:', signError.message);
              return res.status(500).json({ success: false, error: 'Failed to create upload token: ' + signError.message });
          }

          // Get the public URL for after upload completes
          const { data: urlData } = getSupabase().storage.from(BUCKET).getPublicUrl(storagePath);
          const publicUrl = urlData?.publicUrl;

          // TUS endpoint — direct storage hostname required for large files (bypasses API gateway)
          const tusEndpoint = supabaseUrl.includes('.supabase.co')
              ? supabaseUrl.replace('.supabase.co', '.storage.supabase.co') + '/storage/v1/upload/resumable'
              : `${supabaseUrl}/storage/v1/upload/resumable`;

          return res.status(200).json({
              success: true,
              tusEndpoint,
              token: signData.token,         // presigned token — used as x-signature on TUS chunks
              signedUrl: signData.signedUrl, // single-shot PUT URL — used by thumbnailUploader for small files
              path: storagePath,
              publicUrl,
              type: isVideo ? 'video' : isAudio ? 'audio' : 'photo',
              bucket: BUCKET,
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
