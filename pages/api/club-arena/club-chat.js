import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * /api/club-arena/club-chat
 * 
 * GET  ?clubId=X&limit=50 — List recent messages
 * POST { clubId, message }  — Send a message
 * 
 * Auth: Bearer token (must be active club member)
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
const { applyRateLimit } = require('../../../src/lib/poker-engine/RateLimiter');
import { reportApiError } from '../../../src/lib/sentryWrap';
const { checkIdempotency } = require('../../../src/lib/club-arena/idempotency');

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
        _supabase = createClient(url, key);
    }
    return _supabase;
}

export default async function handler(req, res) {
  // Idempotency guard — prevents duplicate mutations from laggy mobile networks
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
    if (checkIdempotency(req, res)) return;
  }

  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Auth required' });

    const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
    const user = authData?.user;
    if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

    // GET: List messages
    if (req.method === 'GET') {
      if (!applyRateLimit(req, res, 'club-arena/club-chat-read')) return;

      const safeQ = (v) => v ? (Array.isArray(v) ? String(v[0]) : typeof v === 'object' ? null : String(v)) : v;
      const clubId = safeQ(req.query.clubId);
      if (!clubId) return res.status(400).json({ error: 'clubId required' });

      // Verify membership
      const { data: member } = await getSupabase()
        .from('club_members').select('role').eq('club_id', clubId).eq('user_id', user.id).eq('status', 'active').maybeSingle();
      if (!member) return res.status(403).json({ error: 'Not a member of this club' });

      try {
        const limit = Math.min(parseInt(req.query.limit) || 50, 100);
        const { data: messages, error } = await getSupabase()
          .from('club_chat')
          .select('id, user_id, message, display_name, avatar_url, message_type, created_at')
          .eq('club_id', clubId)
          .order('created_at', { ascending: false })
          .limit(limit);

        if (error) throw error;

        return res.json({ success: true, messages: (messages || []).reverse() });
      } catch (err) {
        console.warn('[club-chat GET]', err);
        return res.status(500).json({ error: 'Failed to load messages' });
      }
    }

    // POST: Send message
    if (req.method === 'POST') {
      if (!applyRateLimit(req, res, 'club-arena/club-chat-write')) return;

      const { clubId, message } = req.body;
      if (!clubId || !message?.trim()) return res.status(400).json({ error: 'clubId and message required' });

      const trimmed = message.trim().slice(0, 500);

      // Verify membership
      const { data: member } = await getSupabase()
        .from('club_members').select('role')
        .eq('club_id', clubId).eq('user_id', user.id).eq('status', 'active').maybeSingle();
      if (!member) return res.status(403).json({ error: 'Not a member of this club' });

      // Get display name
      const { data: profile } = await getSupabase()
        .from('profiles').select('display_name, username, avatar_url').eq('id', user.id).maybeSingle();

      try {
        const { data: msg, error } = await getSupabase().from('club_chat').insert({
          club_id: clubId,
          user_id: user.id,
          message: trimmed,
          display_name: profile?.display_name || profile?.username || 'Player',
          avatar_url: profile?.avatar_url,
          message_type: 'message',
        }).select('id, created_at').maybeSingle();

        if (error) throw error;

        return res.json({ success: true, messageId: msg.id, createdAt: msg.created_at });
      } catch (err) {
        console.warn('[club-chat POST]', err);
        return res.status(500).json({ error: 'Failed to send message' });
      }
    }

    return res.status(405).json({ error: 'GET or POST only' });

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
