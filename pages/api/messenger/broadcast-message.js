// API Route: Broadcast a message to all members (P2-3)
// pages/api/messenger/broadcast-message.js

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// XSS Neutralizer
function sanitizeMessage(text) {
    if (!text) return text;
    let clean = text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '[Removed]');
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

      const { content: rawContent, clubId } = req.body;

      if (!rawContent || !clubId) {
          return res.status(400).json({ success: false, error: 'Missing content or clubId' });
      }

      if (typeof rawContent !== 'string' || rawContent.length > 2000) {
          return res.status(413).json({ success: false, error: 'Payload too large or invalid' });
      }

      const content = `📢 ${sanitizeMessage(rawContent)}`;

      const supabase = createClient(SUPABASE_URL.trim(), SUPABASE_SERVICE_ROLE_KEY);

      try {
          // Auth Verification
          const token = req.headers.authorization?.replace('Bearer ', '');
          if (!token) return res.status(401).json({ success: false, error: 'Auth required' });

          const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
          if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

          // Verify sender is club owner or admin
          const { data: membership } = await supabase
              .from('club_members')
              .select('role')
              .eq('club_id', clubId)
              .eq('user_id', user.id)
              .maybeSingle();

          if (!membership || !['owner', 'admin', 'manager'].includes(membership.role)) {
              return res.status(403).json({ success: false, error: 'Only club owners/admins can broadcast' });
          }

          // Get all conversations the sender participates in for this club context
          const { data: conversations } = await supabase
              .from('social_conversation_participants')
              .select('conversation_id')
              .eq('user_id', user.id);

          if (!conversations || conversations.length === 0) {
              return res.json({ success: true, sent: 0, message: 'No conversations to broadcast to' });
          }

          let sent = 0;
          const errors = [];

          for (const conv of conversations) {
              try {
                  const { error } = await supabase.rpc('fn_send_message', {
                      p_conversation_id: conv.conversation_id,
                      p_sender_id: user.id,
                      p_content: content,
                  });
                  if (!error) sent++;
                  else errors.push({ conv: conv.conversation_id, error: error.message });
              } catch (e) {
                  errors.push({ conv: conv.conversation_id, error: e.message });
              }
          }

          return res.json({ success: true, sent, total: conversations.length, errors: errors.length > 0 ? errors : undefined });
      } catch (e) {
          console.error('[BROADCAST] Exception:', e);
          return res.status(500).json({ success: false, error: e.message });
      }

  } catch (err) {
    console.error('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: err.message || 'Internal server error' });
  }
}
