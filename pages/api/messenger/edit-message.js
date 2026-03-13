// API Route: Edit a message (5-minute window, Security Hardened)
// pages/api/messenger/edit-message.js

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const EDIT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

function sanitizeMessage(text) {
    if (!text) return text;
    let clean = text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '[Removed Malicious Code]');
    clean = clean.replace(/on\w+\s*=/gi, 'data-blocked=');
    return clean;
}

export default async function handler(req, res) {
  try {
      if (!applyRateLimit(req, res, LIMITS.write)) return;

      if (req.method !== 'POST') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      if (!SUPABASE_SERVICE_ROLE_KEY) {
          return res.status(500).json({ success: false, error: 'Service key not configured' });
      }

      const { messageId, content: rawContent } = req.body;

      if (!messageId || !rawContent) {
          return res.status(400).json({ success: false, error: 'Missing messageId or content' });
      }

      if (typeof rawContent !== 'string' || rawContent.length > 2000) {
          return res.status(413).json({ success: false, error: 'Payload too large', message: 'Messages cannot exceed 2,000 characters.' });
      }

      const content = sanitizeMessage(rawContent);
      const supabase = createClient(SUPABASE_URL.trim(), SUPABASE_SERVICE_ROLE_KEY);

      try {
          // Auth
          const token = req.headers.authorization?.replace('Bearer ', '');
          if (!token) return res.status(401).json({ success: false, error: 'Auth required' });

          const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
          if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

          // Fetch the message
          const { data: msg, error: msgErr } = await supabase
              .from('social_messages')
              .select('id, sender_id, created_at, is_deleted')
              .eq('id', messageId)
              .maybeSingle();

          if (msgErr || !msg) {
              return res.status(404).json({ success: false, error: 'Message not found' });
          }

          // Ownership check
          if (msg.sender_id !== user.id) {
              return res.status(403).json({ success: false, error: 'You can only edit your own messages' });
          }

          // Deleted check
          if (msg.is_deleted) {
              return res.status(400).json({ success: false, error: 'Cannot edit a deleted message' });
          }

          // 5-minute window check
          const createdAt = new Date(msg.created_at).getTime();
          const now = Date.now();
          if (now - createdAt > EDIT_WINDOW_MS) {
              return res.status(400).json({ success: false, error: 'Edit window expired', message: 'Messages can only be edited within 5 minutes of sending.' });
          }

          // Update the message
          const { error: updateErr } = await supabase
              .from('social_messages')
              .update({ content, updated_at: new Date().toISOString() })
              .eq('id', messageId);

          if (updateErr) throw updateErr;

          return res.json({ success: true, content });
      } catch (e) {
          console.error('[ANTIGRAVITY] Edit Message Exception:', e);
          return res.status(500).json({ success: false, error: e.message });
      }

  } catch (err) {
    console.error('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: err.message || 'Internal server error' });
  }
}
