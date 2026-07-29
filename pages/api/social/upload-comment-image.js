/**
 * Upload Comment Image API — Server-side proxy for Supabase Storage
 * ═══════════════════════════════════════════════════════════════════
 * Handles image uploads for social media comments.
 * Uses service role key to bypass storage RLS.
 * Returns the public URL of the uploaded image.
 * ═══════════════════════════════════════════════════════════════════
 */

import { IncomingForm } from 'formidable';
import fs from 'fs';
import { reportApiError } from '../../../src/lib/sentryWrap';
// 2026-07-29: this handler calls getServerUserWithFallback (line ~46) but the
// import was missing, so every comment-image upload threw ReferenceError at
// runtime on top of the wrong bucket name below. Restore the canonical import.
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';

function getSupabase() {
  const { createClient } = require('@supabase/supabase-js');
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export const config = {
  api: {
    bodyParser: false, // Required for multipart form data
  },
};

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const sb = getSupabase();

    // Verify JWT — extract user ID for path scoping
    const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
    if (authErr || !authData?.user) {
      return res.status(401).json({ error: 'Invalid auth token' });
    }
    const userId = authData.user.id;

    const form = new IncomingForm({
      maxFileSize: MAX_FILE_SIZE,
      keepExtensions: true,
    });

    const [, files] = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        else resolve([fields, files]);
      });
    });

    const file = files.image?.[0] || files.image;
    if (!file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    if (!ALLOWED_TYPES.includes(file.mimetype)) {
      return res.status(400).json({ error: 'Invalid file type. Allowed: JPEG, PNG, GIF, WebP' });
    }

    if (file.size > MAX_FILE_SIZE) {
      return res.status(400).json({ error: 'File too large. Maximum 5MB.' });
    }

    // Read file and upload to Supabase Storage
    const fileBuffer = fs.readFileSync(file.filepath);
    const ext = file.originalFilename?.split('.').pop() || 'jpg';
    const path = `comment-images/${userId}/${Date.now()}.${ext}`;

    const { error: uploadErr } = await sb.storage
      .from('social-media')
      .upload(path, fileBuffer, {
        contentType: file.mimetype,
        cacheControl: '31536000',
        upsert: false,
      });

    if (uploadErr) {
      console.warn('[CommentUpload] Storage error:', uploadErr);
      return res.status(500).json({ error: 'Upload failed' });
    }

    const { data: { publicUrl } } = sb.storage
      .from('social-media')
      .getPublicUrl(path);

    // Clean up temp file
    try { fs.unlinkSync(file.filepath); } catch (e) { console.warn('[App] Handled exception:', e); }

    return res.status(200).json({ success: true, url: publicUrl });
  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[CommentUpload] Error:', err);
    return res.status(500).json({ error: 'Upload failed' });
  }
}
