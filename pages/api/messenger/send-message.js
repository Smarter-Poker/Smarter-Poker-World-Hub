// API Route: Send a message (Security Hardened)
// pages/api/messenger/send-message.js

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// XSS Neutralizer (strips out <script> and dangerous attributes simply)
function sanitizeMessage(text) {
    if (!text) return text;
    // Strip <script> tags and their contents
    let clean = text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '[Removed Malicious Code]');
    // Strip inline event handlers like onerror=
    clean = clean.replace(/on\w+\s*=/gi, 'data-blocked=');
    return clean;
}

export default async function handler(req, res) {
  try {
      // 1. Enforce Token-Bucket Rate Limiter (30 requests / minute)
      if (!applyRateLimit(req, res, LIMITS.write)) return;

      if (req.method !== 'POST') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      if (!SUPABASE_SERVICE_ROLE_KEY) {
          return res.status(500).json({ success: false, error: 'Service key not configured' });
      }

      const { conversationId, content: rawContent } = req.body;

      if (!conversationId || !rawContent) {
          return res.status(400).json({ success: false, error: 'Missing conversationId or content' });
      }

      // 2. Payload Size Enforcement (Stop 10MB Base64 attacks)
      if (typeof rawContent !== 'string') {
          return res.status(400).json({ success: false, error: 'Invalid content type' });
      }

      if (rawContent.length > 2000) {
          return res.status(413).json({
              success: false,
              error: 'Payload too large',
              message: 'Messages cannot exceed 2,000 characters.'
          });
      }

      // 3. XSS Neutralization
      const content = sanitizeMessage(rawContent);

      const supabase = createClient(SUPABASE_URL.trim(), SUPABASE_SERVICE_ROLE_KEY);

      try {
          // 4. Auth Verification
          const token = req.headers.authorization?.replace('Bearer ', '');
          if (!token) return res.status(401).json({ success: false, error: 'Auth required' });

          const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
          if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

          const userId = user.id;

          // Verify participant access
          const { data: participant, error: partError } = await supabase
              .from('social_conversation_participants')
              .select('id')
              .eq('conversation_id', conversationId)
              .eq('user_id', userId)
              .maybeSingle();

          if (partError || !participant) {
              return res.status(403).json({ success: false, error: 'Not a participant in this conversation' });
          }

          // 5. Secure RPC execution using Service Role
          const { data: msgId, error } = await supabase.rpc('fn_send_message', {
              p_conversation_id: conversationId,
              p_sender_id: userId,
              p_content: content,
          });

          if (error) throw error;

          return res.json({ success: true, msgId, content: content });
      } catch (e) {
          console.error('[ANTIGRAVITY] Send Message Exception:', e);
          return res.status(500).json({ success: false, error: e.message });
      }

  } catch (err) {
    console.error('[API Error]', err);
    return res.status(500).json({ success: false, error: err.message || 'Internal server error' });
  }
}
