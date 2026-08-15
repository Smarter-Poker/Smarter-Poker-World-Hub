import { createClient } from '@supabase/supabase-js';
const { sanitizeNote } = require('../../../src/lib/club-arena/sanitize');
const { isUUID } = require('../../../src/lib/club-arena/validate');
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';
const { checkIdempotency } = require('../../../src/lib/club-arena/idempotency');

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!key) {
            console.warn('[chat] SUPABASE_SERVICE_ROLE_KEY not set — refusing to start with anon key');
            throw new Error('Server misconfiguration: missing service role key');
        }
        _supabase = createClient(url, key);
    }
    return _supabase;
}

// ─── In-memory idempotency for chat POST (lightweight, no external dependency) ─
const _chatIdemCache = new Map();
const CHAT_IDEM_TTL = 5000; // 5 seconds — prevents rapid double-tap
function isDuplicateChatPost(userId, clubId, message) {
    const key = `${userId}:${clubId}:${message}`;
    const now = Date.now();
    if (_chatIdemCache.has(key) && now - _chatIdemCache.get(key) < CHAT_IDEM_TTL) {
        return true;
    }
    _chatIdemCache.set(key, now);
    // Lazy cleanup
    if (_chatIdemCache.size > 500) {
        for (const [k, ts] of _chatIdemCache) {
            if (now - ts > CHAT_IDEM_TTL) _chatIdemCache.delete(k);
        }
    }
    return false;
}

/**
 * Chat API — persists table chat messages to club_chat table.
 *
 * POST: save a new message (auth required, idempotency guard, input sanitized)
 * GET:  load last 50 messages for a table (auth required, membership verified)
 */
export default async function handler(req, res) {
  // Idempotency guard — prevents duplicate mutations from laggy mobile networks
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
    if (checkIdempotency(req, res)) return;
  }

  if (!applyRateLimit(req, res, LIMITS.write)) return;
  try {
    // ─── Auth: required for ALL methods ────────────────────────
    const authHeader = req.headers.authorization;
    let userId = null;
    if (authHeader?.startsWith('Bearer ')) {
        try {
            const { data: authData } = await getSupabase().auth.getUser(authHeader.split(' ')[1]);
            const user = authData?.user;
            userId = user?.id;
        } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
    }
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    if (req.method === 'GET') {
      const tableId = req.query.tableId;
      if (!tableId) return res.status(400).json({ error: 'tableId required' });

      // Validate tableId format
      if (!isUUID(tableId)) return res.status(400).json({ error: 'Invalid tableId format' });

      // ─── Membership check: verify user belongs to this club ───
      // The tableId is used as club_id in club_chat (table chat uses club scope)
      const { data: member } = await getSupabase()
          .from('club_members')
          // 2026-08-15 CHECK 13 fix: club_members has no `id` column (composite
          // club_id+user_id identity) — selecting it 42703'd, member came back
          // null, and EVERY club chat request answered 403 'Not a member'.
          .select('user_id')
          .eq('club_id', tableId)
          .eq('user_id', userId)
          .maybeSingle();

      if (!member) return res.status(403).json({ error: 'Not a member of this club' });

      try {
        const { data, error } = await getSupabase()
          .from('club_chat')
          .select('id, user_id, display_name, message, message_type, created_at')
          .eq('club_id', tableId)
          .order('created_at', { ascending: true })
          .limit(50);

        if (error) return res.status(500).json({ error: 'Failed to load messages' });
        return res.status(200).json({ messages: data || [] });
      } catch (err) {
        return res.status(500).json({ error: 'Failed to load messages' });
      }
    }

    if (req.method === 'POST') {
      const { message, displayName, clubId } = req.body;
      if (!message || !clubId) return res.status(400).json({ error: 'message and clubId required' });

      // Validate clubId format
      if (!isUUID(clubId)) return res.status(400).json({ error: 'Invalid clubId format' });

      // ─── Idempotency: prevent double-tap message spam ────────
      const sanitizedMessage = sanitizeNote(message, 500);
      if (!sanitizedMessage) return res.status(400).json({ error: 'Message cannot be empty' });

      if (isDuplicateChatPost(userId, clubId, sanitizedMessage)) {
          return res.status(200).json({ success: true, deduplicated: true });
      }

      // ─── Membership check: verify user belongs to this club ───
      const { data: member } = await getSupabase()
          .from('club_members')
          // 2026-08-15 CHECK 13 fix: club_members has no `id` column (composite
          // club_id+user_id identity) — selecting it 42703'd, member came back
          // null, and EVERY club chat request answered 403 'Not a member'.
          .select('user_id')
          .eq('club_id', clubId)
          .eq('user_id', userId)
          .maybeSingle();

      if (!member) return res.status(403).json({ error: 'Not a member of this club' });

      // Sanitize display name
      const safeDisplayName = sanitizeNote(displayName, 100) || 'Player';

      try {
        const { data, error } = await getSupabase()
          .from('club_chat')
          .insert({
            club_id: clubId,
            user_id: userId,
            display_name: safeDisplayName,
            message: sanitizedMessage,
            message_type: 'message',
          })
          .select('id')
          .maybeSingle();

        if (error) return res.status(500).json({ error: 'Failed to send message' });
        return res.status(200).json({ success: true, id: data?.id });
      } catch (err) {
        return res.status(500).json({ error: 'Failed to send message' });
      }
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[chat API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
